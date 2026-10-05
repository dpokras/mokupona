# DRY refactor follow-up

**Status: complete (2026-07-19).** All four numbered steps below were executed
on `chore/architecture-rework`; the commit table records what landed. The
document is kept as the record of that continuation — current overall status
lives in the [`README.md`](./README.md) implementation matrix.

## Completed commits

| Commit    | Change                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `021d8aa` | Shared multipart image-form action lifecycle with focused cleanup tests                                                  |
| `7c5276b` | Central image fits, widths, byte limits, and validation messages                                                         |
| `a3a9909` | Bounded image transforms, one cache lookup, one response builder                                                         |
| `a3d8542` | Combined event/address/current-form reads and next-event projection                                                      |
| `5ac612a` | Shared event and board-member admin form shells                                                                          |
| `6e3ad6f` | Moved the image route test outside `app/routes`                                                                          |
| `0d82889` | One request-scoped optional-user resolution for root/admin/invite                                                        |
| `617b02a` | Shared event view-model base, fact leaves, ordering, and formatters                                                      |
| `26fbe37` | Shared location/delete UI, protected user deletion, auth vocabulary                                                      |
| `566d64d` | Step 1: one streaming implementation, nav item model, responsive-image helper, shared transform URL, OG meta helper      |
| `96f919d` | Step 2: shared route-error content, event-test fixtures, auth sign-in factory, seed/cypress record builders              |
| `8064c1d` | Step 3: `unknownIntent()`, root headers passthrough, precomputed ids in `deleteEventsInTx`, derived legacy signer schema |

## 1. Deduplicate remaining runtime presentation/infrastructure

Suggested commit: `refactor: consolidate runtime presentation`

### Server streaming

- Consolidate the two streaming implementations in `app/entry.server.tsx`.
- Keep bot and browser readiness behavior explicit (`onAllReady` versus
  `onShellReady`), but share stream construction, error handling, headers, and
  response creation.
- Prefer one private implementation receiving the readiness callback name over
  two exported 35-line copies.

### Site navigation data

- In `app/components/site-nav.tsx`, derive desktop and mobile navigation from
  one authenticated navigation model/item descriptor list.
- Keep desktop/mobile markup and styles separate.
- Preserve logout as a form submission, active-link styling, admin visibility,
  the next-dinner link, Instagram external-link attributes, and mobile close
  behavior.
- Do not create one highly conditional desktop/mobile component.

### Static image optimizer

- In `app/optimize-images.ts`, extract
  `optimizeResponsiveImage(source, outputStem)` for the repeated hero/accent
  WebP loop and JPEG fallback.
- Continue using `RESPONSIVE_IMAGE_WIDTHS`; do not introduce another width
  list or a second fallback-width literal.
- Do not run the script as part of the refactor unless regenerated public image
  binaries are intended to change.

### Image URL construction

- `app/components/optimized-image.tsx` still builds the same transform query
  twice for `src` and `srcSet`.
- Add a client-safe `buildImageTransformUrl` beside `getImageUrl` in
  `app/shared/image.ts` and reuse it for both paths.
- Consider requiring or documenting the `sizes` prop. Without it, a
  width-descriptor `srcSet` is treated approximately as `100vw` by browsers.
- Remove `<picture>` only if no `<source>` use is planned; this is optional and
  should not be mixed with behavior changes.

### Metadata URL construction

- `_index.tsx` and `dinners_.$dinnerId.tsx` repeat root-domain lookup plus
  absolute `og:image`/`og:url` construction.
- A small meta helper may own only absolute URL construction and graceful
  no-root-data fallback. Route-specific titles/descriptions remain local.

Verification:

```sh
npm run typecheck
npm run lint
npm test -- --run
npx react-router routes
git diff --check
```

## 2. Consolidate error presentation and test/seed fixtures

Suggested commit: `refactor: share errors and fixtures`

### Error boundaries

- Extract a shared `RouteErrorContent` or `RouteErrorPanel` from the identical
  branches in:
  - `app/root.tsx`
  - `app/routes/dinners_.$dinnerId.tsx`
  - `app/routes/admin.tsx`
- Share response/Error/unknown normalization and inner markup only.
- Keep the admin layout wrapper and any route-specific surrounding layout in
  their routes.

### Event model tests

- In `app/models/event.server.test.ts`, extract the repeated invalid
  duplicate-field-name descriptor fixture.
- Extract `expectEventGraphDeleted(event)` for the common event/form/version/
  submission/image absence assertions.
- Keep separate tests for direct event deletion, address cascade, user cascade,
  and image lifecycle; they protect different transaction entry points.

### Auth test setup

- `guards.server.test.ts` and `middleware.server.test.ts` repeat user creation,
  sign-in, cookie extraction, and Request construction.
- Move that setup to a test-only factory accepting role and path.
- Keep middleware-driving helpers local to the middleware test.

### Seed and factories

- In `prisma/seed.ts`, create the two similar events through a small seed-event
  helper/loop and import the canonical `ROLE_NAMES` rather than redeclaring
  roles.
- Preserve a distinct image row and fresh bytes for every seeded event.
- In `test/factories.ts`, consolidate repeated role-then-user creation while
  preserving the unique role names required for isolated database tests.
- Review `cypress/support/upload-test-records.ts` and the board-member upload
  spec for a small shared record builder; keep black-box boundary byte values
  independent from production constants.

Verification:

```sh
npm test -- --run
npm run typecheck
npm run lint
git diff --check
```

## 3. Small optional cleanups

These are lower-value and should be separate commits only when they leave the
calling code clearer.

- Add a shared `unknownIntent()`/bad-request response helper for the identical
  final branches in `admin.users._index.tsx`, `invite.$token.tsx`, and `me.tsx`.
  Do not build a generic intent dispatcher; the action flows differ.
- Consolidate login/join's identical “redirect an already authenticated user”
  loader behind a narrowly named helper if another public-only auth route uses
  the same policy.
- Add a small logging-context helper for repeated `{ ip, obscureEmail(email) }`
  data only if it improves call sites; event-specific fields stay local.
- Replace `combineHeaders(headers)` with `headers` in `root.tsx`; retain
  `combineHeaders` where multiple header sources are actually merged.
- Precompute `eventIds`, `formIds`, and `imageIds` in
  `deleteEventsInTx` instead of mapping the event collection repeatedly.
- The legacy signup schema can derive its signer schema from its person schema
  internally, but it must not import the replacement production schema.
- `BackLink`, `PageTitle`, `Glow`, and broader visual-token convergence belong
  to `docs/design-harmonization/plan.md`, not an architecture-only refactor.

## 4. Documentation status and final verification

Suggested commit: `docs: update architecture status`

- Treat `analysis.md` as an immutable pre-refactor baseline and label it
  clearly as such.
- Add one implementation-status matrix to `README.md` or `plan.md` with
  `complete`, `partial`, `deferred`, and `superseded` states.
- Do not repeat the outstanding task inventory in all three documents.
- Update stale statements such as “31 copied guards”, “four unsafe upload
  blocks”, and missing event feature ownership.
- Record intentional non-DRY decisions:
  - card versus detail address casing;
  - event create versus edit cover/nullable semantics;
  - join versus invite-acceptance workflows;
  - Prisma predicates versus in-memory event status;
  - independent legacy parity schema;
  - separate cascade-path tests.

Final verification:

```sh
npm run validate
git diff --check dev...HEAD
git status --short --branch
```

`npm run validate` includes the production build and Cypress suite and is the
appropriate final gate. If environment-dependent E2E setup prevents it, record
the exact failing command and run at least unit tests, typecheck, lint, build,
and the targeted admin dinner/board-member upload specs separately.

## Guardrails for continuation

- Use `apply_patch` for edits.
- Inspect `git status` before every step; preserve unrelated user changes.
- Use subagents for an implementation pass and an independent DRY review.
- Do not place tests under `app/routes`; React Router registers them as routes.
- After each step: focused tests, typecheck, lint, `git diff --check`, then one
  concise commit.
- Prefer a few concrete domain components/helpers over generic factories with
  `mode`, layout, or policy flags.
