# Cloudinary Migration — Implementation Plan

Companion to [design.md](design.md). Phases are shippable increments; phases 1 and 3 are separate releases by design (two-phase cutover). Aligned 2026-07-19 with the post-architecture-rework codebase — new code must respect the DAL boundary (only `app/models/**` imports Prisma; ESLint-enforced) and the `app/features/` / `app/shared/` conventions.

> **Status 2026-07-19:** Phase 1 is implemented and verified on `feat/cloudinary-images`; the live smoke test passed and the static assets are uploaded. **See [rollout.md](rollout.md)** for the current runbook (remaining staging/prod steps), decisions that supersede items below, and corrections to these docs found during implementation.

## Phase 0 — Account & config setup (manual, no code)

- [x] Create the Cloudinary account (free plan). Note the **cloud name** (`mokupona`); the account will be in _dynamic folder mode_.
- [x] Generate API key + secret (console → Settings → Access Keys).
- [x] ~~Set a usage alert at ~50% of the 25 monthly credits.~~ **Resolved 2026-07-25: not possible on the free plan** — custom thresholds are Enterprise-only. Relying on Cloudinary's built-in defaults instead (admin email at 90% and 100% of quota); no custom monitoring.
- [x] Fly secrets on **both** apps — **staging done 2026-07-19, prod done 2026-07-25**:
      `fly secrets set CLOUDINARY_CLOUD_NAME=… CLOUDINARY_API_KEY=… CLOUDINARY_API_SECRET=… CLOUDINARY_FOLDER_PREFIX=… [-a <staging-app>]`
- [x] ~~`fly.toml [env]`: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_FOLDER_PREFIX`~~ **Superseded (rollout.md): all `CLOUDINARY_*` values live as per-app Fly secrets, never in fly.toml.** `IMAGE_UPLOAD_FOLDER=/data/image-uploads` is in `[env]`; `IMAGE_PROVIDER` stays **unset until the Phase 2 flip** — Phase 1 code defaults safely.
- [x] `.env` / `.env.example`: document `IMAGE_PROVIDER`, `CLOUDINARY_*` group ("only needed when `IMAGE_PROVIDER=cloudinary`").

## Phase 1 — Provider layer + schema + app rewiring (release 1)

**Schema**

- [x] Prisma migration: `Image.blob` → `Bytes?`, `contentType` stays, add `storageKey String?`, `version Int?`, `width Int?`, `height Int?`, `blurDataUrl String?`. (The owner FKs `eventId`/`boardMemberId` already live on `Image` since the FK rework — no relation changes.)

**New feature module `app/features/images/`** (design §2 "Module placement": `features/uploads` is folded in later, Phase 3)

- [x] `types.ts` — `StoredImage`, `ImageStorageProvider` (design §3.1).
- [x] `providers/cloudinary.server.ts` — `cloudinary` npm **≥ 2.10**; `upload_stream` with `asset_folder: "${CLOUDINARY_FOLDER_PREFIX}/${folder}"`; `destroy(publicId, { invalidate: true })`.
- [x] `providers/local.server.ts` — fs storage under `IMAGE_UPLOAD_FOLDER`, key = image id. Extend [`app/shared/fs-file-storage.server.ts`](../../app/shared/fs-file-storage.server.ts) with a persistent-folder factory (today it only exports `createFsTempStorage`).
- [x] `image-storage.server.ts` — provider pick by `IMAGE_PROVIDER` (default `local`), `tiny-invariant` the `CLOUDINARY_*` vars when `cloudinary`, wrapped in `singleton()` — mirror [`createMailProvider`](../../app/features/mail/mail.server.ts).
- [x] `blur-placeholder.server.ts` — fetch `w_100,q_auto,f_webp,e_blur:1000` variant → base64 data URL (design §3.3); used by the cloudinary provider's `store()`, the backfill script, and a module-level-cached `getBlurDataUrl(publicId)` for static assets.

**Shared URL builder & components** (stay in `app/shared/` / `app/components/` per convention)

- [x] Rework [`app/shared/image.ts`](../../app/shared/image.ts): replace `getImageUrl(id)` + `buildImageTransformUrl(id, opts)` with the isomorphic `getImageUrl(image, { width, height, fit })` (design §3.2). `RESPONSIVE_IMAGE_WIDTHS` and `imageFileSchema` stay here. Update the OG meta usage in [`dinners_.$dinnerId.tsx`](../../app/routes/dinners_.$dinnerId.tsx) (absolute Cloudinary URL, no `domainUrl` prefixing under the cloudinary provider).
- [x] Rework [`optimized-image.tsx`](../../app/components/optimized-image.tsx) + [`cover-image.tsx`](../../app/components/cover-image.tsx) **in place** (already extracted from the route — no move needed): same breakpoints, Cloudinary/local URLs, plus the blur-up layers (design §3.3): aspect-ratio container, base64 placeholder `<img>` + backdrop-blur overlay, full image `opacity` fade on load (handle `img.complete` for cached images), neutral background when `blurDataUrl` is null. Consumers to update: `CoverImage` in [`event-card.tsx`](../../app/features/events/components/event-card.tsx), [`event-view.tsx`](../../app/features/events/components/event-view.tsx), `admin._index`, `admin.dinners._index`; direct `OptimizedImage` in `admin.board-members`.
- [x] Root loader ([`app/root.tsx`](../../app/root.tsx)) gains explicit `imageProvider` / `cloudinaryCloudName` fields, surfaced via [`app/shared/root-data.ts`](../../app/shared/root-data.ts) (there is no bulk `ENV` mechanism — named fields only).
- [x] Model read projections (`EVENT_IMAGE_INCLUDE`/`flattenImageId` in [`event.server.ts`](../../app/models/event.server.ts), `listBoardMembers` in [`board-member.server.ts`](../../app/models/board-member.server.ts)) grow the new metadata columns (`storageKey`, `version`, `width`, `height`, `blurDataUrl`) with explicit return types.

**Upload flows**

- [x] Rework the [`withParsedImageForm`](../../app/features/uploads/image-form-action.server.ts) `onSuccess` seam: call `provider.store(file, { folder })` in the feature layer, then pass the returned `StoredImage` scalars into the model `create`/`update` (no blob write). Retire [`fileToImageData`](../../app/models/image.server.ts) and the `ImageData` `{ contentType, blob }` shape. Touched routes: [`admin.dinners.new.tsx`](../../app/routes/admin.dinners.new.tsx), [`admin.dinners.$dinnerId_.edit.tsx`](../../app/routes/admin.dinners.$dinnerId_.edit.tsx), [`admin.board-members.new.tsx`](../../app/routes/admin.board-members.new.tsx), [`admin.board-members.$userId.edit.tsx`](../../app/routes/admin.board-members.$userId.edit.tsx).
- [x] Add the MIME allowlist (`jpeg/png/webp`) **server-side** to [`imageFileSchema`](../../app/shared/image.ts) — one change covers events + board members. Note: this reverses the recorded size-only decision in that file's comments (design §2); update the comment accordingly.

**Deletion — capture-and-destroy (design §3.4)**

- [x] [`event.server.ts`](../../app/models/event.server.ts): `deleteEvent` / `deleteEventsInTx` — `findUnique` the owned image's `storageKey` inside the transaction before the (cascade) delete; return it as a scalar. `updateEvent` replace path — capture the old key before the existing `tx.image.deleteMany`, return it.
- [x] [`board-member.server.ts`](../../app/models/board-member.server.ts): same for `deleteBoardMember` (currently a plain cascade-reliant `delete` — needs the capture added) and `updateBoardMember`.
- [x] Callers (route actions / `features/images` orchestration): `provider.destroy(key)` for each returned key **after** the model call returns. Ordering invariant: commit first.

**Serving route**

- [x] Slim [`file.$fileId.tsx`](../../app/routes/file.$fileId.tsx) (rewritten to streaming during the rework — re-anchor accordingly): `storageKey` + cloudinary → `302` to delivery URL; `storageKey` + local → stream file; legacy `blob`-only row → stream original bytes (**no sharp**). Delete the transform internals: `DIMENSION_LADDER`/`snapToDimensionLadder`/`w`/`h`/`fit` param handling, the semaphore usage from [`image-transform.server.ts`](../../app/utils/image-transform.server.ts), the webp cache usage from [`file-cache-storage.server.ts`](../../app/features/uploads/file-cache-storage.server.ts); rework/retire [`image-route.server.ts`](../../app/features/uploads/image-route.server.ts) + its test. Keep the route off the lazy user context (no auth cost — already true).

**Static images**

- [x] Swap hero/accent `src` in [`_index.tsx`](../../app/routes/_index.tsx) to `static/hero-image` / `static/accent-image` public_ids; the CMS hero/image block views ([`hero/view.tsx`](../../app/features/cms/blocks/hero/view.tsx), [`image/view.tsx`](../../app/features/cms/blocks/image/view.tsx)) build srcset via `getImageUrl`; delete [`generateSrcSet`](../../app/features/cms/blocks/utils.ts). Landing loader supplies hero/accent `blurDataUrl` via `getBlurDataUrl` (LCP element — blur-up matters most here).

**Backfill script**

- [x] `scripts/backfill-images-to-cloudinary.ts` (tsx): rows `WHERE storageKey IS NULL` → `upload_stream(blob)` into `${PREFIX}/dinners|board-members` (folder from whichever owner FK — `eventId`/`boardMemberId` — is set), write back key/version/width/height/blurDataUrl; idempotent; also uploads `static/` assets with `overwrite: false`.

**Tests & seed**

- [x] Cypress suites under `IMAGE_PROVIDER=local`. In [`admin-dinner-uploads.cy.ts`](../../cypress/e2e/admin-dinner-uploads.cy.ts): add a replace-flow assertion that the old image row is gone, then drop the defensive `extraImageIds` capture in the `afterEach` cleanup (the in-transaction delete makes it redundant); update [`upload-test-records.ts`](../../cypress/support/upload-test-records.ts) for the new columns.
- [x] Update existing unit tests touching reworked code: [`image.server.test.ts`](../../app/models/image.server.test.ts), [`image-route.server.test.ts`](../../app/features/uploads/image-route.server.test.ts), [`image-form-action.server.test.ts`](../../app/features/uploads/image-form-action.server.test.ts).
- [x] New unit tests: `getImageUrl` (both providers, all options), provider selection invariants, server-side MIME/size validation, capture-and-destroy return values, `OptimizedImage` blur-up behavior (placeholder render, null `blurDataUrl` fallback, fade incl. cached-image path).
- [x] [`prisma/seed.ts`](../../prisma/seed.ts) `seedEvent` (~L94): replace the `{ contentType, blob }` literal with `provider.store(default.jpg)` + `StoredImage` scalars.

## Phase 2 — Backfill & cutover (config only)

- [x] Deploy release 1 to staging; run backfill via `fly ssh console -a <staging-app>` → `npx tsx scripts/backfill-images-to-cloudinary.ts`. **Done 2026-07-20.**
- [x] Flip staging `IMAGE_PROVIDER=cloudinary`. Verify: pages render CDN images, srcset variants + OG image resolve, upload/replace/delete round-trips (asset disappears in the Cloudinary console), memory graphs flat during an image-heavy crawl. **Done 2026-07-20.**
- [x] Repeat on prod (backfill → flip → verify). Watch credit usage after the one-time transform generation. **Done 2026-07-25** (dev→main merged via PR #417, backfilled, flipped; /dinners and landing serve `res.cloudinary.com` URLs, no legacy `/file/` links).

## Phase 3 — Cleanup (release 2, after verification window) — **done 2026-07-25** (`chore/cloudinary-phase-3`)

- [x] Prisma migration: drop `Image.blob`; run `VACUUM` (via script or `fly ssh` sqlite3) to reclaim the file space.
- [x] Delete: [`image-transform.server.ts`](../../app/utils/image-transform.server.ts), [`file-cache-storage.server.ts`](../../app/features/uploads/file-cache-storage.server.ts), [`image-route.server.ts`](../../app/features/uploads/image-route.server.ts) + tests, the legacy blob-serving branch, `sharp` dependency, [`optimize-images.ts`](../../app/optimize-images.ts) + `optimize:images` script + generated `public/hero-image-*`/accent artifacts.
- [x] Fold the surviving `app/features/uploads/` files (`image-upload.server.ts`, `image-form-action.server.ts`) into `app/features/images/`; delete the `uploads` feature directory.
- [x] Retire the historical orphan-sweep if its job is done: check `sweep:orphan-images` (script + npm entry) — post-FK-rework, no new DB orphans can accrue.
- [x] Remove the memory mitigations: jemalloc `LD_PRELOAD` ([Dockerfile:49](../../Dockerfile)), `MALLOC_ARENA_MAX` ([fly.toml](../../fly.toml)). Note the change in [staging-memory-investigation/findings.md](../staging-memory-investigation/findings.md).
- [x] Keep `/file/:fileId` as the local-provider route + legacy 302 redirect.
- [x] Retire the completed backfill script — `backfillBlobRows` cannot compile once `Image.blob` is gone. Its static-asset upload is the only non-one-shot part; keep that as its own script so a fresh Cloudinary account can be seeded from the retained `public/*-original.*` files.

## Phase 3 appendix — the nullability/route cleanup — **done 2026-07-25**

Deliberately **not** part of the Phase 3 pass above: it kept `Image.storageKey`
nullable so the release stayed a pure deletion. Dropping `blob` makes a
null-key row unrenderable garbage, which turns the leftover nullability into
dead defensive surface.

**1. `storageKey` → `NOT NULL`** — done (the schema comment always anticipated
this)

- [x] Migration `20260725201500_require_image_storage_key`. The pre-check the
      plan asked for turned up **38 null-key rows on prod, 24 on staging, 2 in
      local dev** — every one of them an orphan (`eventId` and `boardMemberId`
      both null), i.e. the pre-FK-rework replace flow's abandoned rows that the
      retired `sweep:orphan-images` script used to clear. Nothing referenced
      them, which is why staging's phase 3 deploy dropped their bytes without
      anything breaking. The migration therefore opens with a **narrow** delete
      — orphaned AND keyless — and lets the table rebuild fail loudly on
      anything else, which was the original intent.
- [x] Ripple: `ImageUrlSource.storageKey` / `ImageMetadata.storageKey` lost
      `| null`, deleting the null branches in
      [`getImageUrl`](../../app/shared/image.ts), the `requireFound` on the key
      in [`file.$fileId.tsx`](../../app/routes/file.$fileId.tsx), and the "404s
      a keyless row" case in
      [`file-route.test.ts`](../../app/features/images/file-route.test.ts).
      `destroyImages` keeps its nullable input — a null there now means "the
      owner had no image", not "a legacy blob-only row".
- [x] The sibling test ("404s when the storage key has no local file")
      **stayed** — it pins 404-not-500 for a row whose file is missing from
      disk, which is reachable whenever a dev DB is restored from a
      Cloudinary-backed dump.
      **2. What is actually left of `/file/:fileId`** — **decided: `local` stays**

Under `cloudinary` + a NOT NULL `storageKey`, `getImageUrl` returns a
`res.cloudinary.com` URL for every row, so **the app stops emitting
`/file/:id` links entirely**. The route then serves exactly two callers:

- inbound legacy links (OG scrapers, cached pages, anything published before
  the cutover) → the 302 branch;
- the **local provider** → the streaming branch.

So the route cannot simply be deleted. The real question the follow-up has to
answer is _whether `local` stays a supported provider_, because that one
decision gates everything else:

| If `local` stays (status quo)                                                               | If `local` is dropped                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Route, `providers/local.server.ts`, `createFsFolderStorage`, `IMAGE_UPLOAD_FOLDER` all stay | All of them go, plus the provider-switch in `image-storage.server.ts`, `imageConfigFromEnv`, `ImageUrlSource.id` and the `/file/${id}` fallback |
| `Image.contentType` stays (it sets `Content-Type` on the streamed response)                 | `contentType` becomes dead — the CDN sets its own; drop the column too                                                                          |
| Route shrinks to the 302 + stream branches (already true after Phase 3)                     | Route degrades to a pure legacy redirect, deletable once the link window closes                                                                 |

**Constraint that settled it:** Cypress e2e and `npm run dev` both run with
`IMAGE_PROVIDER` unset (it defaults to `local`), and CI holds no Cloudinary
credentials. Replacing `local` with a fake was considered and rejected: the
`mocks/` MSW setup cannot do the job as it stands, because it runs as a
**separate process** (`node ./mocks/index.js &`), whereas `setupServer` only
patches HTTP inside its own process — so it currently intercepts nothing, and
mail is mocked at the app layer via `MAIL_PROVIDER=capture` instead. Making it
work would mean (a) loading an interceptor into all three processes that touch
storage — the app server, the Cypress node process where
`cypress/support/upload-test-records.ts` calls `storeImage`, and the seed —
with shared on-disk state so an upload made by `cy.task` is visible to the
server rendering the page, and (b) something to answer the browser's
`res.cloudinary.com` `<img>` requests, which a node-side mock cannot intercept
at all. That is a standalone fake-Cloudinary HTTP server, not a mock — strictly
more machinery than the local provider it would replace.

So the **left-hand column stands**: the route, `providers/local.server.ts`,
`createFsFolderStorage`, `IMAGE_UPLOAD_FOLDER` and `Image.contentType` all
stay. Revisit only if `local` ever stops paying for itself.

**3. The legacy 302 branch** — **kept.** It can go once published pre-cutover
`/file/:id` links have aged out of caches and scrapers. It is ~5 lines; there
is no cost to leaving it indefinitely, and no way to know the window has closed
except by watching for 404s on the route.

## Cross-cutting

- **Rollback:** phases 1–2 → flip `IMAGE_PROVIDER` back / redeploy previous release (blobs intact). Phase 3 onward → volume snapshot.
- **Ordering invariant:** DB commit before `provider.destroy`; a leaked Cloudinary asset on crash is acceptable, a dangling DB reference is not.
- **Layering invariant:** only `app/models/**` touches Prisma (ESLint-enforced); models exchange scalars/domain types and never import features; the Cloudinary SDK stays inside `app/features/images/providers/`.
- **CI:** no new secrets; `IMAGE_PROVIDER=local` in the workflow env if not already the default.
