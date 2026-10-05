# Customizable Signup Form — Implementation Plan

Companion to [`design.md`](./design.md). Four phases, each independently shippable. Phase 0 carries zero user-visible risk; the storage switch is isolated in Phase 1; the builder UI lands in Phase 2.

**Storage recap:** `Form` (stable anchor, `Event.formId` non-null unique) → `FormVersion` (immutable snapshots, `version Int`, `schema Json`) → `FormSubmission` (`answers Json`, one row per submission, FK to the version answered). `EventResponse` is frozen legacy, merged on read. Every event has a form (backfill).

---

## Branch cleanup (before or with Phase 0)

Code already on this branch targets the superseded scope-based design and must be reconciled:

- [ ] **Keep:** the field folders `app/features/signup-form/fields/{text,email,phone,textarea,checkbox}` (model + view), the registry pattern in `fields/index.ts`, `FormSchema`.
- [ ] **Delete `scope`** from [`fields/base.ts`](../../app/features/signup-form/fields/base.ts) and `FieldScope` from [`fields/types.ts`](../../app/features/signup-form/fields/types.ts); rename the key property `id` → `name`.
- [ ] **Rewrite [`build-schema.ts`](../../app/features/signup-form/build-schema.ts):** the scope-picking `signupPerson`/`people`/`group` builder is dead; replaced by the generic structural builder (design §6.1).
- [ ] **Fix [`default-form.ts`](../../app/features/signup-form/default-form.ts):** new structure (design §5.1); fix key `studen` → `student`; rename `alternate_menu` → `vegetarian`, `diet_restrictions` → `restrictions` (keys must equal legacy column names).
- [ ] **Revert the accidental field rename** `acceptPrivacy` → `acceptedPrivacy` (the live form's current name).
- [ ] **Drop the `createEventResponse` object-arg refactor** — `EventResponse` is frozen; new writes go to `FormSubmission`.
- [ ] **Repair [`dinners_.$dinnerId.tsx`](../../app/routes/dinners_.$dinnerId.tsx):** the action still destructures old keys (`comment`, `alternativeMenu`, `dietaryRestrictions`) that the branch schema no longer produces, and the JSX mixes old static field names with the new schema. Resolved by the Phase 0 rewrite below.

---

## Phase 0 — Generic primitives render today's form (zero behavior change, old storage)

Goal: the `app/features/forms/` generic layer exists; the public signup page renders `DEFAULT_FORM` through the registry-driven renderer, **including the `list` field type for friends**, while still validating and writing exactly as today (`createEventResponse` per attendee, positional args untouched). No DB change.

- [ ] Move/rename generic parts to `app/features/forms/` (fields, registry, bounds, `buildSubmissionSchema`, serialization); signup-specific parts stay in `app/features/signup-form/` (`DEFAULT_FORM`, `buildSignupSchema`, profile).
- [ ] Implement the `list` field type: `model.ts` (design §4.1: `maxCount`, `addLabel`, `removeLabel`, `itemFields` of non-list types) + `view.tsx` (Conform field-list wrapper, list-level errors, renders nothing at `maxCount: 0`).
- [ ] Implement bounds: `MAX_TOTAL_FIELDS = 40` (recursive), `MAX_LIST_COUNT = 10`, per-scope `name` uniqueness, cross-scope same-`name` ⇒ same-type (design §4.2).
- [ ] `SignupFormSchema` profile refinements (design §5).
- [ ] Rewrite the signup page: registry-driven render of `DEFAULT_FORM`, `buildSignupSchema` for validation; a small temporary adapter in the action maps the new answer shape (`{…, friends: […]}`) onto today's per-attendee `createEventResponse` fan-out (friends inherit signer email/phone, as now).
- [ ] Parity test: `DEFAULT_FORM` produces the same rendered field set and validation behavior as [`event-signup-validation.ts`](../../app/utils/event-signup-validation.ts) (regression anchor).

**Acceptance:** signup page functionally identical (manual + e2e: default signup, add-a-friend, validation errors); data written identically to today; `npm run typecheck`, `test`, `lint` green.

**Rollback:** revert the route to the hand-written JSX; no data impact.

---

## Phase 1 — New storage + read layer + admin/CSV switch

Goal: the three tables exist, submissions are written per-submission, and both admin consumers read through `getAttendeesForEvent`. This is the risk-bearing phase; everything user-visible on the public page stays unchanged.

- [ ] **Migration:** create `Form`/`FormVersion`/`FormSubmission`; backfill one `Form` + `FormVersion` v1 (`DEFAULT_FORM`) per existing event; add non-null unique `Event.formId` (design §3, §3.1). Update seeds/factories to create forms with events.
- [ ] `app/models/form.server.ts`: current-version lookup (`max(version)`), versioning policy (deep-equal skip / in-place update while unsubmitted / new version otherwise — design §9).
- [ ] `app/models/form-submission.server.ts`: `createFormSubmission`, submissions-for-event query (`formVersion.formId = event.formId`).
- [ ] `app/models/event.server.ts`: create the form inside event creation; app-level cascade delete (submissions → versions → form → event, one transaction — design §3.2).
- [ ] Signup route: loader passes the current version's descriptors + version id; action re-reads the version from DB, rebuilds the schema, writes **one** `FormSubmission` (drop the Phase-0 adapter; `EventResponse` writes stop).
- [ ] `app/features/signup-form/read.server.ts`: `getAttendeesForEvent` + `Attendee` (flattening, submission-level replication, legacy merge with `isSigner: null` — design §8).
- [ ] Switch [`admin.dinners.$dinnerId_.signups.tsx`](../../app/routes/admin.dinners.$dinnerId_.signups.tsx) and [`admin.dinners.$dinnerId.[signups.csv].tsx`](../../app/routes/admin.dinners.$dinnerId.[signups.csv].tsx) to `Attendee[]` (CSV: name-keyed column union across versions, headers from latest labels).

**Acceptance:** a new signup produces one `FormSubmission` referencing the current version; admin table and CSV show old (legacy `EventResponse`) and new signups together, one line per attendee, same columns/values as today for default-form events; event create/delete round-trips form rows.

**Rollback:** revert the route/action to Phase 0 (old write path); new tables are additive and can sit unused.

---

## Phase 2 — Admin form-builder UI

Goal: organizers author the form in the dinner create/edit screens. Custom forms become user-visible here.

- [ ] "Signup form" section in [`admin-dinner-form.tsx`](../../app/components/admin-dinner-form.tsx): Conform field array of descriptor rows (type select, label, required; up/down reorder), friends list pinned (item fields editable, `maxCount` 0–10, no add/remove/rename of the list itself), `name`/`email`/`phone` pinned (design §10).
- [ ] Field keys: slug-derived from label on add, immutable once submissions exist, captioned "Field key"; duplicate/over-budget rejected client-side, mirrored by `SignupFormSchema` server-side.
- [ ] Sync nudge: "also ask this for each friend?" twin creation (same `name` + type).
- [ ] Warn before removing a field that has responses; "Reset to default".
- [ ] Event actions validate with `SignupFormSchema` and persist via the §9 versioning policy.

**Acceptance:** create/edit a form in the UI; reload shows it; a custom field (signer-only and per-attendee) round-trips signup → admin table → CSV; editing a form with existing submissions creates a new version and old submissions still export correctly; `maxCount: 0` hides friend signup end-to-end.

**Rollback:** hide the builder section; stored forms keep working.

---

## Phase 3 — Grow field types (ongoing)

Each new type = one folder (`model.ts` + `view.tsx`) + registry entry + `zodForField` case. No migration. `select` first (options editor in the builder, option-count bound), then `number`, `date`, … on demand. If a field type's `data` shape ever changes, add a new `version` literal and an upconverter — never edit the old shape in place (design §4).

---

## Cross-cutting

**Tests**

- Unit: `zodForField` per type; `buildSubmissionSchema` (top-level + list structure, `maxCount` incl. 0); `FormSchema` bounds (recursive count, per-scope uniqueness, cross-scope type match); `SignupFormSchema` profile; versioning policy (skip / in-place / new version); `getAttendeesForEvent` (flattening, replication rule, legacy merge).
- Parity: `DEFAULT_FORM` ⇔ [`event-signup-validation.ts`](../../app/utils/event-signup-validation.ts).
- E2E (cypress): default signup; add-a-friend; friends disabled (`maxCount: 0`); custom-form signup; CSV export incl. mixed legacy + new rows; builder round-trip.

**Known gotchas**

- Client and server must build the schema from the same persisted `FormVersion`; the action re-reads from the DB and never trusts client descriptors.
- Never delete events outside the data-access-layer cascade helper (design §3.2).
- Field keys and submitted-against versions are immutable; the builder must enforce both.
- `acceptedPrivacy` stays hardcoded in the page; the `maxCount`/field-count ceilings stay code constants.
