# Forms / signup-form decoupling

Status: **proposed 2026-07-26**, not started.

Supersedes `docs/forms-architecture-migration/plan.md` (v4, on
`chore/forms-refactor`) — that plan restructured the whole feature into L0–L4
layers with a new `forms-ui` package. It was scoped far beyond the problem.
This plan fixes the actual coupling defects and stops.

Informed by three prototypes built 2026-07-23, on branches `proto/forms-api-a-extract`,
`proto/forms-api-b-registry` and `proto/forms-api-c-pipeline` (each carries a
`PROTOTYPE.md`). Direction A is the spine; one correction is taken from C;
B's `defineFormKind` factory is **not** adopted — see §6.

## Goal

`app/features/forms` should be a form engine that knows nothing about signup,
and `app/models` should be a data layer that knows nothing about signup. Both
are true today only by accident, in a handful of spots.

**No user-visible behaviour changes. No stored-data changes. No migration.**

## Current state

Five concrete defects:

| #   | Location                                                                   | Defect                                                                                            |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `app/features/forms/fields/index.ts:81-95`                                 | The cross-scope "same name ⇒ same type" rule is signup policy living in the engine                |
| 2   | `app/models/event.server.ts:5,138`                                         | The model layer imports `DEFAULT_FORM` and uses it as `createEvent`'s default                     |
| 3   | `app/features/forms/normalize-submission.test.ts:5`                        | An engine test depends on the signup fixture                                                      |
| 4   | `app/features/forms/serialization.ts:1`                                    | `parseStoredFormSchema` hardcodes `FormSchema`; read and write validators cannot be distinguished |
| 5   | `app/components/signup-form-builder.tsx:34`, `signup-form/builder.ts:7,11` | Deep imports into `forms/fields/{base,non-list}`; the engine has no public entry point            |

Defect 1 is the load-bearing one. That rule exists so `read.server.ts` can fold
a signer's answers and each `friends[i]` item into one column space — see
`read.server.ts:190` (`{ ...submissionLevel, ...personal }`) and the
`RosterColumn.name` doc comment ("the answers key and CSV merge key"). It is not
a truth about forms in general.

---

## 1. The versioning model this all rests on

`saveFormSchemaInTx` (`app/models/form.server.ts:45-82`):

- current version has **no submissions** → overwrite in place
- current version **has submissions** → freeze it, create version N+1

A stored version therefore survives **only when submissions are pinned to it**.
Every historical schema blob in the database has real attendee data attached.

## 2. Three readers, one failure mode

| Reader             | File                                          | Parses                                 |
| ------------------ | --------------------------------------------- | -------------------------------------- |
| Roster + CSV       | `signup-form/read.server.ts`                  | **every** version that has submissions |
| Public signup page | `routes/dinners_.$dinnerId.tsx:24-26`         | the current version                    |
| Admin edit prefill | `routes/admin.dinners.$dinnerId_.edit.tsx:13` | the current version                    |

All three go through `parseStoredFormSchemaOrLog`. On a parse failure the roster
does this (`read.server.ts:126-131`):

```ts
const descriptors = descriptorsByVersion.get(submission.formVersionId);
return descriptors ? flattenSubmission(submission, descriptors) : [];
```

The submission contributes **zero attendees**. No error page, no UI warning —
the signer and every friend silently drop out of the table and the CSV export.

**The rule that follows:** a reader must never be stricter than the writer that
produced the data. Profile rules belong to the moment of authoring; reading back
historical data must tolerate every profile that was ever legal. Combined with
§1, the versions most likely to fail a tightened profile are exactly the ones
holding real people.

## 3. Why two signup schemas

Validation strictness differs by position today, and correctly so:

```
WRITE   builder → SignupFormSchema     structure + cross-scope + profile
          ↓
        model  → FormSchema            structure + cross-scope
          ↓
        FormVersion.schema ────────────┐
                                       ↓
READ    all three readers → FormSchema  structure + cross-scope
```

Read is already looser than write. But that is true by accident — `FormSchema`
merely happens to be the generic one, and nothing records that the read path
must never move to `SignupFormSchema`.

Removing the cross-scope rule from `FormSchema` (defect 1) weakens the read
path, so signup must hand the readers a schema. Both existing candidates are
wrong:

| Candidate                         | Verdict                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `SignupFormSchema` (with profile) | Too strict — a future profile change makes historical versions unparseable, and §2 deletes their parties from the roster |
| `FormSchema` (structure only)     | Too loose — the `read.server.ts:190` merge is no longer guaranteed sound                                                 |

So signup gains the schema that sits between them:

```
StoredSignupFormSchema = structure + cross-scope
SignupFormSchema       = StoredSignupFormSchema + profile
```

`StoredSignupFormSchema` validates **exactly what `FormSchema` validates today**
— the read path keeps its current strictness precisely. This does not introduce
an asymmetry; it names one the app already depends on, so that step 3 below
cannot silently delete it.

---

## 4. Pull request plan

Four PRs, each independently releasable and behaviour-neutral.

### PR 1 — Extract the refinements

Engine-internal only; nothing outside `app/features/forms` changes.

- New `forms/fields/descriptor.ts` — `FieldDescriptorSchema`, `FieldDescriptor`,
  `FieldType`, `PlacedDescriptor`, `flattenIntoScopes`.
- New `forms/fields/refinements.ts` — `maxTotalFields`, `uniqueNamesPerScope`,
  `consistentTypeAcrossScopes` as named `(fields, ctx) => void` functions.
- `fields/index.ts` re-exports both and composes all three into `FormSchema`
  exactly as today.

The split exists because `refinements.ts` and `index.ts` both need
`flattenIntoScopes`; extracting `descriptor.ts` avoids the cycle.

`FormSchema` behaviour is unchanged. Prep only.

### PR 2 — Parameterize the stored parser

**Ordering matters: this lands before PR 3.** Doing it the other way round
leaves a release in which the read path has lost the cross-scope guarantee and
has nothing to replace it with.

- `forms/serialization.ts` — `parseStoredFormSchema(value)` →
  `parseStored(value, schema)`.
- `forms/serialization.server.ts` — `parseStoredFormSchemaOrLog(version)` →
  `parseStoredOrLog(version, schema)`; the log-and-degrade behaviour is
  untouched.
- New `signup-form/serialization.ts` / `.server.ts` binding those to
  `StoredSignupFormSchema`.
- New `StoredSignupFormSchema` in `signup-form/schema.ts`. At this point it is
  `FormSchema` unchanged; `SignupFormSchema` is redefined as
  `StoredSignupFormSchema.superRefine(profile)`, which is the same composition
  it has today.
- Call sites updated: `read.server.ts:3-4`,
  `routes/dinners_.$dinnerId.tsx:26`,
  `routes/admin.dinners.$dinnerId_.edit.tsx:13`, `models/form.server.ts:7`
  (the model passes the generic schema — it validates structure, not policy).

### PR 3 — Make the cross-scope rule opt-in

- `FormSchema` drops `consistentTypeAcrossScopes`.
- `StoredSignupFormSchema` adds it explicitly, with a comment pointing at the
  `read.server.ts:190` merge.
- The "rejects the same name across scopes with different types" assertion moves
  from `forms/fields/form-schema.test.ts` to a new `refinements.test.ts` that
  composes the rule the way signup does. Add the converse assertion: bare
  `FormSchema` does **not** enforce it.

This is the PR where the engine stops knowing about signup.

### PR 4 — Invert `DEFAULT_FORM` out of the model layer

- `createEvent(data, formFields)` — `formFields` becomes required;
  `event.server.ts` drops the `signup-form` import.
- Production call sites: `routes/admin.dinners.new.tsx:46` already passes
  explicitly; `prisma/seed.ts:103` and
  `cypress/support/upload-test-records.ts:217` pass `DEFAULT_FORM`.
- ~30 test call sites currently rely on the default. Rather than appending
  `DEFAULT_FORM` to each (which was most of prototype A's diff), add one
  `createTestEvent(data, fields = DEFAULT_FORM)` helper to `test/factories.ts`
  and repoint `models/event.server.test.ts`, `models/user.server.test.ts` and
  `signup-form/read.server.test.ts` at it.
- `forms/normalize-submission.test.ts` moves to `signup-form/` (defect 3) — its
  fixture is `DEFAULT_FORM`, so it is a signup test.

Ends with: `app/models` imports nothing from `app/features/signup-form`, and
`app/features/forms` imports nothing from it either.

---

## 5. Not in scope

Defect 5 (deep imports / no public entry point) is left alone. A barrel for
`app/features/forms` is worth doing, but it touches every importer and shares no
mechanism with the four PRs above; it should be its own change once this
settles.

## 6. Rejected, with reasons

- **`defineFormKind` / `defineFieldType` (prototype B).** 47 files against A's
  14, and the factory boundary needs `FieldTypeDef<any>` because `FieldTypeDef`
  is invariant — its own `PROTOTYPE.md` documents this. The whole cost buys
  ergonomics for a second form kind that does not exist. Revisit when one does;
  this plan is a prerequisite for it either way.
- **`structureSchema(options)` (prototype C).** `MAX_TOTAL_FIELDS` and
  `MAX_LIST_COUNT` are generic security ceilings, not per-kind policy. Making
  bounds explicit at the call site is defensible but has no payer today.
- **Injected schemas in the model layer (B and C).** Models validating structure
  while callers validate profile is already the right split, and
  `event.server.ts:130-135` documents it. Keep it.
- **Layer restructuring into `forms/core`, `forms/react`, `forms-ui`,
  `event-admin`** (the v4 plan). The React/Zod/Conform split is not causing
  pain.
- **No barrel, import specific modules (prototype C's thesis).** It makes defect
  5 worse.

## 7. Verification

Per PR: `npx vitest run`, then
`npx prisma generate && npx react-router typegen && npx tsc`, then
`npx eslint app/features app/models`. One pre-existing `import/order` warning in
`models/form.server.ts` is expected and unrelated.

`signup-form/parity.test.ts` must pass **unmodified** through all four PRs — it
pins the live signup endpoint's validation outcomes and is the main guard that
this refactor stayed behaviour-neutral.

Zod issue _ordering_ for `SignupFormSchema` failures can shift slightly in PR 3
(the cross-scope check runs in its own `superRefine` pass rather than interleaved
in one). No consumer or test inspects issue order — only `.success` and specific
error keys.

## 8. Rebasing note

These land on `dev` directly; the `proto/*` branches are reference material, not
merge candidates. All three conflict on `app/models/image.server.test.ts`, which
`dev` deleted in `ec9d44d` (orphan-image sweep retirement). Prototype A's
`MINIMAL_FORM_FIELDS` fixture existed mostly for that file; `createTestEvent`
covers what remains.
