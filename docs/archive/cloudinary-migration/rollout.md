# Cloudinary Migration — Rollout Status & Runbook

**Last updated:** 2026-07-25 · **Phases 1–3 and the appendix follow-up are code-complete.** Both envs live on Cloudinary (staging 2026-07-20, prod 2026-07-25); phase 3 is deployed on staging only. Steps 1–4 below are kept as the historical record of how the cutover ran — the only work left is [Deploying phase 3](#deploying-phase-3) to prod.

## Done

- **Phase 1 code** — complete on `feat/cloudinary-images` (~20 commits ahead of `origin/dev`, includes the 3 pre-existing local dev commits). All verification green: unit suite, lint, typecheck, full Cypress e2e (twice, offline under `IMAGE_PROVIDER=local`). A multi-agent review (6 dimensions, adversarial verification) confirmed 6 findings; all fixed (commit `56746a1`), notably:
  - production image now ships `scripts/`, `app/`, `tsconfig.json` and `tsx` (runtime dep) so the backfill can run via `fly ssh console`;
  - `fly.toml` sets `IMAGE_UPLOAD_FOLDER = "/data/image-uploads"` (volume) and the backfill grew a second pass that migrates window uploads (local `storageKey`, `version IS NULL`) to Cloudinary.
- **Live smoke test** (2026-07-19, `CLOUDINARY_FOLDER_PREFIX=dev`): store → versioned variant fetch 200 → destroy with invalidate → fresh variant 404. Blur placeholder ~0.5 KB.
- **Static assets uploaded** — `static/hero-image`, `static/accent-image` exist in the account (shared, non-env-prefixed; `overwrite: false` makes the backfill's static step a no-op). This closes the window where a freshly deployed env with a cloud name would 404 its hero.
- **Staging secrets set** (all four `CLOUDINARY_*`).
- **No-JS fallback** — `OptimizedImage` renders a full-opacity `<noscript>` image so no-JS visitors don't sit on the blur (commit `cf854fa`).

## Decisions taken during rollout (supersede the plan where they differ)

- **No `CLOUDINARY_*` values in `fly.toml`** — all four (`CLOUD_NAME`, `API_KEY`, `API_SECRET`, `FOLDER_PREFIX`) live as Fly **secrets** per app instead of `[env]` entries. The code reads plain env vars, so behavior is identical; prefix per app: `staging` / `prod`.
- `IMAGE_UPLOAD_FOLDER = "/data/image-uploads"` IS in `fly.toml [env]` (not a secret — it's a path on the mounted volume).
- Local dev may keep `CLOUDINARY_*` in `.env` (gitignored) — DB images still serve locally; only the static hero/accent render from the CDN (by design). Removing `CLOUDINARY_CLOUD_NAME` makes dev fully offline (neutral hero frame).

## Remaining steps

### 1. Ship release 1 to staging

1. Push `feat/cloudinary-images`, open a PR against `dev`, merge. CI (offline, no new secrets) gates, then auto-deploys staging on the `dev` push.
2. Verify release 1 is inert on staging: boot clean (`fly logs -a <staging-app>`), migration applied by `start.sh`, covers still render via `/file/:fileId`, hero/accent render from Cloudinary (secrets + statics already in place), an admin upload works (lands on `/data/image-uploads` with a local `storageKey`).

### 2. Backfill staging

```sh
fly ssh console -a <staging-app>
npx tsx scripts/backfill-images-to-cloudinary.ts
```

Idempotent/resumable; logs per row; migrates blob rows AND window uploads; static step is a no-op. Spot-check the Cloudinary console: `staging/dinners`, `staging/board-members`.

> Phase 3 retired this script (its blob pass cannot compile without `Image.blob`).
> Its static-asset upload survives as `scripts/upload-static-assets.ts` for
> seeding a fresh Cloudinary account.

### 3. Flip staging

```sh
fly secrets set IMAGE_PROVIDER=cloudinary -a <staging-app>   # restarts the app
```

Verify: pages emit `res.cloudinary.com` URLs with working srcset variants; blur-up renders; dinner OG image is an absolute Cloudinary URL; upload → replace → delete round-trips (asset appears/disappears in the console); `/file/:fileId` 302s for old links; memory flat during an image-heavy crawl; credit usage sane after one-time transform generation.

**Rollback at any point:** `fly secrets unset IMAGE_PROVIDER -a <staging-app>` — blobs are untouched until Phase 3.

### 4. Prod (after the staging soak, one merge)

1. **Before merging `dev` → `main`**: set the four `CLOUDINARY_*` secrets on prod (`fly secrets set … CLOUDINARY_FOLDER_PREFIX=prod`). At minimum the cloud name must exist or the landing hero renders as an empty frame after deploy. — **Done 2026-07-25.**
2. Merge `dev` → `main` → prod deploys release 1 (inert: blob serving continues; window uploads go to the volume). — **Done 2026-07-25 (PR #417).**
3. Backfill prod: `fly ssh console` → `npx tsx scripts/backfill-images-to-cloudinary.ts`. — **Done 2026-07-25.**
4. Flip prod: `fly secrets set IMAGE_PROVIDER=cloudinary`. Same verification list as staging. **Never flip before the secrets exist** — the provider invariants on boot and the app crashes. — **Done 2026-07-25; verified: /dinners covers and landing hero/accent serve `res.cloudinary.com` URLs, no legacy `/file/` links, health checks passing.** Prod is live on Cloudinary; Phase 3 waits for the verification window. Note: `GOOGLE_CLIENT_ID/SECRET` are still unset on prod, so the Google login buttons stay hidden until they're added (unrelated to images).
5. Usage alerts: **resolved 2026-07-25 — relying on Cloudinary's built-in defaults** (email to the account admin at 90% and 100% of quota). Custom thresholds (the originally planned ~50%) are Enterprise-only; no console setting exists for them on the free plan, and no custom monitoring is set up.

## Deploying phase 3

Phase 3 is **code-complete** on `chore/cloudinary-phase-3`: `Image.blob` dropped,
the sharp stack and memory mitigations deleted, `features/uploads` folded into
`features/images`, orphan sweep and the completed backfill script retired.
**Staging has it** (deployed 2026-07-25); prod does not yet.

The **appendix follow-up is also done** (2026-07-25) and rides along in the same
release: `storageKey` is now `NOT NULL`, `local` stays a supported provider, and
the legacy 302 stays. See implementation-plan.md's appendix for the reasoning.

Two things that migration adds to the deploy:

- It **deletes orphaned keyless `Image` rows** — 38 on prod, 24 on staging.
  They are the pre-FK-rework replace flow's abandoned rows; nothing has
  referenced them for a long time and no page renders them. On prod they still
  hold ~21.8 MB of blobs (of a 48.4 MB database file), so they are most of what
  `VACUUM` in step 3 will hand back.
- Prod goes from "blob column present" to "blob dropped **and** key required" in
  one deploy, since prod never received phase 3 on its own.

**This release is not rollback-safe by redeploy.** Phases 1–2 could be undone by
flipping `IMAGE_PROVIDER` back, because the blobs were still in the database.
After this migration they are gone — the only way back is a **volume snapshot**.

1. **Snapshot the prod volume first** (`fly volumes snapshots create <vol-id>`),
   and confirm it completed before deploying. Same for staging if you care about
   its data.
2. Deploy staging (merge into `dev`), let `start.sh` run `prisma migrate deploy`.
   Verify: boot clean, covers and hero/accent still render, an upload →
   replace → delete round-trip still works, `/file/:fileId` still 302s.
3. **Reclaim the freed space.** The migration rebuilds the `Image` table, which
   leaves the old blob pages as free pages _inside_ the database file — the file
   does not shrink on its own:

   ```sh
   fly ssh console -a <app>
   ls -l /data/sqlite.db          # note the size
   database-cli                   # sqlite3 $DATABASE_URL
   sqlite> VACUUM;
   sqlite> .quit
   ls -l /data/sqlite.db          # should be markedly smaller
   ```

   `VACUUM` needs free disk roughly equal to the final database size and holds a
   write lock for its duration — do it during a quiet window.

4. Repeat 1–3 on prod (merge `dev` → `main`).
5. **Watch memory for a day.** This release removes jemalloc (`LD_PRELOAD`) and
   `MALLOC_ARENA_MAX=2`, both of which existed only for sharp/libvips. sharp is
   gone, so the fragmentation they countered should be gone too — but the
   numbers in docs/staging-memory-investigation/findings.md were measured under
   the old workload, so confirm RSS stays flat rather than assuming it. Both
   knobs are one-line reverts.

## Later

- Optional hygiene: rotate the API key pair used during local testing (Settings → API Keys supports concurrent pairs).
- Drop the legacy 302 branch in `/file/:fileId` once pre-cutover links have aged out of caches and scrapers — no way to know except by watching for 404s on the route.

## Corrections to design.md / implementation-plan.md (found while implementing)

1. `app/features/uploads/image-route.server.ts` never existed post-architecture-rework — the loader lives in `app/routes/file.$fileId.tsx`; only the test file carried the old name (reworked in place).
2. The local provider's "key = image id" is unimplementable: `store()` runs before the Image row exists. Keys are provider-generated `folder/<uuid>`.
3. `IMAGE_UPLOAD_FOLDER` did not previously exist in the repo; it was introduced by this branch with a stable (cross-process) tmpdir default — NOT per-process mkdtemp, because the seed and e2e helpers store files from different processes than the server that serves them.
4. "Same operational pattern as prisma/seed.ts" for the backfill was untrue for the deployed image — the Dockerfile had to grow `scripts/`, `app/`, `tsconfig.json` and a runtime `tsx` to make `fly ssh console` + `npx tsx` work.
5. The provider interface's `destroy(storageKey)` keeps `invalidate: true` as an implementation detail of the cloudinary provider (design §3.1's minimal interface, not §2's SDK-shaped signature).
