# Cloudinary Migration — Design

**Status:** Approved design, ready to implement
**Last updated:** 2026-07-19 (aligned with the post-architecture-rework codebase: DAL boundary, `app/features/` layout, Image-owned FKs)

Move image **storage, serving, and transforms** out of the app and onto **Cloudinary**. Today images live as blobs in SQLite ([`Image.blob Bytes`](../../prisma/schema.prisma)) and are served through [`/file/:fileId`](../../app/routes/file.$fileId.tsx) with on-the-fly `sharp` → webp transforms — the documented source of the Fly memory pressure ([staging-memory-investigation](../staging-memory-investigation/findings.md)). After this migration the app stores only a Cloudinary `public_id` + metadata per image, delivery URLs with `f_auto,q_auto,w_…` do all transform work on Cloudinary's CDN, and the entire runtime `sharp` path (plus its jemalloc / `MALLOC_ARENA_MAX` / semaphore mitigations) is deleted. Cloudinary is confined behind a small **provider abstraction** mirroring the mail layer ([`app/features/mail/`](../../app/features/mail/mail.server.ts)), so dev/CI/e2e run against a hermetic `local` provider and the vendor SDK never leaks into the app.

---

## 1. Goal & scope

### Goals

- **Offload transforms + serving**: components emit `res.cloudinary.com` delivery URLs; no image bytes or transform work touch the Fly VMs at request time.
- **Offload storage**: replace `Image.blob` with a provider key (`public_id`) + metadata; backfill existing prod/staging images; eventually drop the blob column and shrink the SQLite file.
- **Static marketing images too**: the landing-page hero/accent images move to Cloudinary, retiring the build-time [`optimize-images.ts`](../../app/optimize-images.ts) pipeline, `public/*.webp` artifacts, and `generateSrcSet` — after which `sharp` leaves `package.json` entirely.
- **Delete provider assets with their owners**: the DB-row orphan bug is already fixed — since the FK rework (commit `23c97e5`) `Image` owns both `eventId` and `boardMemberId` (`@unique`, cascade from the owner), and `updateEvent`/`updateBoardMember` delete the old row in their transactions. This migration extends that to the Cloudinary asset via **capture-and-destroy** (§3.4): models return the doomed `storageKey`, the feature layer destroys the asset after commit.
- **Blur-up loading experience** (à la Kent C. Dodds' [Building an awesome image loading experience](https://kentcdodds.com/blog/building-an-awesome-image-loading-experience)): a tiny blurred placeholder renders instantly server-side, the full image fades in over it, and reserved aspect ratios keep CLS at zero (§3.3).
- **Gallery-friendly foundation**: the `Image` model becomes a standalone asset record (provider key + intrinsic width/height), so a future gallery feature is additive. No gallery-specific structure (ordering, join tables) is built now.
- **Hermetic dev & CI**: `IMAGE_PROVIDER=local` keeps Cypress/unit tests offline and secret-free, following the `MAIL_PROVIDER` pattern.

### Non-goals

- The **gallery feature** itself — many-images-per-entity relations, `position` fields, gallery UI. The current 1:1 Event↔Image and BoardMember↔Image relations stay.
- **Direct browser → Cloudinary uploads.** Uploads keep flowing through the existing multipart actions and are proxied server-side. Uploads are rare, admin-only, and ≤ 3 MB; the memory problem was transforms, not uploads. The provider interface is the seam where a signed direct-upload flow plugs in later (see §9).
- **Strict transformations / signed delivery URLs.** Assets are public covers/portraits; the URL vocabulary we emit is tiny. Revisit only if transformation-credit abuse ever shows up.
- `User.image` (better-auth avatar) — already a plain remote-URL string, untouched.
- The CMS block model beyond swapping image `src`s to Cloudinary URLs.

---

## 2. Decision record

| Decision             | Choice                                                                                                                                                                                 | Why                                                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider             | Cloudinary free tier                                                                                                                                                                   | 25 credits/mo (1 credit = 1k transforms or 1 GB storage or 1 GB bandwidth) is comfortable for low-hundreds of images; best all-in-one (storage + transform + CDN) fit vs Cloudflare Images / imgix / Bunny                                                                                           |
| Upload path          | **Server-side proxy now, direct browser upload later**                                                                                                                                 | Keeps the existing multipart forms and Zod validation untouched; admin-only ≤ 3 MB uploads are negligible load. The provider interface isolates the change when direct upload becomes worth it (gallery era)                                                                                         |
| Vendor isolation     | `ImageStorageProvider` abstraction, `cloudinary` \| `local`                                                                                                                            | Mirrors the proven `MailProvider` pattern; dev/CI/e2e stay offline and secret-free; SDK confined to one module                                                                                                                                                                                       |
| Module placement     | New **`app/features/images/`**; the existing `app/features/uploads/` is folded into it in the cleanup phase                                                                            | `uploads` currently mixes the multipart parse seam with the sharp/webp serving stack this migration deletes; building clean in `images` and migrating the survivors afterwards avoids churning code that's about to die                                                                              |
| Layering             | Provider calls live in the **feature layer**; models stay Prisma-only and exchange scalars                                                                                             | The DAL boundary is ESLint-enforced: only `app/models/**` imports Prisma, models must not import features, and model interfaces take/return scalars or domain types ([data-access-layer](../data-access-layer/design.md))                                                                            |
| Delivery URLs        | Plain URL strings, **no** `@cloudinary/url-gen` / `@cloudinary/react`                                                                                                                  | For `f_auto,q_auto,w_X,c_fill,g_auto` a template literal is enough; avoids a client bundle dependency. Official docs endorse plain URLs in `srcset` for SSR                                                                                                                                          |
| Environments         | **One cloud, folder per env** (`CLOUDINARY_FOLDER_PREFIX` = `prod` \| `staging`)                                                                                                       | Single free account, one credit pool, one set of secrets. Accepted risk: staging code could touch prod assets — mitigated by the prefix being the only namespace the app writes to                                                                                                                   |
| Data model           | Keep the `Image` table; swap `blob` for `storageKey` + `version` + intrinsic `width`/`height`                                                                                          | A standalone asset record is the gallery-ready shape; metadata enables correct `srcset` aspect ratios without decoding bytes                                                                                                                                                                         |
| Deletion             | **Capture-and-destroy**: model reads the doomed `storageKey` inside its transaction and returns it; the feature layer calls `provider.destroy(key, { invalidate: true })` after commit | The 1:1 `@unique` FKs make identification exact — no staleness heuristics. DB commit first, then provider destroy (a leaked asset on crash is acceptable; a broken DB reference is not). An Admin-API prefix-diff sweep remains available as a rare ops-level mop-up, not app code                   |
| Blur-up placeholders | Base64 data URL generated **once** at upload/backfill time, stored on `Image.blurDataUrl`                                                                                              | Per-request generation would put a Cloudinary fetch in the render path; ~1–2 KB per row is trivial in SQLite. Local provider degrades to a neutral background (no sharp to blur with)                                                                                                                |
| Cutover              | **Two-phase**: backfill + switch serving while `blob` stays as safety net; drop `blob` + `VACUUM` in a later release                                                                   | Rollback during the verification window is a config flip, not a volume-snapshot restore                                                                                                                                                                                                              |
| Backfill             | Repo `tsx` script run via `fly ssh console`, staging first                                                                                                                             | Same operational pattern as `prisma/seed.ts`; idempotent and resumable; no temporary admin routes on a 256 MB VM                                                                                                                                                                                     |
| Account              | To be created (Phase 0 checklist)                                                                                                                                                      | New accounts are in _dynamic folder mode_: use `asset_folder` for organization; `public_id` is decoupled from folders                                                                                                                                                                                |
| Client config        | Root loader gains explicit `imageProvider` / `cloudinaryCloudName` fields                                                                                                              | There is no bulk `window.ENV` mechanism in this app — the root loader returns named fields, surfaced via [`app/shared/root-data.ts`](../../app/shared/root-data.ts). Cloud name is public by nature (it's in every delivery URL)                                                                     |
| MIME validation      | Add a server-side allowlist to [`imageFileSchema`](../../app/shared/image.ts)                                                                                                          | **Reverses a recorded decision**: the shared schema deliberately validates size only, with `VALID_IMAGE_TYPES` feeding the `accept` attribute. That was fine when bytes stayed in our DB; forwarding uploads to a third party warrants the stricter gate. One change covers events and board members |

---

## 3. Architecture

```
            app/features/images/
   ┌──────────────────────────────────────────┐
   │ types.ts        ImageStorageProvider      │
   │ image-storage.server.ts  (provider pick)  │
   │ providers/cloudinary.server.ts  (SDK here)│
   │ providers/local.server.ts   (fs storage)  │
   │ blur-placeholder.server.ts                │
   └──────────────────────────────────────────┘
        ▲ store()/destroy()          ▲ getImageUrl(image, {w,h,fit})
        │                            │      (app/shared/image.ts)
  admin upload actions          all rendering components
  via withParsedImageForm       (CoverImage → event-card, event-view,
  (dinners, board members);      admin lists; OptimizedImage direct;
  capture-and-destroy flows      OG meta, CMS hero/image blocks)
        │                            │
        ▼                            ▼
  ┌───────────────┐   local    ┌──────────────────────────────┐
  │ SQLite: Image  │◀──────────│ /file/:fileId                 │
  │ storageKey,    │  serving  │  local → stream original      │
  │ version, w, h  │           │  cloudinary → 302 to CDN URL  │
  └───────────────┘            └──────────────────────────────┘
```

- **Upload** (unchanged surface): multipart action → [`withParsedImageForm`](../../app/features/uploads/image-form-action.server.ts) parses the upload ([`parseImageFormData`](../../app/features/uploads/image-upload.server.ts)) and Zod-validates (3 MB, MIME allowlist — new, see §2) → the `onSuccess` seam calls `provider.store(file, { folder })` → the model creates the `Image` row from the returned `{ storageKey, version, width, height, blurDataUrl }` scalars. [`fileToImageData`](../../app/models/image.server.ts) and its `{ contentType, blob }` shape retire; `Image.blob` is no longer written. Four routes touch this seam: `admin.dinners.new`, `admin.dinners.$dinnerId_.edit`, `admin.board-members.new`, `admin.board-members.$userId.edit`.
- **Serving**: components call `getImageUrl(image, opts)`. Cloudinary provider → direct `res.cloudinary.com` URL (browser fetches from the CDN; the app is not in the path). Local provider → `/file/:fileId` streaming the original from disk (no transforms — dev doesn't need them).
- **Legacy URLs**: [`/file/:fileId`](../../app/routes/file.$fileId.tsx) survives as a thin route: local serving in dev, and a `302` to the Cloudinary URL for any old links still out in the wild (OG scrapers, cached pages). The transform internals — the dimension-ladder/query handling, the `sharp` semaphore ([`image-transform.server.ts`](../../app/utils/image-transform.server.ts)), and the webp cache ([`file-cache-storage.server.ts`](../../app/features/uploads/file-cache-storage.server.ts)) — are deleted. The route keeps its no-auth-cost behavior (it never reads the lazy user context — keep it that way).
- **Deletion** — capture-and-destroy, split across the layers (§3.4): models capture the `storageKey` inside the transaction and return it; the calling feature layer destroys the provider asset after commit.

### 3.1 Provider interface

```ts
// app/features/images/types.ts — deliberately minimal
export interface StoredImage {
  storageKey: string; // Cloudinary public_id, or local file key
  version?: number; // Cloudinary version → immutable versioned URLs
  width?: number;
  height?: number;
  blurDataUrl?: string; // generated at store time (cloudinary only)
}

export interface ImageStorageProvider {
  store(file: File, opts: { folder: string }): Promise<StoredImage>;
  destroy(storageKey: string): Promise<void>;
}
```

- `cloudinary.server.ts`: `uploader.upload_stream` (buffer in, response out — width/height/version come back for free), `uploader.destroy(publicId, { invalidate: true })`. `folder` maps to `asset_folder: "${CLOUDINARY_FOLDER_PREFIX}/${folder}"` (dynamic folder mode). Requires `cloudinary` npm ≥ 2.10 (2.7.0 fixed a parameter-injection issue — do not go lower).
- `local.server.ts`: fs storage under `IMAGE_UPLOAD_FOLDER`, key = image id; `destroy` removes the file. Reuses [`app/shared/fs-file-storage.server.ts`](../../app/shared/fs-file-storage.server.ts) — today that module only exports `createFsTempStorage` (mkdtemp-based), so it grows a persistent-folder factory. Intrinsic dimensions are omitted (local `srcset` degrades gracefully).
- Selection in `image-storage.server.ts` by `IMAGE_PROVIDER` (`local` | `cloudinary`), with `tiny-invariant` on the Cloudinary env vars when selected, wrapped in `singleton()` — same shape as [`createMailProvider`](../../app/features/mail/mail.server.ts).

### 3.2 URL building & `OptimizedImage`

`getImageUrl(image, { width, height, fit })` is a pure, isomorphic function:

```ts
// cloudinary
`https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,c_fill,g_auto,w_${w},h_${h}/v${image.version}/${image.storageKey}`
// local
`/file/${image.id}`;
```

- It lives in [`app/shared/image.ts`](../../app/shared/image.ts) — the client-safe shared bucket, per convention — replacing today's `getImageUrl(id)` / `buildImageTransformUrl(id, opts)` pair there. `RESPONSIVE_IMAGE_WIDTHS = [432, 648, 864, 1080]` and `imageFileSchema` stay in that module.
- `f_auto,q_auto` picks format (avif/webp) and quality per browser; `c_fill,g_auto` replaces today's `fit=cover`; versioned URLs make CDN invalidation a non-issue on overwrite.
- [`OptimizedImage`](../../app/components/optimized-image.tsx) is already a standalone component (extracted from the route during the architecture rework), wrapped by [`CoverImage`](../../app/components/cover-image.tsx); both stay in `app/components/` (cross-feature components live there, not in a feature). They keep the breakpoints and `srcset` shape but emit Cloudinary URLs and grow the blur-up layers (§3.3). Consumers: `CoverImage` in [`event-card`](../../app/features/events/components/event-card.tsx), [`event-view`](../../app/features/events/components/event-view.tsx), `admin._index`, `admin.dinners._index`; `OptimizedImage` directly in `admin.board-members`. 5 variants × low-hundreds of images ≈ one-time transformation cost in the low thousands — a fraction of the monthly credit pool, then CDN-cached.
- Cloud name + provider reach the client as explicit root-loader fields surfaced through [`app/shared/root-data.ts`](../../app/shared/root-data.ts) (public values only; the API secret never leaves the server).
- The OG meta image in [`dinners_.$dinnerId.tsx`](../../app/routes/dinners_.$dinnerId.tsx) (built via [`withOpenGraphUrls`](../../app/shared/meta.ts) + `domainUrl` today) becomes an absolute Cloudinary URL directly — no `domainUrl` prefixing needed for the cloudinary provider.

### 3.3 Loading experience — blur-up placeholders

Adapted from [Kent C. Dodds' image loading write-up](https://kentcdodds.com/blog/building-an-awesome-image-loading-experience), fitted to our dynamic (upload-time, not build-time) world:

- **Placeholder generation** happens once, server-side, when the asset is created: after `provider.store` uploads to Cloudinary, it fetches the derived variant `w_100,q_auto,f_webp,e_blur:1000` (~1 KB), base64-encodes it, and returns it as `blurDataUrl` — persisted on the `Image` row alongside the other metadata. The backfill script does the same for existing images. No render-path fetches, no per-request work.
- **Rendering** (`OptimizedImage`/`CoverImage` grow into this; Kent's `BlurrableImage` shape): a container with a reserved aspect ratio (from the stored intrinsic `width`/`height` → zero CLS) layers (1) the inline base64 `<img>` stretched `object-fit: cover` — a single placeholder works for every crop, since under heavy blur an aspect mismatch is imperceptible; (2) a `backdrop-filter: blur()` overlay to smooth the upscaled 100px pixels; (3) the real `<img srcset …>` at `opacity: 0`, transitioned to `opacity: 1` on load. The load check must handle already-cached images (`img.complete` in the effect, or an inline `onload`), or the fade never fires on repeat views.
- **Degradation:** `blurDataUrl` is nullable. Local provider (dev/CI) and any not-yet-backfilled row render a neutral placeholder background instead — no sharp, no network, same layout behavior.
- **Static hero/accent images** have no DB row; a small server helper `getBlurDataUrl(publicId)` with a module-level in-memory cache (one Cloudinary fetch per server boot per asset) supplies the landing-page loader — the hero is the LCP element, so it benefits most.

### 3.4 Deletion — capture-and-destroy

Since the FK rework, deletion identification is exact: `Image.eventId` and `Image.boardMemberId` are both `@unique` FKs on `Image`, so "the image belonging to the entity being deleted/replaced" is a single indexed lookup — no staleness heuristics. But the same rework means deletes happen via DB cascade (`deleteEvent`, `deleteBoardMember`) or `tx.image.deleteMany` (`updateEvent`, `updateBoardMember`), so the app never sees the `storageKey` unless it reads it first. Hence:

- **Models** ([`event.server.ts`](../../app/models/event.server.ts), [`board-member.server.ts`](../../app/models/board-member.server.ts)): inside the existing transaction, `findUnique` the owned image's `storageKey` before the delete/`deleteMany`, and return it as a plain scalar (fits the DAL rule — scalars out, no Prisma shapes). Affected: `deleteEvent`, `deleteEventsInTx`, `updateEvent` (replace path), `deleteBoardMember` (currently a plain cascade-reliant `delete`), `updateBoardMember`.
- **Feature layer** (the route action / `features/images` orchestration): after the model call returns (transaction committed), call `provider.destroy(storageKey)` for each returned key. Ordering invariant: DB commit first — a leaked Cloudinary asset on crash is acceptable, a dangling DB reference is not.
- **Residual gap**: a crash between commit and destroy leaks the asset (the row — and with it the key — is gone). Accepted; volume is admin-only and tiny. If it ever matters, the mop-up is an ops-level prefix-diff: list assets under the env's folder prefix via the Cloudinary Admin API, diff against `SELECT storageKey FROM Image`, destroy the unmatched. Not app code, not scheduled.
- The existing [`sweep:orphan-images`](../../app/sweep-orphan-images.ts) script addresses _historical_ DB-row orphans (pre-FK-rework leftovers); it is not an ongoing mechanism this design depends on.

---

## 4. Data model

```prisma
model Image {
  id          String  @id @default(cuid())
  altText     String?
  contentType String            // kept: local provider serving + upload validation record
  storageKey  String?           // Cloudinary public_id / local key; required post-backfill
  version     Int?              // Cloudinary asset version
  width       Int?              // intrinsic pixels, from upload response
  height      Int?
  blurDataUrl String?           // base64 blur-up placeholder (~1–2 KB), generated at store/backfill time
  blob        Bytes?            // legacy — nullable in phase 1, DROPPED in phase 3

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  boardMember   BoardMember? @relation(fields: [boardMemberId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  boardMemberId String?      @unique
  event         Event?       @relation(fields: [eventId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  eventId       String?      @unique
}
```

- This matches the current post-FK-rework shape (both owner FKs live on `Image`; `Event` and `BoardMember` carry only the `image Image?` back-relation — there is no `Event.imageId` scalar). The phase 1 migration only changes: `blob` → nullable; add `storageKey`, `version`, `width`, `height`, `blurDataUrl`. New uploads write no blob. Phase 3 drops `blob` (+ `VACUUM`).
- Model read paths flatten the relation to `imageId` via `EVENT_IMAGE_INCLUDE`/`flattenImageId` in `event.server.ts` (same pattern in `listBoardMembers`); those projections grow the new metadata columns so components can build URLs and aspect ratios without extra queries.
- Gallery outlook: because `Image` is now a self-contained asset record, a future gallery adds a join table (or a nullable `galleryId`) — no change to this migration's schema is presupposed.

---

## 5. Static marketing images

- The hero/accent originals (`public/*-original.*`) are uploaded **once** to a shared `static/` asset folder (not env-prefixed — they're identical across envs) with fixed public_ids (`static/hero-image`, `static/accent-image`). The originals stay in the repo as source of truth.
- [`_index.tsx`](../../app/routes/_index.tsx) block config swaps `src: "/hero-image.jpg"` for the Cloudinary public_id; the CMS image/hero block views build their `srcset` via `getImageUrl` widths instead of [`generateSrcSet`](../../app/features/cms/blocks/utils.ts)'s `-{width}.webp` suffix convention. (The CMS blocks survive as presentational components used statically by `_index.tsx` — there is no admin CMS.)
- Delivery needs no credentials, so dev renders these from Cloudinary regardless of `IMAGE_PROVIDER` (offline dev shows an empty hero — acceptable). Their blur-up placeholders come from the in-memory-cached `getBlurDataUrl` helper (§3.3), not the DB.
- Retired: `app/optimize-images.ts`, the `optimize:images` npm script, generated `public/hero-image-*.{webp,jpg}` + accent variants, `generateSrcSet`.

---

## 6. Migration & cutover

**Phase 1 (release):** schema migration + provider layer + all app flows switched to the provider. Dev/CI run `local`; staging/prod initially keep working because… nothing serves from Cloudinary until rows have a `storageKey` — so this release also ships the **backfill script** and the `/file` route keeps serving `blob` rows sharp-free (original bytes, no transform) as the interim path for not-yet-backfilled rows.

**Backfill script** (`scripts/backfill-images-to-cloudinary.ts`, run with `npx tsx` via `fly ssh console`, staging → verify → prod):

- Selects `Image` rows `WHERE storageKey IS NULL`, uploads each `blob` via `upload_stream` into `${PREFIX}/dinners` or `${PREFIX}/board-members` (derived from which owner FK — `eventId` / `boardMemberId` — is set on the row), writes back `storageKey`/`version`/`width`/`height`/`blurDataUrl` (the placeholder is fetched from the freshly uploaded asset, §3.3).
- Idempotent and resumable (re-run skips rows that already have a key); logs per-row progress; a handful of MB total, minutes of runtime, negligible VM load.
- Also uploads the `static/` hero/accent assets on first run (`overwrite: false` makes re-runs no-ops).

**Phase 2 (config flip):** set `IMAGE_PROVIDER=cloudinary` + Cloudinary secrets on staging, verify (images render, srcset variants load, OG image resolves, upload/replace/delete round-trips, memory graphs), then prod.

**Phase 3 (cleanup release, after a comfortable verification window):** drop `blob`, `VACUUM` the SQLite file (frees the blob pages — DB is small, so free-space requirements are trivial), delete the sharp transform stack and its mitigations:
[`image-transform.server.ts`](../../app/utils/image-transform.server.ts), [`file-cache-storage.server.ts`](../../app/features/uploads/file-cache-storage.server.ts), [`image-route.server.ts`](../../app/features/uploads/image-route.server.ts) (+ its tests), the `/file` transform internals, `sharp` from `package.json`, jemalloc `LD_PRELOAD` ([Dockerfile:49](../../Dockerfile)), `MALLOC_ARENA_MAX` ([fly.toml](../../fly.toml)), `optimize-images.ts` + artifacts. This phase also **folds the surviving `app/features/uploads/` files** (`image-upload.server.ts`, `image-form-action.server.ts`) **into `app/features/images/`** and deletes the `uploads` feature directory.

**Rollback:** during phases 1–2 the blobs are untouched — rollback is `IMAGE_PROVIDER` back to the blob-serving path / previous release. After phase 3, rollback means volume snapshot (hence the verification window).

---

## 7. Environments & config

| Variable                   | local dev / CI | staging                                | prod         | Secret?                        |
| -------------------------- | -------------- | -------------------------------------- | ------------ | ------------------------------ |
| `IMAGE_PROVIDER`           | `local`        | `cloudinary`                           | `cloudinary` | no (`fly.toml [env]` / `.env`) |
| `CLOUDINARY_CLOUD_NAME`    | —              | shared cloud                           | shared cloud | no                             |
| `CLOUDINARY_API_KEY`       | —              | ✓                                      | ✓            | Fly secret                     |
| `CLOUDINARY_API_SECRET`    | —              | ✓                                      | ✓            | Fly secret                     |
| `CLOUDINARY_FOLDER_PREFIX` | `dev` (unused) | `staging`                              | `prod`       | no                             |
| `IMAGE_UPLOAD_FOLDER`      | temp default   | kept (upload staging + local provider) | kept         | no                             |

- `.env.example` documents each var in the established commented style, marking the `CLOUDINARY_*` group as "only needed when `IMAGE_PROVIDER=cloudinary`". (No image vars exist there today.)
- GitHub Actions CI needs **no** new secrets (`IMAGE_PROVIDER=local`).
- Free-tier budget sanity check: ≪ 1 GB storage, one-time backfill + transform generation well under a few credits, steady-state bandwidth for a community site trivially small. Set the console's usage alert at ~50% anyway.

---

## 8. Testing

- **Cypress e2e** ([admin-dinner-uploads](../../cypress/e2e/admin-dinner-uploads.cy.ts), [admin-board-member-uploads](../../cypress/e2e/admin-board-member-uploads.cy.ts)) run against the `local` provider — same assertions (row counts, 3 MB Zod error, 4 MB handler error, replace flows). The old manual orphan cleanup is gone; today's `afterEach` deletes via `runUploadDbCommand("delete-dinner", { extraImageIds })` where `extraImageIds` defensively captures replaced covers. Since `updateEvent` now deletes the old row in-transaction, add an explicit replace-flow assertion that the old image row is **gone**, then drop the defensive `extraImageIds` capture. [`upload-test-records.ts`](../../cypress/support/upload-test-records.ts) grows the new columns.
- **Unit tests**: update the existing suites that cover code this migration reworks or deletes ([`image.server.test.ts`](../../app/models/image.server.test.ts), [`image-route.server.test.ts`](../../app/features/uploads/image-route.server.test.ts), [`image-form-action.server.test.ts`](../../app/features/uploads/image-form-action.server.test.ts)); add new ones for `getImageUrl` output (both providers, all transform options), provider selection/invariant behavior, server-side MIME/size validation, and `OptimizedImage` blur-up states (placeholder vs null `blurDataUrl`, fade-on-load incl. the cached-image path).
- **Seed** ([prisma/seed.ts](../../prisma/seed.ts) `seedEvent`, ~L94) currently passes `{ contentType, blob }` into `createEvent`; it switches to `provider.store(prisma/default.jpg)` + the `StoredImage` scalars — works offline under `local`.

---

## 9. Later: direct browser uploads (out of scope, but the seam)

When the gallery arrives (more images, larger files, possibly non-admin uploaders), server-side proxying stops being the right trade. The upgrade path, unchanged from this design's shape: an auth-gated resource route returns `cloudinary.utils.api_sign_request` signatures (valid 1 h); the browser POSTs `FormData` straight to `api.cloudinary.com/v1_1/<cloud>/image/upload`; the form then submits the returned `public_id`/`version` to the normal action, which verifies and writes the `Image` row. Only the _upload_ half of the provider changes — storage schema, URL building, deletion, and the local provider are already compatible.
