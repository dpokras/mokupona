# Plan — event-focused architecture work

Companion to [`analysis.md`](./analysis.md). Phases are ordered by dependency and
operational risk. Each phase should leave the app shippable, and the authentication,
image-lifecycle, and event-feature changes should each land as independently reviewable
work.

## Scope and non-goals

The current implementation focus is:

- the events domain and its UI;
- authentication vocabulary and React Router middleware;
- event-image ownership and cleanup;
- route-layer repetition with a small, evidenced primitive;
- client-hints, storage, utility, and dead-code cleanup around those areas.

`features/forms` and `features/signup-form` were implemented recently. Their residual
boundary issues remain recorded in the analysis, but this plan deliberately does **not**:

- move forms into an `app/domain/` folder;
- split the forms schema and view registries;
- decompose or relocate `signup-form-builder.tsx`;
- complete forms barrels or rename field views;
- delete or move the parity test and legacy comparison schema;
- introduce a generic `formAction` or normalize every form action envelope.

The events feature may depend on the existing signup-form APIs. That acknowledged edge
does not block giving events a coherent home.

**Target layering for work in scope:**

```text
routes                 thin HTTP adapters: middleware, parsing, calls, view-model mapping
  ↓
features/events        event rules, orchestration, view models, and event-owned UI
  ↓
models                 the only app-owned Prisma access

components             generic presentation only; view-model props, no route/model types
shared                  small dependency-free helpers

features/forms + features/signup-form
                       stable existing subsystem; consume through current APIs for now
```

---

## Phase 0 — Standalone fixes and safe deletions

These changes do not depend on the architecture work, but they are not all “zero risk”:
logger policy, migration-scaffolding lifetime, and broad renames are explicit decisions.

1. Fix the board-member edit redirect to `/admin/board-members`.
2. Guard extension-less input in `generateSrcSet`. This is currently latent because the
   existing callers use `.jpg`, but the helper contract is still wrong.
3. Replace the two async `forEach` loops in `optimize-images.ts` with awaited iteration.
4. Guard `loaderData` in the two admin dinner meta functions.
5. Decide the production logger policy: prefer stdout-only container logging, or add an
   explicit bounded/rotated file policy. Treat this as an operational decision rather
   than an application correctness bug.
6. Delete the unused `ui/dropdown-menu.tsx`, `ui/select.tsx`, and `ui/tooltip.tsx` files
   (~475 lines). Delete production-dead `validateEmail` and its dedicated tests together.
7. Keep `features/signup-form/parity.test.ts` and
   `utils/event-signup-validation.ts` in place. Add an owner, review date, and measurable
   production-mileage exit criterion; do not delete them during this refactor.
8. Apply low-risk naming fixes only when touching the relevant files:
   `file-chache-storage.server.ts`, copied `DinnersPage`/`LocationsPage` names,
   board-member `$userId`, `textarea.tsx`'s `InputProps`, and checkbox `buttonProps`.
   Avoid a standalone rename sweep unless it is useful for an upcoming phase.
9. Rewrite `docs/data-access-layer/design.md` as a conventions reference. Describe the
   Better Auth adapter as the intentional third-party raw-Prisma exception.

## Phase 1 — Shared authentication and event vocabulary

1. Add role-name vocabulary in `app/features/auth/roles.ts`:

   ```ts
   export const ROLE_NAMES = ["user", "moderator", "admin"] as const;
   export type RoleName = (typeof ROLE_NAMES)[number];
   export const ADMIN_ROLE_NAMES = [
     "moderator",
     "admin",
   ] as const satisfies readonly RoleName[];
   ```

   Add `isRoleName`/parse validation at the model or auth boundary: Prisma returns
   `Role.name` as `string`, so typing only the guard arguments is insufficient. Use
   `RoleName`, not `Role`, because `Role` already names the Prisma entity. Keep
   `INVITABLE_ROLES` as a non-empty tuple checked against `RoleName`; do not derive it
   with a filter that loses tuple inference.

2. Add `requireFound<T>(value)` to shared HTTP vocabulary and replace the ten verbatim
   404 throws. Compound event/version checks can use two calls when distinct missing
   records should remain visible in code.
3. Consolidate constants that are in scope: `EVENT_TIMEZONE`, event image MIME types,
   `imageFileSchema(maxBytes)`, and `landingPathForRole`. Leave signup-form constants
   alone unless a concrete event change requires them.
4. Normalize the auth getter contract (`getUserId` nullability and stale-session
   behavior) before middleware depends on it.
5. Replace positional root-meta access with a helper that identifies the `root` match
   by route id and tolerates absent loader data.

## Phase 2 — Admin authentication middleware

React Router 8.0.1 middleware is always enabled and wraps matched document requests,
loaders, actions, fetchers, resource requests, and direct POSTs. Adopt it, but ensure a
request authenticates only once.

1. `admin.tsx` authenticates/authorizes `moderator | admin`, stores the validated user
   in a `userContext`, and exposes it to child loaders/actions.
2. `admin.users.tsx` reads that context and narrows authorization to `admin`; it must not
   repeat the session and user lookup.
3. Call sites that need the user (`admin.tsx`, dinner create/edit actions, user-index
   actions) read the context. Remove all 31 `requireUserWithRole` calls after coverage is
   demonstrated.
4. Remove the five empty `{}` loaders. Keep `admin.dinners.tsx`,
   `admin.locations.tsx`, and `admin.users.tsx`: they still own metadata and layout
   wrappers, and the users segment owns stricter middleware.
5. Add a styled `ErrorBoundary` to `admin.tsx` for 403/404 responses.
6. Add tests for:
   - anonymous direct POST → redirect and no mutation;
   - ordinary user direct POST → 403 and no mutation;
   - moderator denied from user edit/delete but allowed in content administration;
   - protected CSV/resource GET;
   - stale-session logout behavior and headers;
   - context availability to actions that need the user;
   - one session/user lookup per request, including nested `admin.users` routes.

Keep this as a focused authentication change. Do not combine it with event moves or
generic action helpers.

## Phase 3 — Event image lifecycle

Fix image ownership before moving event files. The current bug is broader than deleting
old covers: new image rows and staged files also leak on failure paths.

1. Change event create/update orchestration so image bytes participate in the model
   transaction rather than calling `persistImage` before `createEvent`/`updateEvent`.
   - create: create the image and event/form graph atomically;
   - replace: create the new image, repoint the event, and delete the old image in one
     transaction and in that order;
   - delete: capture the cover id, delete the event/form graph, then delete the image in
     the same transaction.
2. Make staged upload cleanup unconditional with `try/finally`, including image-create
   and event-mutation exceptions.
3. Put the upload orchestration under `features/uploads/` or the events feature rather
   than generic forms code. A narrowly scoped `imageFormAction` is worthwhile only if
   its contract owns the full success/failure cleanup behavior for both event and
   board-member flows.
4. Add a one-off orphan sweep that deletes only images with neither an event relation
   nor a board-member relation. Coordinate its timing with the Cloudinary migration.
5. Add model/integration coverage for create failure, cover swap success/failure, event
   delete, address delete, user delete, orphan sweep safety, and board-member-image
   non-regression.

## Phase 4 — Extract `features/events`

Events are the largest domain without a feature home. The folder is named `events`
because that matches the model and allows event kinds beyond dinners; routes and user
copy retain “dinner.”

1. Move event-owned utilities:
   - `utils/event-validation.ts` → `features/events/event-schema.ts`;
   - `utils/event-timezone.server.ts` and its tests → `features/events/`;
   - the five event/admin date formatters → `features/events/date-format.ts`;
   - storage-key vocabulary → the event/upload boundary.
2. Move event-owned UI:
   - `dinner-card.tsx` → `features/events/components/event-card.tsx`;
   - `dinner-view.tsx` → `features/events/components/event-view.tsx`;
   - `admin-dinner-form.tsx` → `features/events/components/admin-event-form.tsx`.

   `AdminEventForm` may continue importing the existing `SignupFormBuilder`; do not
   restructure the builder in this phase.

3. Define explicit `EventCardModel`, `EventDetailModel`, and admin form option models.
   Routes map model results into these shapes. This removes the public component's
   dependency on an admin route loader type and Prisma entity props.
4. Centralize event status rules with `isPastEvent(date, now)` and
   `partitionEvents(events, now)`. Capture `now` once per operation so an event cannot
   cross the boundary between repeated comparisons. Keep `getNextEvent` as the DB-side
   twin of the same `date >= now` policy.
5. Choose address-line formats deliberately for card, detail, and admin option models;
   three inconsistent formats exist today.
6. Move `OptimizedImage` from the resource route to a presentation component so
   `file.$fileId.tsx` becomes a pure resource route.
7. Move `components/google-button.tsx` under `features/auth/components/` when touching
   auth UI, or document it as the remaining exception to the generic-component rule.

The event extraction and view-model conversion should be reviewable independently from
signup-form internals and design-system harmonization.

## Phase 5 — Cleanup around the extracted domain

1. Split the remainder of `utils/misc.ts`:
   - HTTP helpers → `shared/http.server.ts`;
   - hooks → `hooks/`, with typed root data rather than duck typing;
   - `safeRedirect` next to its single consumer or in a small HTTP helper.
2. Remove the client-hints bootstrap, cookies/reload document, server helper, root-loader
   field, logging, and dead parameters from event timezone conversion. Non-bot browsers
   currently pay a double page load for data that does not affect behavior.
3. Merge the twin filesystem-storage implementations behind one parameterized storage
   primitive; inject event-specific key prefixes from the event/upload owner.
4. Collapse the meaningless `lib/`/`utils/` split where files are already moving.
   Retain `lib/utils` only if shadcn tooling requires that path.
5. Drop the generated-client wildcard re-export from `db.server.ts`.
6. Move roster/CSV shaping only if doing so does not require reorganizing signup-form
   internals. Otherwise record it as follow-up debt beside the forms deferral.
   (2026-07-18: deferred — both routes consume signup-form's public read API only;
   moving the shaping would not reduce coupling without reorganizing signup-form
   internals, which is out of scope.)
7. Fold event-facing visual primitives into `docs/design-harmonization` as separate UI
   work: `PageTitle`, `BackLink`, `FactRow`, `EventDateLine`, `Glow`, and destructive
   color tokens. Defer forms-field recipes, builder buttons, and `FieldsetOf` cleanup.
   (2026-07-18: candidate list recorded in `docs/design-harmonization/plan.md` under
   "Candidates from the events extraction"; no components built.)

## Phase 6 — Independent structural decisions

Each item requires its own decision and risk assessment; do not batch them merely to
amortize a migration.

1. **CMS:** demote the hardcoded block machinery to ordinary sections unless DB-driven
   content is actually on the roadmap. This remains a product decision.
2. **Event cascade safety:** the database cannot cascade Event deletion upward into
   `Form` or `Image` with the current FK direction. Choose between:
   - a smaller safety change using `Restrict` for dangerous User/Address/Image parent
     deletes while retaining explicit model transactions; or
   - a larger ownership/relation redesign with full cascade tests.
3. **Timestamps and vocabulary:** consider timestamps for Event/Address and `zip` →
   `zipCode` separately. Neither is required for event extraction.
4. **Model boundary:** map `countEventResponsesByEvent` to a domain-shaped result rather
   than exposing Prisma's `_count._all` structure.
5. **Roster answer types:** keep the current supported scalar contract explicit. Add
   observability before silently dropping any newly introduced answer type.

## Explicitly deferred or rejected

- **Forms folder move / schema-view split:** valid documented debt, deferred because the
  subsystem is recent. When revisited, prefer pure and UI entry points within
  `features/forms`; moving the entire current folder would also move React UI and solve
  nothing.
- **Signup-form builder decomposition:** deferred with the forms subsystem.
- **Parity scaffold deletion:** deferred until its explicit production-mileage review.
- **Generic `formAction`:** deferred; it saves little and obscures async schemas,
  headers, params, error handling, and route return inference.
- **Forced action-data envelope:** rejected. Use a bare `SubmissionResult` when it is the
  only value and `{ result, ...extras }` only when extras are real.
- **`deleteResourceRoute` factory:** rejected for now. Middleware makes `roles`
  redundant, parameter names differ, route modules still remain, and four small
  security-sensitive actions are easier to audit explicitly. Put the admin-deletion
  rule atomically in the user model instead.
- **Request-owning `intentAction`:** prefer a small
  `dispatchIntent(formData, handlers)` only if the three routes remain repetitive after
  their business flows are extracted.
- **Field-type plugin architecture, composite model accessors, generic admin-list
  abstractions, and barrel-everything:** still not justified by current scale.

## Sequencing and effort

| Phase                        | Size        | Risk                                        | Depends on   |
| ---------------------------- | ----------- | ------------------------------------------- | ------------ |
| 0 Standalone fixes/deletions | S           | low; logger policy is a decision            | —            |
| 1 Auth/event vocabulary      | S–M         | low, with boundary validation               | —            |
| 2 Admin middleware           | M–L         | medium; authorization surface               | 1            |
| 3 Event image lifecycle      | M           | medium–high; transactional storage behavior | ideally 1    |
| 4 Events feature extraction  | L           | medium; import and view-model churn         | 1, ideally 3 |
| 5 Domain-adjacent cleanup    | M           | low–medium                                  | ideally 4    |
| 6 Structural decisions       | independent | varies; relation redesign highest           | independent  |

Suggested branches/PRs: standalone bugs, auth middleware, image lifecycle, event utility
moves, event UI/view models, and cleanup. Keep the recent forms subsystem unchanged
throughout those branches.
