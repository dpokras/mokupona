# Analysis — friction, coupling, and code smells in `app/`

> **Immutable pre-refactor baseline (2026-07-18).** This document describes the
> codebase as it was before the architecture rework and is deliberately not
> updated as work lands. Counts such as “31 role-guard call sites” or the four
> unsafe upload blocks refer to that baseline. For what has since been done,
> see the implementation-status matrix in [`README.md`](./README.md).

Scope: every file under `app/` (41 route modules, 7 feature folders, 12 model files,
20 bespoke + 14 ui components, utils/lib/hooks, root/entry/infra) plus
`prisma/schema.prisma` and the existing docs in `docs/route-module-conventions/` and
`docs/data-access-layer/`.

## 0. What is already good (don't touch)

Naming these explicitly so the plan doesn't churn healthy code:

- **Models layer**: the `docs/data-access-layer` design is fully implemented for
  app-owned queries — every leak-inventory item fixed and the ESLint
  `no-restricted-imports` lock is live in `eslint.config.js`. Better Auth's
  `prismaAdapter` in `features/auth/auth.server.ts:5` is the deliberate exception: the
  third-party adapter receives the raw client and necessarily queries outside the
  models API, while the app's own auth hooks still use model functions.
  Error policy is coherent and commented: missing rows → `null`, invariant violations →
  typed errors (`FormVersionChangedError`, `InviteNoLongerValidError`), and cross-model
  transactions compose via explicit `*InTx(tx, …)` seams.
- **Mail feature**: the best boundary in the app. Two-method provider interface
  (`features/mail/types.ts:8-10`), factory + env injection, SDK confined to one module,
  text/html parity enforced by the compose layer, E2E capture provider.
- **Forms engine concept**: `features/forms` (generic descriptor→schema/view engine) vs
  `features/signup-form` (signup profile over it) is layering, not duplication. The
  builder-row validation runs the real `SignupFormSchema` and maps issue paths back
  (`features/signup-form/builder.ts:58-88`), so the admin builder and the public
  endpoint cannot disagree on rules. This work shipped recently and is deliberately
  stable for the current plan. One residual boundary remains: the `fields/index.ts`
  barrel imports view registries, so models importing `FormSchema` transitively import
  React UI. That debt is recorded below but deferred rather than solved by moving the
  folder.
- **`.server.ts` discipline**: consistently correct, with deliberate isomorphic
  siblings (`serialization.ts` / `serialization.server.ts`, `capture.shared.ts`,
  `invite.shared.ts`).
- **Route conventions**: `docs/route-module-conventions/conventions.md` is followed —
  generated `Route.*` types everywhere, no `json()`, props-not-hooks in route
  components, mutations split into `*.delete.tsx` routes rather than intent dispatch.
- **Comment quality**: zero TODO/FIXME; non-obvious decisions cite design-doc sections.

The friction below is real, but it sits _between_ these healthy layers — in the route
layer's rituals, in placement, and in a handful of undecided abstractions.

**Scope decision after review:** findings about restructuring `features/forms`,
`features/signup-form`, the signup-form builder, or their barrels are inventory only.
They are not part of the executable phases. Events may consume the current signup-form
APIs without reorganizing them.

## 1. Route-layer boilerplate (the hotspot)

### 1.1 Role guards — 31 call sites, 23 files

`await requireUserWithRole(request, ["moderator", "admin"])` (or `["admin"]`) opens
every admin loader **and** action; the roles array literal is copy-pasted ~23 times.
Layout guards don't protect children (RR runs loaders in parallel), so guards stack:
navigating to `/admin/dinners/x/edit` runs the session fetch + `getUserByIdWithRole`
query **three times** (`admin.tsx:13` → `admin.dinners.tsx:8` → the leaf). Three
layouts exist _only_ to guard (`admin.dinners.tsx`, `admin.locations.tsx`,
`admin.users.tsx` — ~24 near-identical lines each, returning `{}` from the loader), and
two more leaf loaders return `{}` for the same reason. 27 of the 31 call sites discard
the returned user. The three layout modules also own metadata and `<Outlet>` wrappers;
middleware can remove their empty loaders, not the modules themselves.

The conventions doc flagged RR middleware as an open question "for v8"; the repo is now
on `react-router@8.0.1` where middleware ships enabled. The question is answerable.

### 1.2 The image-upload + conform fold — ~26 lines × 4 actions

Copy-pasted nearly character-for-character (including comments) in
`admin.board-members.new.tsx:28-67`, `admin.board-members.$userId.edit.tsx:40-77`,
`admin.dinners.new.tsx:46-71`, `admin.dinners.$dinnerId_.edit.tsx:82-107`:
`parseImageFormData` → fold upload failure into a `SubmissionResult` → `parseWithZod` →
discard staged file on validation failure → `submission.reply()`. The common span is
~104 lines. More importantly, cleanup is not exception-safe: failed event persistence
can orphan both the newly created `Image` row and the staged temp file.

### 1.3 Verbatim 404s, delete routes, intent dispatch, conform scaffolding

- `if (!x) throw new Response("Not found", { status: 404 })` — 10 occurrences in 9
  files.
- Three `*.delete.tsx` files are near-identical ~18-liners (redirecting loader, guard →
  param → `deleteX(id)` → redirect). The user deletion route adds policy branches.
- Three actions hand-roll `formData.get("intent")` if-chains ending in the identical
  `throw new Response("Unknown intent", { status: 400 })`
  (`admin.users._index.tsx:83-118`, `invite.$token.tsx:100-173`, `me.tsx:70-148`).
- The same `useForm({ lastResult, shouldValidate: "onBlur", constraint:
getZodConstraint(schema), onValidate… })` block repeats in ~15 route files;
  `submission.reply()` appears 27 times.

### 1.4 Business flows living inline in actions

- **Invite acceptance** (`invite.$token.tsx:98-174`): token re-validation → duplicate
  check → `auth.api.signUpEmail` → re-fetch created user → `acceptInvite` →
  `auth.api.signInEmail` → role-dependent redirect (the `roleName === "moderator" ?
"/admin" : "/"` ternary duplicated at `:126` and `:168`). A transaction-shaped flow
  with no home.
- **Roster shaping**: `toParties()` (submission→party aggregation incl. legacy-row
  semantics) in `admin.dinners.$dinnerId_.signups.tsx:28-53` and CSV row/answer
  formatting in `admin.dinners.$dinnerId.[signups.csv].tsx:47-55` both belong next to
  `features/signup-form/read.server.ts`, which both routes already import.

## 2. Contract and signature inconsistencies

### 2.1 `actionData` envelope variation — five shapes around one concept

Bare `SubmissionResult` (all admin CRUD) vs `data({ result, sentTo })`
(`forgot-password.tsx`) vs `data({ result, authError })` (`login.tsx`) vs
`data({ result, formError })` (`invite.$token.tsx`) vs `data({ result, done })`
(`me.tsx`). The six files using `data()` never set status or headers, so those wrappers
are unnecessary. The extra fields represent real route-specific state, however; this
does not justify forcing simple CRUD forms into an envelope. A practical convention is
bare `SubmissionResult` when it is the only value and `{ result, ...extras }` when
side-channel state is genuinely needed. Broad normalization is deferred.

### 2.2 Stringly-typed roles — no `RoleName` union exists

`requireUserWithRole(request, roles: string[])` (`features/auth/guards.server.ts:41`);
`"admin"` hardcoded in `models/user.server.ts:96`; `"moderator"` in
`models/invite.server.ts:139`; a re-declared `z.union([z.literal("user"),
z.literal("moderator")])` in `admin.users.$userId_.edit.tsx:17-19` — while
`INVITABLE_ROLES` in `features/users/invite.shared.ts:4` already defines part of the
union. The DB has no enum (SQLite), so persisted `Role.name` values must also be
validated at the model/auth boundary; typing only guard arguments is insufficient.
`RoleName` avoids colliding with Prisma's existing `Role` entity type. Today a typo
compiles. The same gap causes the one wrong-direction feature edge: `mail → users`
(`features/mail/templates.ts:4` imports `InvitableRole` for copy branching).

### 2.3 Mixed absent-value and error conventions

- `getUserId` returns `undefined` for anonymous; `getUserWithRole` returns `null` — in
  the same file (`guards.server.ts:12-27`). `getUserWithRole` also **throws a logout
  redirect** for a stale session — a surprising contract for a `get*`.
- Not-found handling: 10 hard 404 throws vs a silent redirect
  (`admin.users.$userId.delete.tsx:20`) vs designed dead-end state objects
  (`invite.$token.tsx:66-68`, `reset-password.tsx:32-40`).
- Only one route has an `ErrorBoundary` (`dinners_.$dinnerId.tsx:321-345`); every admin
  403/404 falls through to the unstyled root boundary — a logged-in `user`-role member
  hitting `/admin` sees a raw "403 Forbidden".
- Two competing toast mechanisms: server flash via `redirectWithToast` (used once,
  `dinners_.$dinnerId.tsx:152`) vs client `useEffect`-on-fetcher-idle — written once as
  a local hook (`me.tsx:151-160`) and re-implemented inline
  (`admin.users._index.tsx:226-231`).
- `healthcheck.tsx:23` logs with `console.log`; everything else uses `~/logger.server`.
- Meta reaches into root data positionally — `matches[0].loaderData.domainUrl`
  (`_index.tsx:34`, `dinners_.$dinnerId.tsx:170`) — while
  `admin.users._index.tsx:96` recomputes `getDomainUrl(request)` instead.

### 2.4 Model-signature nits (the layer is otherwise clean)

- `countEventResponsesByEvent` leaks Prisma's `groupBy` shape (`_count._all`) to
  `features/signup-form/read.server.ts:59-61` — the one raw-ORM shape still crossing
  the boundary.
- `Attendee.answers: Record<string, string | boolean>`
  (`read.server.ts:27`) silently drops any other answer type (`:187,218`) — a trap for
  a future numeric field; the type doesn't say "lossy".
- Idempotent `deleteMany` (`revokeInvite`) vs throwing `delete` elsewhere; `get*` vs
  `list*` split is by projection rather than collection-ness (`getAddresses`,
  `getEventsWithAddress`).

## 3. Placement inversions and coupling

The dependency direction that keeps a codebase workable is
`routes → features → models` and `routes/features → components (with view-model
props)`. Every finding here is a violation of that arrow:

| Inversion                                                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React component exported from a resource route, imported route-to-route and by components           | `OptimizedImage` in `routes/file.$fileId.tsx:32-72` ← `admin._index.tsx:5`, `admin.board-members.tsx:5`, `admin.dinners._index.tsx:6`, `dinner-card.tsx:10`, `dinner-view.tsx:19`                                                                                                                                                                                                                                      |
| Shared component's prop type derived from an **admin** route loader, consumed by a **public** route | `dinner-view.tsx:18-22` (`import type { loader } from "~/routes/admin.dinners.$dinnerId"`) ← `dinners_.$dinnerId.tsx:13`                                                                                                                                                                                                                                                                                               |
| Prisma entity types as component props                                                              | `dinner-card.tsx:9` takes `Event & { address: Address }`, renders ~8 scalars                                                                                                                                                                                                                                                                                                                                           |
| 787-line feature UI in generic `components/`                                                        | `components/signup-form-builder.tsx` — single consumer `admin-dinner-form.tsx:281`; its value model already lives in `features/signup-form/builder.ts`                                                                                                                                                                                                                                                                 |
| Utils importing features (upward)                                                                   | `utils/event-validation.ts:3` → `features/signup-form/builder`                                                                                                                                                                                                                                                                                                                                                         |
| Util layered above models                                                                           | `utils/image-upload.server.ts:12` → `models/image.server` — it's feature orchestration, not a utility                                                                                                                                                                                                                                                                                                                  |
| Infrastructure knowing a domain type                                                                | `features/mail/templates.ts:4` → `features/users/invite.shared` (type-only, but wrong direction)                                                                                                                                                                                                                                                                                                                       |
| Models importing features                                                                           | `models/event.server.ts:4-5` (`FormSchema`, `DEFAULT_FORM`), `models/form.server.ts:6-7`, `models/invite.server.ts:6` — combined with `features/signup-form/read.server.ts` importing three models, the features↔models edge is **bidirectional at folder level** (no module-level cycle). The `features/forms/fields` barrel also imports React views at runtime, so model schema imports transitively reach UI code. |

The models→features edge deserves nuance: validate-on-write inside the model is good,
but the current schema barrel is not a pure lower layer because it also constructs the
view registry. The eventual correction is to expose separate pure schema/type and UI
entry points inside `features/forms`, not necessarily to move the feature. Because the
forms work is recent, that correction is explicitly deferred.

### The largest domain has no feature folder

Events/dinners — the app's core domain — is the only major domain without an
`app/features/` home, and most placement inversions above are its symptoms. The
domain spans **11 routes**, ~576 lines of UI in generic `components/`
(`dinner-card.tsx` 112, `dinner-view.tsx` 172, `admin-dinner-form.tsx` 292), its form
schema in `utils/event-validation.ts`, its timezone conversion in
`utils/event-timezone.server.ts`, its five date formatters inside `utils/misc.ts`
(`formatEvent*`/`formatAdmin*`, `:137-190` — all event-specific, none generic), and
its storage-key vocabulary in `utils/dinner-image-storage.server.ts`
(`dinner-${id}-cover`). Event→view-model shaping is re-hand-rolled per route with
three different address-line formats: `"${zip} ${city}"` (`dinner-card.tsx`,
`dinner-view.tsx`), `"${streetName} ${houseNumber}"` (`admin.dinners._index.tsx:32-41`,
`admin._index.tsx:35-45`), full street+zip+city (`admin-dinner-form.tsx#toAddressOptions`).

The coupling direction supports a clean extraction. The events side imports
`features/signup-form` at the feature layer (`event-validation.ts:3` → builder schema,
`admin-dinner-form.tsx` → `SignupFormBuilder`, the roster routes →
`read.server.ts`), while signup-form reaches event data **only through
`app/models/`** (`read.server.ts:6-10` → `event-response.server`). So a
`features/events` folder would depend on `features/signup-form`, never the reverse —
one-way, no cycle. The events extraction can use the current APIs unchanged; it does
not depend on reorganizing forms. (The `models/event.server.ts` → `DEFAULT_FORM`
import is the separate models→features edge already covered above.)

Deferred barrel hygiene: `features/forms/fields/index.ts` exists but is incomplete
(`FIELD_KEY_REGEX`, `NON_LIST_FIELD_TYPES` not re-exported), so consumers route around
it with deep imports (`builder.ts:7,11`, `signup-form-builder.tsx:34`). In cms,
`blocks/hero/` and `blocks/text-section/` have `index.ts` but `blocks/image/` doesn't,
so `_index.tsx:3-6` mixes barrel and deep imports for sibling blocks.

## 4. Duplicated business rules and constants

Each of these exists in 2-3 places with no single owner — the classic drift seeds:

- **"Admins can't be deleted"**: enforced by a route pre-check with a silent redirect
  (`admin.users.$userId.delete.tsx:18-23`) + a UI `disabled` flag
  (`admin.users._index.tsx:438`) — but `models/user.server.ts#deleteUserById` has no
  backstop, unlike the role-update path which encodes its rule in
  `updateNonAdminUserRole`.
- **Duplicate-email check**: async zod refinement pushing a field error
  (`join.tsx:39-51`) vs imperative check returning a `formError` string
  (`invite.$token.tsx:135-141`).
- **Past/upcoming dinner partition** — five hand-rolled comparisons, no shared
  helper: `dinners._index.tsx:19-25` (`>= now` upcoming / `< now` past),
  `admin.dinners._index.tsx:61-83` (`past` flag + filter chips + two-key sort),
  `dinners_.$dinnerId.tsx:63` (action 403s past events) and `:190` (client hides the
  signup form), plus the DB-side twin `getNextEvent`'s `gte`
  (`models/event.server.ts:49`). All five currently agree that `date == now` counts
  as upcoming — but only by discipline; nothing owns the rule.
- **`zipCode → zip` field mapping**: hand-written in `admin.locations.new.tsx:28-35`
  and `admin.locations.$locationId_.edit.tsx:42-49`.
- **`validImageTypes`**: three definitions — `admin.dinners.new.tsx:29`,
  `admin.dinners.$dinnerId_.edit.tsx:37` (as `VALID_IMAGE_TYPES`), and
  `features/board-members/schema.ts` (the only shared one).
- **Zod image-file refinement chain** (size ≠ 0, ≤ 3MB): verbatim in
  `features/board-members/schema.ts:16-25` and `utils/event-validation.ts:21-28`.
- **`"Europe/Zurich"`**: `EVENT_TIME_ZONE` (`utils/misc.ts:127`) and `EVENT_TIMEZONE`
  (`utils/event-timezone.server.ts:4`).
- **`"friends"` list name**: pinned in `features/signup-form/schema.ts:20` and
  re-declared as `FRIENDS_LIST_NAME` in `read.server.ts:36`.
- **Landing path per role**: `roleName === "moderator" ? "/admin" : "/"` twice within
  `invite.$token.tsx` (`:126`, `:168`).

## 5. Junk drawers and dead weight

- **`utils/misc.ts` (192 lines)** mixes React hooks (`useOptionalUser` duck-types the
  root loader's user via `useMatchesData("root")` instead of the typed loader,
  `:50-70`), server HTTP helpers, five date formatters (all event-domain — see §3),
  `safeRedirect` (one consumer), production-dead `validateEmail` (`:72-74`; its only
  importer is `misc.test.ts`), and the duplicated timezone constant.
- **`utils/` vs `lib/` split carries no meaning**: `lib/` holds shadcn's `cn()` plus
  two single-consumer CSV modules; `hooks/` holds one hook while the other two hooks
  live in `misc.ts`.
- **Twin storage modules**: `dinner-image-storage.server.ts` and
  `file-chache-storage.server.ts` (typo included) are byte-for-byte identical except
  env-var support and key prefix.
- **Dead ui primitives (~475 lines)**: `ui/dropdown-menu.tsx`, `ui/select.tsx`,
  `ui/tooltip.tsx` — zero importers (grep-verified). The irony: the app _needs_ a
  styled native select (see §6) while the dead radix Select sits there.
- **Client-hints plumbing is dead weight with a UX cost**: `entry.server.tsx:76-108`
  gives every first-time non-bot browser visitor an empty page + three cookies +
  `location.reload()` (double page load) to collect timezone/clock data that does not
  affect behavior —
  `toUtcEventDate` does `void clientHints` (`utils/event-timezone.server.ts:58`) and
  everything is pinned to `Europe/Zurich`; the root-loader `clientHints` field has no
  client-side consumer. Dinner create/edit read the hints only for logging.
- **Recent migration scaffolding needs an explicit review point**:
  `features/signup-form/parity.test.ts`
  (325 lines) + `utils/event-signup-validation.ts` — the pre-rewrite schema kept
  verbatim as a regression anchor; its only importer is the parity test. The migration
  landed only two weeks before this review, so the current plan keeps it and adds an
  owner/date/production-mileage exit criterion instead of deleting or moving it now.
- **cms is a vestigial abstraction**: `blocks/types.ts` simulates the forms feature's
  versioned-descriptor pattern (`BlockType`, `BlockVersion`) with no zod, no
  persistence, no registry, and exactly one consumer that hardcodes block data as
  literals (`_index.tsx:48-124`). These are section components wearing CMS clothes.

## 6. Component-layer duplication

- **The field recipe exists twice**: `forms.tsx#SelectField` inlines a ~20-token class
  blob (`forms.tsx:126`) duplicating `ui/input.tsx:16`'s recipe (hairline border,
  `bg-foreground/5`, inset-ring focus) with drift already visible.
- **Repeated class blobs**: page-title `"text-3xl font-light tracking-tight
md:text-4xl"` ×7; back-link recipe ×3; icon fact-rows duplicated between
  `dinner-card.tsx:58-73` and `dinner-view.tsx:120-160` (already drifting —
  `.toLowerCase()` in one, not the other); corner-glow divs ×3 (one as a private
  component, twice raw); raw `text-red-300` standing in for a destructive-foreground
  token ×5; a one-off destructive icon-button (`signup-form-builder.tsx:495`)
  near-duplicating Button's `destructive-outline` variant.
- **`signup-form-builder.tsx` internals (documented, deferred)**: `BuilderRowView` takes 10 props, `RowHeader`
  9; `lockFieldKeys`/`isStoredRow`/`isRowOpen`/`toggleRow` + two twin-targets thread
  through 3-4 levels; `useFormMetadata()` called at four levels; repeated
  `as RowMetadata` casts; a `satisfies Record<string, unknown> as never` type-hole in
  the twin-insert payload (`:666`); `TYPE_LABELS` (display names for field types) lives
  here instead of beside the field registry — so a new field type can ship without a
  label. Adding a field type with type-specific data currently touches **7 coordinated
  sites** across three folders.
- Nits: `textarea.tsx:5` interface named `InputProps`; `auth-layout.tsx` exports
  `AuthShell`; `CheckboxField`'s props named `buttonProps` (legacy of a radix
  checkbox); `export default function DinnersPage` copy-pasted into 5 files, 3 of
  which are not dinner pages; `admin.board-members.$userId.*` uses `userId` for a
  board-member id; `FieldsetOf<Schema>` mapped type copy-pasted in both admin forms.

## 7. Schema and infra frictions

- **Cascade mismatch forces app-level choreography**: `Event`'s FKs to
  `User`/`Address`/`Image` are `onDelete: Cascade` while `Event→Form` is `Restrict`
  (`prisma/schema.prisma:133-145`) — this is _why_ `deleteEventsInTx` must be manually
  composed into `deleteAddress`, `deleteUserById`, and `deleteEvent`, with "must run
  first, in the same transaction" comments in three model files. Because those FKs
  point from `Event` to its parents, the database cannot cascade an event deletion
  upward into `Form` or `Image`; doing so requires relation redesign, not a small
  `onDelete` adjustment. A smaller safety option is `Restrict` on dangerous parent
  deletes while retaining explicit model transactions.
- **Orphaned image blobs and temp files**: no event image lifecycle operation exists;
  cover swaps and event deletions leave `Image.blob Bytes` rows behind. A failed
  create/update after `persistImage` also leaves the new row, and exception paths can
  leave the staged file. The fix must make DB ownership atomic and temp cleanup
  exception-safe, not merely add `deleteImage`.
- **Missing timestamps**: `Event` and `Address` have no timestamps. Most mutable models
  have both; `FormSubmission` is a counterexample with `createdAt` only.
- **Vocabulary split**: DB/models say `Event`/`Address`, URLs/UI say
  `dinners`/`locations` — routes translate constantly. Live with it, but the
  translation should happen in exactly one place per route (loader → view-model), which
  the view-model props work in the plan enables.
- `password-reset.server.ts` reaches into better-auth's `Verification` table by key
  convention (`reset-password:<token>`) — acknowledged coupling to better-auth
  internals; contained, but worth a comment-level warning on better-auth upgrades
  (exists) and a test (exists). No action.
- `db.server.ts:19` re-exports the entire generated client (`export * from
"#prisma/generated/client"`) — redundant surface the ESLint rule has to cover.
- `logger.server.ts` file transports grow unbounded in the container FS (relevant to
  the past Fly memory investigations); `optimize-images.ts` has the async-forEach bug.

## 8. Root causes

Three patterns explain most of the above:

1. **No shared route-layer vocabulary.** Guards, 404s, form parsing, envelopes, and
   toasts were each solved once in some route and then copy-pasted, mutating slightly.
   The conventions doc names the rules but provides no _code_ to embody them.
2. **`components/` and `utils/` as default dumping grounds.** Anything not obviously a
   route or model landed there, regardless of which feature owned it — producing the
   placement inversions and junk drawers.
3. **Transitions need explicit exit criteria.** The DAL doc, client hints, dead radix
   components, and CMS half-abstraction are remnants of completed or abandoned work.
   The parity test and legacy schema are different: they are recent migration safety
   nets and should remain until their owner/date/production-mileage criterion is met.
