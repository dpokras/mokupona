# Customizable Signup Form — Agent Session Plan

Companion to [`design.md`](./design.md) and [`implementation-plan.md`](./implementation-plan.md). Splits the four phases into **seven sequential agent sessions** (plus one recurring session shape for Phase 3). Each session ends at a checkpoint where the app is fully working, `npm run typecheck && npm run test && npm run lint` are green, and the diff is committed — so any session can be the last one shipped.

## Protocol (every session)

1. **Start:** read `design.md`, `implementation-plan.md`, and this file. Check the status table below for where the previous session left off and any deviation notes.
2. **Scope discipline:** do only this session's items. If you discover work that belongs to a later session, add a note under _Deviations & discoveries_ — do not do it.
3. **End:** all checks green, work committed on `dev`, tick the status row, and record deviations/discoveries below.
4. Commits are the state carrier between sessions; this doc is the coordination carrier — commit its status updates alongside the session's work.

## Status

| #   | Session                                            | Phase        | Status                                      |
| --- | -------------------------------------------------- | ------------ | ------------------------------------------- |
| 1   | Branch cleanup + generic forms library             | cleanup + 0a | ☑                                           |
| 2   | Signup page renders via registry (old storage)     | 0b           | ☑                                           |
| 3   | Storage: schema, migration, backfill, models       | 1a           | ☑                                           |
| 4   | Attendee read layer + admin/CSV switch             | 1b           | ☑                                           |
| 5   | Write-path switch to FormSubmission                | 1c           | ☑                                           |
| 6   | Admin builder UI — core                            | 2a           | ☑                                           |
| 7   | Builder guardrails + full e2e sweep                | 2b           | ☑                                           |
| 8+  | New field types (one session each, `select` first) | 3            | ☑ `select` shipped; further types on demand |

## Deviations & discoveries

_(append here, newest first, prefixed with the session number)_

- **S8 (review):** `SelectFieldSchema` now rejects duplicate options (they double as answer values and rendering keys), options containing line breaks (making the one-per-line round-trip actually safe — the earlier claim that trim+min(1) forbade them was wrong), and options over `MAX_SELECT_OPTION_LENGTH = 100`. Toggling a row's type away from select keeps the typed options in play via a hidden input instead of dropping them with the unmounted textarea. Per-element option issue paths collapse onto the row's options textarea so future per-option rules can't fail invisibly; the sync-nudge twin only carries `options` for select rows.

- **S8 (`select`):** The Phase-3 template holds: one folder (`select/model.ts` + `view.tsx`), a registry entry, a `zodForField` case, builder support, unit tests, one e2e touch — no migration. Options are plain strings (label = value, v1) with `MAX_SELECT_OPTIONS = 20` in `bounds.ts`; the rendered select carries an empty "Select…" option so "nothing chosen" stays representable (required rejects it, optional coerces to `undefined`). `zodForField` now switches on `descriptor.type` directly so cases can narrow to type-specific data. The builder edits options as one-per-line text (split/joined in the row transforms — an option containing a newline is unrepresentable, which the schema anyway forbids via trim+min(1) per line at authoring); the sync-nudge twin copies the options along. `SelectFieldSchema`'s min/max issue paths land on the row's options textarea.

- **S7 (review):** Locking is driven by `eventHasSignups`, which counts **legacy `EventResponse` rows too** — they merge into the roster under the same keys, so a rename splits their columns just the same (previously pre-migration dinners got no locks at all). Existence checks use `findFirst`, not `count`.
- **S7 (review):** "Reset to default" now asks for confirmation (with a stronger warning when signups exist) — it previously bypassed both guardrails in one click. Stored-row identity for locking/pinning is captured **at mount from Conform's row keys** (a `useRef` set): `initialValue` is rewritten by intents (the label auto-slug `update`, the twin `insert`), which had two consequences — brand-new rows locked their keys the moment the auto-slug ran, and a custom row auto-slugged to "email" would have morphed into a pinned row. One lock predicate is computed per row and passed down.
- **S7 (review, accepted):** Key immutability remains UI-only, per the session spec ("UI enforcement; server already validates via versioning policy"). A server-side rename check is not implementable coherently: a rename is indistinguishable from remove+add, both of which are legitimate; the versioning policy keeps every stored answer interpretable regardless.
- **S7 (review):** The e2e signup fill blocks were deduplicated into `fillSignupContact`/`acceptPrivacyAndJoin` in `upload-test-utils.ts`; the sync-nudge twin spreads `NEW_ROW`.

- **S7:** The sync nudge is an always-available per-row button ("Also ask each friend" / "Also ask the signer"), shown while the row has a key and the other scope lacks it — not a one-time prompt at add time. It inserts the twin with the same key, type, and label.
- **S7:** Key immutability is scoped: keys lock (readOnly + explanatory label) only for rows that existed when the edit screen loaded (`initialValue` key present) and only when the event's form has submissions (`eventHasFormSubmissions`); new fields always pick their keys freely. The remove-warning is a `window.confirm` on the same rows. "Reset to default" dispatches Conform's `update` intent with the default rows.
- **S7:** Legacy `EventResponse` rows can no longer be produced through the app, so the e2e sweep gained a test-only `create-legacy-response` db command. The sweep test covers: locked keys once submissions exist, an edit-with-submissions forking a new version, old submissions still exporting, and one CSV mixing legacy + v1 + v2 rows under the latest header labels.

- **S6 (review):** Builder validation errors now actually render: each row shows its row-level errors (duplicate keys, cross-scope type conflicts land on row paths), the friends section shows `itemFields`-level errors (the min-1 rule), and item rows their own. Previously a blocked submit looked like a dead button. Pinned-ness is decided by the row's **initial** key, not the live value — typing the key "email" into a custom row no longer morphs it into an unremovable pinned row. A cleared "Maximum friends" input is a validation error instead of silently storing `maxCount: 0`.
- **S6 (review):** Dinner **edit** now persists event data and form schema in one transaction (`updateEvent(id, data, formFields?)` composing `saveFormSchemaInTx`) — previously a form-save failure after the event write left a half-applied save. Single sources of truth: `FIELD_KEY_REGEX` exported from `fields/base.ts`, `FIXED_IDENTITY_FIELDS` exported from the profile (the UI pin set derives from it), `NON_LIST_FIELD_TYPES` exported from the registry with a compile-time completeness check (builder enum + type options derive from it).
- **S6 (review, accepted):** `EventSchema` hard-requires `signupForm` — a classic-fields-only programmatic POST to the dinner actions now fails validation. Intended: the admin UI always submits rows and the design wants every event write to carry a validated form.
- **S6 (review, deferred):** The builder round-trip re-attaches constant `addLabel`/`removeLabel` (and `required: false`) to the friends list, so a stored schema with non-default values (only reachable by manual DB edits today) would be silently normalized on the next save. Revisit if the builder ever exposes those knobs.

- **S6:** The builder's value model (`app/features/signup-form/builder.ts`) is one flat row shape for every field (list extras optional) instead of a union — Conform field arrays stay simple. Profile rules aren't restated: `SignupFormBuilderSchema` transforms rows to descriptors and runs `SignupFormSchema` inside a `superRefine`, mapping issue paths back onto rows, so client validation, server validation, and persistence share one rule set. `EventSchema` gained the `signupForm` field, so the dinner create/edit actions validate the builder as part of the normal form parse.
- **S6:** `descriptorsToBuilderRows` → `builderRowsToDescriptors` round-trips `DEFAULT_FORM` exactly (pinned by unit test) so an untouched edit hits the §9 deep-equal skip. The friends `addLabel`/`removeLabel` are not exposed in the builder (v1) and are re-attached as constants equal to `DEFAULT_FORM`'s.
- **S6:** Pinned rows (identity fields, friends list) keep their fixed values in play via hidden inputs — disabled inputs would not submit; the server re-validates the profile regardless. Identity labels stay editable; reorder is free for every row; removal only for custom fields. Field keys derive from the label on blur while the key input is still empty (`slugifyFieldKey`).
- **S6:** The edit screen shows the **default** form when the stored schema is unparseable (bug state) — saving then repairs the event's form. Both dinner routes now wrap `AdminDinnerForm` in Conform's `FormProvider` (the builder's intent buttons need form metadata from context).
- **S6:** The builder-edit e2e (relabel a field + set `maxCount` 0, verify the public page loses the friends button) already covers Session 7's "friends disabled end-to-end" sweep item. The e2e dinner-form helpers moved from `admin-dinner-uploads.cy.ts` into `upload-test-utils.ts` for reuse.

- **S5 (review):** The submission now pins the **rendered** version, not just the current one: the form posts a hidden `formVersionId`, the action rejects a mismatch with a "form was updated, please review" error (answers to removed fields would otherwise be silently stripped by zod), and `createFormSubmission` takes an `expectedVersionUpdatedAt` guard that aborts the insert inside a transaction if an in-place schema update raced the request (`FormVersionChangedError`). Client-side, `SignupForm` is keyed on the schema **content** (not the version id) so an in-place update remounts the form instead of leaving a stale memoized schema blocking validation.
- **S5 (review):** The "Go straight to sign-up" button now hides together with the signup section when the stored schema is unparseable (it pointed at a dead anchor). The degraded-schema parse+log block was extracted to `parseStoredFormSchemaOrLog` (`serialization.server.ts`, four call sites); loader and action parallelize event + version queries via `getCurrentFormVersionForEvent`. The new e2e no longer asserts a seed-coupled row count and guards against pre-navigation URL capture and the not-yet-inserted friend fieldset.
- **S5 (review, deferred):** Absence semantics (checkbox → `false`, list → `[]`) live as a type switch in `normalizeSubmissionValues` rather than in the per-field registry. Revisit when a Phase-3 type with its own absence semantics (e.g. `select`) lands — moving it then keeps today's code simpler.

- **S5:** The S2 checkbox requirement is discharged by `normalizeSubmissionValues` (generic, `app/features/forms/normalize-submission.ts`): stored answers always carry explicit `false` for unchecked checkboxes (top-level and per list item), `[]` for absent lists, and no `undefined` values. Verified against the dev DB after the e2e run.
- **S5:** The signup form moved into a `SignupForm` subcomponent — `useForm` can't be called conditionally, and the section must disappear entirely when the loader reports an unparseable stored schema (`formFields: null`, design §11). The component is keyed on `formVersionId` and memoizes the schema on it (S2's loader-key note honored: `formFields` + `formVersionId`).
- **S5:** If the action itself hits an unparseable stored schema it 500s — the loader never rendered a form in that state, so no legitimate submission can arrive.
- **S5:** `event-response.server.ts` is now read-only (`getEventResponsesForEvent` for the legacy merge); both write helpers are gone. The e2e suite gained the Phase-1 acceptance test: a signup with a friend appears in the admin table and the CSV export alongside existing rows (full suite 20/20).

- **S4 (review):** Answers are **not** strictly re-validated on read anymore. The review showed `buildSubmissionSchema` is stricter than what valid writers can store (absent optional `friends` key, optional email persisted as `""`), so one drifted shape would silently drop a whole party from the roster. `flattenSubmission` now extracts structurally (typeof-filtered against the pinned version's descriptors); the schema blob itself is still Zod-validated. This amends design §3's "every Json is Zod-validated on read" for `answers` — deliberate: a reader must never be stricter than any writer.
- **S4 (review):** The CSV export can no longer come back header-less: the column union falls back current version → `DEFAULT_FORM` when every parse fails. `buildCSVObject` now does real RFC-4180 escaping (embedded quotes doubled — previously a quoted value produced a misparsing row) and reports `size` in UTF-8 bytes (`data.length` undercounted non-ASCII and truncated downloads via Content-Length). The download filename strips non-`[\w.-]` characters (quotes/emoji in a title made the header invalid).
- **S4 (review):** `saveFormSchema`'s in-place update re-checks `submissions: { none: {} }` inside the UPDATE itself, so a submission landing between the count read and the write forks a new version instead of mutating the version it just pinned. Distinct form versions are parsed once per roster load (not once per submission); the table path no longer computes columns or fetches the current version; both signups loaders parallelize their queries.

- **S4:** CSV headers are now label-derived (design §8), so three header texts change for existing data: "Phone" → "Phone number", "Vegetarian/Vegan" → "Vegan / Vegetarian", "Restrictions" → "Dietary restrictions". Row **values** were verified identical against a migrated copy of the dev DB (script compared the legacy formatter with the read layer per event).
- **S4:** The read layer exports `getAttendeeRosterForEvent(eventId) → { attendees, columns }` alongside the design's `getAttendeesForEvent` — the CSV needs the column union and labels, and computing them belongs with the signup semantics. Two judgment calls in the column union: an event with **no** submissions falls back to its **current** version's fields (spec text only mentions versions with submissions), and the legacy-default columns merge in only when the event actually has legacy rows.
- **S4:** Attendees are ordered by `createdAt` across legacy and new rows (the old table used insertion order, which for legacy rows is the same thing).
- **S4:** On read, answers re-validate through `buildSubmissionSchema` of their pinned version; a parse failure logs at error level and skips that submission (a bug case — every writer validates). Absent optional answers surface as missing keys and print as `""` in the CSV; **absent checkboxes stay absent on read** — reaffirming the S2 note that Session 5 must write explicit `false`.

- **S3 (review):** DB-level `ON DELETE CASCADE` paths into `Event` (from `User`, `Address`, and `Image`) bypassed `deleteEvent` and orphaned form rows. The app-level cascade now lives in `deleteEventsInTx`, and `deleteUserById`/`deleteUserByEmail`, `deleteAddress`, and the cypress `delete-image` task run it in the same transaction before deleting the cascading parent. Pinned by a regression test (user delete removes the events' form data). **Any future delete path that can reach `Event` must do the same.**
- **S3 (review):** `saveFormSchema` and `createEvent` re-parse their input through `FormSchema` before comparing/persisting: comparing the Zod-normalized stored schema against raw caller fields misdetected semantically identical saves as changes (spurious versions once submissions exist), and no descriptor blob can reach the DB unvalidated anymore (profile validation via `SignupFormSchema` remains the event actions' job in Session 6). The "current version" query is defined once (`currentVersionArgs`).
- **S3 (review):** The Session-2 signup fan-out now writes all attendees in one transaction (`createEventResponses`); previously a partial failure persisted a subset and the "please try again" error invited duplicating them. The orphaned single-row `createEventResponse` was deleted.
- **S3 (review):** Cleanups from the review: text/email/phone views collapsed into a `makeInputFieldView` factory; view registries are compile-checked by a mapped `ViewsFor` type (wrong-key registration no longer type-checks; lookups stay deliberately erased); the dinner new/edit routes share `toAddressOptions`/`splitUploadActionData`; the test factory batches independent creates.
- **S3 (review, deferred):** The signup action's past-event guard still returns 400 where 403 is meant — left alone because [`route-module-conventions/action-plan.md`](../route-module-conventions/action-plan.md) Phase 1 already tracks exactly that line.

- **S3:** Design §3.2's delete order "submissions → versions → form → event" is unexecutable as written: `Event.formId → Form` is `onDelete: Restrict`, so the event row must go before its form. `deleteEvent` deletes submissions → versions → **event → form** in one transaction.
- **S3:** DB-backed unit tests run against `prisma/test.db`, recreated from the real migrations by a vitest `globalSetup` on every run (which re-verifies the migration chain on an empty DB); `test.env` overrides `DATABASE_URL` (dotenv never overrides existing vars). `fileParallelism: false` — SQLite has one writer, and parallel workers aborted read-then-write transactions with `SQLITE_BUSY`.
- **S3:** `cypress/support/upload-test-records.ts` switched from raw `prisma.event.create`/`.delete` to the `createEvent`/`deleteEvent` model helpers — raw creates would now violate the non-null `formId`, raw deletes would orphan form rows. The seed likewise creates events through `createEvent`.
- **S3:** Backfilled `Form`/`FormVersion` ids are derived from the event id (`'form_' || id`) instead of cuids — SQLite can't mint cuids and the id column only needs uniqueness. Verified against a copy of the dev DB: backfill parses via `FormSchema` and deep-equals `DEFAULT_FORM`, and a Prisma-written `Json` round-trips identically to the SQL-written literal.
- **S3:** `createEvent`'s signature changed to `(data, formFields = DEFAULT_FORM)` with `formId` stripped from the input type — callers can't supply their own form row; the event and its form/v1 are created in one transaction. Session 6's builder should pass authored descriptors as the second argument.

- **S2 (review):** The action no longer fakes success when the DB write fails — the legacy `.catch` swallowed `createEventResponse` rejections and still showed the "Signup complete" toast (a bug carried over from main). It now logs at error level and returns a form-level error; the page renders `form.errors` via a new `ErrorList` above the submit button.
- **S2 (review):** The adapter's `SignupAnswersSchema` parse fails soft: `safeParse` + an error log + a form-level "Something went wrong" reply instead of an uncaught ZodError 500, in case the hand-written adapter ever drifts from `DEFAULT_FORM` before Session 5 deletes it.
- **S2 (review):** Two deliberate validation divergences from the legacy schema, pinned by tests in `parity.test.ts`: whitespace-only names are now **rejected** (legacy stored an empty name), and whitespace-padded emails are now **accepted and trimmed** (legacy rejected them because `z.email()` saw the padding).
- **S2 (review):** `EmailField` renders `type="email"` again (the rewrite had downgraded it to `text`, losing the mobile email keyboard); list `.max`/`.min` bounds got label-derived messages ("Friends can have at most 3 entries") replacing zod's raw default — the legacy custom text ("You can't sign up more than 4 people") was only reachable via crafted POSTs.
- **S2 (review):** The parity test now compares parsed _values_ (normalized across vocabularies), not just accept/reject status; the action's schema is built once at module scope.

- **S2:** `zodForField` gained user-facing error messages derived from the label (`${label} is required`; email format errors say `${label} is invalid`). Without them the registry-driven page would show zod's raw "expected string, received undefined" where the live form said "Name is required". Deliberate message change: a _malformed_ (not missing) email now reads "Email is invalid" instead of the legacy quirk "Email is required".
- **S2:** Conform's coercion strips **unchecked optional checkboxes from the parse output entirely** — the `.default(false)` in `zodForField` never runs under `parseWithZod` (it does under plain `.parse`, which is what the unit tests exercise). The route's temporary adapter schema re-applies `.default(false)` before the `createEventResponse` fan-out. **Session 5 must keep an equivalent normalization when writing `FormSubmission.answers`** (store explicit `false`, not absent keys) or teach the read layer to treat absence as false.
- **S2:** The empty-list case from the S1 note is confirmed end-to-end: `parseWithZod` yields `friends: []` when no friend inputs are submitted (parity test) and the solo-signup e2e passes.
- **S2:** The loader key for the descriptors is `formFields` (not `form`) — `form` collides with Conform's form object in the component. Session 5's loader should keep that name and add `formVersionId`.
- **S2:** Incidental fix: the failed-submission log's `submission.payload["email"]` lookup now actually finds the email — under the legacy schema the payload key was `signupPerson.email`, so that log line always recorded `unknown@no-domain.com`.

- **S1 (review):** `ListField` reads the form metadata via Conform's `useFormMetadata()` context instead of a `formMetadata` prop, so every field view shares the `{fieldConfig, fieldMetadata}` contract and the type-erased registry can't hide a missing prop. **Session 2's route must wrap the rendered fields in `<FormProvider context={form.context}>`.**
- **S1 (review):** `buildSubmissionSchema` now maps `required: true` on a list to `.min(1)`; previously the flag was silently ignored for lists.
- **S1 (review):** `SignupFormSchema` pins the identity fields' types (`name`=text, `email`=email, `phone`=phone) and carries its own `MAX_FRIENDS_COUNT = 10` so raising the generic `MAX_LIST_COUNT` never loosens the signup profile.
- **S1 (review, deferred):** `ListField`'s default layout classes (`gap-20` etc.) mirror the signup page; if a non-signup consumer ever needs different layout, expose className/slot overrides then rather than speculatively now.

- **S1:** The signup route was not restored to main's literal file — main is on react-router 7, the branch on v8. Behavior, schema, action, and JSX match main exactly; only the v8 type adaptations were kept (`Route.ComponentProps` props instead of hooks, `loaderData` in meta args, no `invariant` on typed params), plus the branch's fix of main's copy-paste bug where a friend's Student checkbox displayed `alternativeMenu.errors`.
- **S1:** The "drop the `createEventResponse` object-arg refactor" item was a no-op — `app/models/event-response.server.ts` has no diff vs main (the refactor was already reverted before this session).
- **S1:** `zodForField` and the non-list descriptor union/views live in `app/features/forms/fields/non-list.ts` (re-exported from `fields/index.ts`) rather than in `index.ts` itself, so the `list` field's model/view can import them without an import cycle.
- **S1:** Conform's zod integration coerces a missing field-list to `[]` at parse time, but plain `schema.parse` does not — a submission missing the `friends` key fails `buildSubmissionSchema` validation. Irrelevant while unconsumed; Session 2's route (which uses `parseWithZod`) should confirm the empty-list case end-to-end.

---

## Session 1 — Branch cleanup + generic forms library (Phase 0a)

The library exists and is correct; the public page is temporarily reverted to main's known-good version so nothing user-visible depends on the new code yet.

- All of "Branch cleanup" from the implementation plan: delete `scope`/`FieldScope`, rename descriptor key `id` → `name`, fix `default-form.ts` (structure per design §5.1; `studen`→`student`, `alternate_menu`→`vegetarian`, `diet_restrictions`→`restrictions`), revert `acceptPrivacy`→`acceptedPrivacy` rename, drop the `createEventResponse` object-arg refactor.
- Move generic parts to `app/features/forms/` (fields, registry, bounds, serialization); signup-specific parts stay in `app/features/signup-form/`.
- Implement the `list` field type (`model.ts` + `view.tsx`, design §4.1).
- Implement `buildSubmissionSchema`, bounds (`MAX_TOTAL_FIELDS`, `MAX_LIST_COUNT`, per-scope name uniqueness, cross-scope same-name ⇒ same-type, design §4.2).
- `SignupFormSchema` profile refinements + `buildSignupSchema` (design §5, §6.1).
- **Restore [`app/routes/dinners_.$dinnerId.tsx`](../../app/routes/dinners_.$dinnerId.tsx) to main's version** (`git show main:...`) — the branch copy is broken against the new schema; the registry-driven rewrite is Session 2's job.
- Unit tests: `zodForField` per type; `buildSubmissionSchema` (top-level + list, `maxCount` incl. 0); `FormSchema` bounds; `SignupFormSchema` profile.

**Acceptance:** checks green; public signup page behaves exactly as on `main`; the new library is complete and unit-tested but unconsumed by routes.

## Session 2 — Signup page renders via registry, old storage (Phase 0b)

- Rewrite the signup route: loader supplies `DEFAULT_FORM`, registry-driven render (incl. the friends `list`), `buildSignupSchema` for client + server validation.
- Temporary adapter in the action: map `{…, friends: […]}` onto today's per-attendee `createEventResponse` fan-out (friends inherit signer email/phone, as now).
- Privacy checkbox + submit button hardcoded after mapped fields (design §6.2).
- Parity test: `DEFAULT_FORM` ⇔ [`event-signup-validation.ts`](../../app/utils/event-signup-validation.ts).
- E2E: default signup, add-a-friend, validation errors.

**Acceptance:** Phase 0 acceptance — page functionally identical, data written identically, checks green.
**Rollback:** revert route to main's JSX.

## Session 3 — Storage: schema, migration, backfill, models (Phase 1a)

Purely additive; no consumer changes, nothing user-visible.

- Prisma: `Form`, `FormVersion`, `FormSubmission`, non-null unique `Event.formId` (design §3).
- Migration backfills one `Form` + `FormVersion` v1 (`DEFAULT_FORM`) per existing event, then makes `formId` non-nullable (design §3.1). Verify against a copy of a realistic DB.
- `app/models/form.server.ts`: current-version lookup, §9 versioning policy (deep-equal skip / in-place while unsubmitted / new version).
- `app/models/form-submission.server.ts`: `createFormSubmission`, submissions-for-event query.
- `app/models/event.server.ts`: create form inside event creation; app-level cascade delete transaction (design §3.2).
- Seeds + test factories create forms with events.
- Unit tests: versioning policy; event create/delete round-trips form rows.

**Acceptance:** migration runs cleanly; every event has a form; new tables sit unused; checks green.

## Session 4 — Attendee read layer + admin/CSV switch (Phase 1b)

Reads switch **before** writes so there is never a window where new signups are invisible to admins. With only legacy rows in the DB, output must be identical to today.

- `app/features/signup-form/read.server.ts`: `getAttendeesForEvent` + `Attendee` (flattening, submission-level replication, legacy merge with `isSigner: null` — design §8).
- Switch [`admin.dinners.$dinnerId_.signups.tsx`](../../app/routes/admin.dinners.$dinnerId_.signups.tsx) and [`admin.dinners.$dinnerId.[signups.csv].tsx`](../../app/routes/admin.dinners.$dinnerId.[signups.csv].tsx) to consume `Attendee[]` (CSV: name-keyed column union across versions with submissions, headers from latest labels).
- Unit tests: flattening, replication rule, legacy merge; also cover a synthetic `FormSubmission` even though production writes don't exist yet.

**Acceptance:** admin table and CSV identical to today for existing data; read-layer unit tests also pass for new-format submissions; checks green.

## Session 5 — Write-path switch to FormSubmission (Phase 1c)

The one risky flip, kept deliberately small.

- Loader passes the current `FormVersion`'s descriptors + version id; schema memoized on `formVersionId`.
- Action re-reads the current version from DB, rebuilds the schema, strips `acceptedPrivacy`, writes **one** `FormSubmission` (design §7). Drop the Session-2 adapter; `EventResponse` writes stop.
- E2E: new signup (solo + with friends) appears in admin table and CSV alongside legacy rows.

**Acceptance:** Phase 1 acceptance; checks green.
**Rollback:** restore the Session-2 adapter action.

## Session 6 — Admin builder UI, core (Phase 2a)

- "Signup form" section in [`admin-dinner-form.tsx`](../../app/components/admin-dinner-form.tsx): Conform field array of descriptor rows (type select, label, required, up/down reorder); friends list pinned with editable `itemFields` + `maxCount` 0–10; `name`/`email`/`phone` pinned (design §10).
- Field keys slug-derived from label on add, captioned "Field key"; duplicate/over-budget rejected client-side.
- Event create/edit actions validate with `SignupFormSchema` and persist via the §9 versioning policy.
- E2E: builder round-trip (create/edit form, reload shows it); a custom field round-trips signup → admin → CSV.

**Acceptance:** organizers can author custom forms end-to-end; checks green.
**Rollback:** hide the builder section.

## Session 7 — Builder guardrails + full e2e sweep (Phase 2b)

- Sync nudge: "also ask this for each friend?" twin creation (same `name` + type), and vice versa.
- Field keys immutable once submissions exist (UI enforcement; server already validates via versioning policy).
- Warn before removing a field with responses; "Reset to default".
- Remaining e2e from the cross-cutting list: friends disabled (`maxCount: 0`) end-to-end; editing a form with submissions creates a new version and old submissions still export; CSV with mixed legacy + multi-version rows.

**Acceptance:** Phase 2 acceptance in full; checks green.

## Sessions 8+ — Phase 3, one field type per session

Template per type (`select` first, then `number`, `date`, … on demand): one folder (`model.ts` + `view.tsx`), registry entry, `zodForField` case, builder support (e.g. options editor with an option-count bound for `select`), unit tests, one e2e touch. No migration. Data-shape changes get a new `version` literal + upconverter, never in-place edits (design §4).
