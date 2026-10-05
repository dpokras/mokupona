# Customizable Signup Form — Design

**Status:** Approved design, ready to implement (supersedes the 2026-06-27 revision)
**Last updated:** 2026-07-04

Two layers: a **generic form abstraction** (field primitives, schema building, rendering — no signup vocabulary) and the **signup form** built on top of it as a _constrained form_: a named profile of conventions over the primitives, enforced at authoring time. Form definitions and submissions are stored in dedicated tables as `Json`; submissions are stored **one row per submission** (the party), not per attendee.

---

## 1. Goal & scope

Let event creators/editors customize the attendee **signup form per event**: choose which fields appear, relabel and reorder them, mark them required, and add their own custom questions — without a developer change for each new question.

### Goals

- Per-event form definition, authored in the existing dinner create/edit screens.
- Organizers can add arbitrary questions (text, checkbox, textarea, … growing over time).
- The "add a friend" multi-attendee flow keeps working, including disabling it per event.
- Existing events, existing signups, and the CSV export keep working.
- The form primitives are reusable for future non-signup forms (e.g. a survey).

### Non-goals (v1)

- Conditional/branching logic.
- SQL analytics on custom answers (promote a field to a column later if this becomes a hard requirement).
- Organizer-defined repeating groups: the `list` field type exists in the schema language, but the builder does not allow adding lists (§5, §10).
- Per-field validation rules beyond required / type.

---

## 2. Architecture overview

```
                    generic form layer                       signup profile layer
            ┌──────────────────────────────┐          ┌────────────────────────────────┐
 Form/      │ field registry {type,ver,data}│          │ SignupFormSchema (profile      │
 FormVersion│ FormSchema (bounds)           │  used by │  refinements over FormSchema)  │
 (DB, Json) │ buildSubmissionSchema → Zod   │ ───────▶ │ DEFAULT_FORM                   │
            │ registry-driven renderer      │          │ buildSignupSchema (+privacy)   │
            └──────────────────────────────┘          │ getAttendeesForEvent (read)    │
                                                       └────────────────────────────────┘

 ADMIN  ── dinner create/edit ──▶ FormVersion.schema (validated by SignupFormSchema on write)
 PUBLIC ── signup page renders current FormVersion; action re-reads it from DB, rebuilds the
           identical Zod schema, writes ONE FormSubmission row (answers Json, FK to the version)
 ADMIN  ── signups table + CSV consume getAttendeesForEvent() — never the tables directly
```

The generic layer is a **code-level library** (schemas, renderer, validation); it owns no signup knowledge. The signup layer is a set of **named conventions over the primitives** — well-known field names (`name`, `email`, `phone`), one well-known list (`friends`), and profile refinements — enforced by `SignupFormSchema` in the event actions, and interpreted in exactly one place on the read side (`getAttendeesForEvent`).

The single source of truth for a form's shape is the **current `FormVersion` in the DB**. The loader passes it to the page; the action re-reads it and rebuilds the identical Zod schema server-side. A client-submitted schema is never trusted.

---

## 3. Data model

Three new tables, all additive. `EventResponse` is untouched and becomes a frozen legacy table (§3.3). JSON uses Prisma's `Json` type on SQLite (supported; verified with Prisma 7.8.0). Prisma handles (de)serialization; every `Json` value is still Zod-validated on read because Prisma types it loosely as `Prisma.JsonValue`.

> Historical note: the CMS tables dropped in June ([`drop_cms_pages`](../../prisma/migrations/20260626120000_drop_cms_pages/migration.sql)) were not a verdict against JSON modeling; `Json` columns are the endorsed approach here.

```prisma
model Event {
  // …existing fields unchanged…
  form   Form   @relation(fields: [formId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  formId String @unique // non-nullable: every event has a form (backfilled)
}

model Form {
  id String @id @default(cuid())

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  versions FormVersion[]
  event    Event? // back-relation only; Form itself stays event-agnostic
}

model FormVersion {
  id      String @id @default(cuid())
  version Int
  schema  Json   // FieldDescriptor[]; validated by SignupFormSchema on every write

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt // mutated in place only while no submissions reference it

  form   Form   @relation(fields: [formId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  formId String

  submissions FormSubmission[]

  @@unique([formId, version])
}

model FormSubmission {
  id      String @id @default(cuid())
  answers Json   // nested: { name, email, …, friends: [{ name, … }] }

  createdAt DateTime @default(now())

  formVersion   FormVersion @relation(fields: [formVersionId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  formVersionId String
}
```

Key properties:

- **`Form` is the stable anchor.** `Event.formId` points at it once and is never repointed. Versions accrue under it; editing a form never writes the `Event` row.
- **Submissions reference the version they answered** (`formVersionId`), so every stored answer set is interpretable against the exact schema it was written for. Submissions carry **no `eventId`** — the signups query is `formSubmission.findMany({ where: { formVersion: { formId: event.formId } } })`.
- **One form per event (v1).** Enforced by the unique constraint. Future reuse is "duplicate this form", never sharing a row (editing a shared form would silently change another event's live signup page).
- **Current version** = `max(version)` for the form.

### 3.1 Backfill & invariants

The migration creates one `Form` + one `FormVersion` (v1, containing `DEFAULT_FORM`) **per existing event**, then `Event.formId` is non-nullable. The invariant "every event has a form" holds by construction — no null branch exists anywhere in the code. Seeds and test factories must create a form alongside every event.

### 3.2 Deletion

The FK points `Event → Form`, so deleting an `Event` does **not** cascade to its form, versions, or submissions. Event deletion must go through the data-access layer, which deletes in one transaction: submissions → versions → form → event. Never delete events with raw `prisma.event.delete` outside that helper.

### 3.3 Legacy `EventResponse`

Frozen: no new writes, no schema changes, columns keep their meaning. The read layer (§8) merges legacy rows into the unified attendee view. Legacy exports keep working; legacy rows do **not** participate in new party-aware features (who signed up with whom was never recorded — each legacy row surfaces with `isSigner: null`). Whether to eventually migrate or remove this data is deliberately deferred.

---

## 4. Field descriptors & the generic registry

Descriptors use the `{ type, version, data }` shape. `version` is the **format version of that field type's `data` shape** (orthogonal to `FormVersion.version`, which tracks the organizer's edits): stored schema blobs live forever, so if a field type's data shape ever changes, the new shape gets a new version literal and the read path upconverts old descriptors before use. Never edit a field type's data schema in place.

```
app/features/forms/                 # generic — contains NO signup vocabulary
  fields/
    types.ts                        # FieldType union
    base.ts                         # BaseFieldData
    text/ email/ phone/ textarea/ checkbox/   # model.ts + view.tsx each
    list/                           # model.ts + view.tsx (Conform field-list wrapper)
    index.ts                        # registry: FieldDescriptorSchema, FormSchema, views, zod leaves
  build-submission-schema.ts        # descriptors -> z.ZodObject (for answers)
  serialization.ts                  # Zod-validate Prisma JsonValue on read
```

```ts
// fields/base.ts
export const BaseFieldData = z.object({
  // machine key: input name path, answers key, CSV column key, cross-scope merge key.
  // IMMUTABLE once submissions exist — renaming orphans stored answers.
  name: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().trim().min(1),
  required: z.boolean().default(false),
});
```

There is **no `scope` field**. Structure expresses everything: top-level fields are asked once per submission; fields inside a list are asked once per list item.

### 4.1 The `list` field type

```ts
export const ListFieldSchema = z.object({
  type: z.literal("list"),
  version: z.literal(1),
  data: BaseFieldData.extend({
    maxCount: z.number().int().min(0).max(MAX_LIST_COUNT), // 0 = list disabled
    addLabel: z.string().trim().min(1), // e.g. "Add a friend"
    removeLabel: z.string().trim().min(1), // e.g. "Remove this person"
    itemFields: z.array(NonListFieldDescriptorSchema).min(1),
  }),
});
```

- **No nesting, structurally:** `itemFields` accepts the union of non-list field types, so a list inside a list is unrepresentable rather than merely forbidden.
- **`maxCount = 0` disables the list without removing it.** The list stays present in the schema (consumers keep their well-known key); the renderer paints nothing and the submission schema is `z.array(...).max(0)`.
- Button labels live in descriptor data so the generic renderer stays vocabulary-free.

### 4.2 Bounds

Limits exist to bound the blast radius of bugs and abuse, not to police organizers; legitimate forms never hit them.

```ts
export const MAX_TOTAL_FIELDS = 40; // counts recursively: top-level + every list's itemFields
export const MAX_LIST_COUNT = 10; // ceiling in code; the organizer picks a value 0..MAX in data
```

`FormSchema = z.array(FieldDescriptorSchema).superRefine(...)` enforces:

- total field count ≤ `MAX_TOTAL_FIELDS`, walking into lists;
- `name` uniqueness **per scope** (unique among top-level fields; unique within each list's `itemFields`);
- the **same `name` across scopes is not a collision — it is the merge link** (§8), and it must carry the **same field type** in both places (a textarea here and a checkbox there would make an incoherent roster column).

The `maxCount` ceiling is security-relevant: the signup endpoint is public and validates submissions with `z.array(...).max(maxCount)` from stored data, so `maxCount` directly bounds anonymous write amplification.

### 4.3 Extensibility

Adding a new field type = one folder (`model.ts` + `view.tsx`), a registry entry, a `zodForField` case. No migration, no DB change.

---

## 5. The signup form profile ("constrained form")

The signup form is `SignupFormSchema` = `FormSchema` + profile refinements, validated in the event actions on every write:

- exactly **one** list, and its `name` is `friends` (the well-known key; the builder renders it fixed and non-removable);
- top-level fields named `name`, `email`, `phone` are present and `required` (fixed identity fields, non-removable in the builder);
- `maxCount` within 0–10 (0 = solo signups only).

`acceptedPrivacy` (+ the Privacy Policy link) is **hardcoded** in the signup page — a legal control, never a schema field. It keeps its current live field name.

Signer fields and friend item fields are **defined independently** (the signer genuinely answers more: contact info). A question asked of everyone appears in _both_ scopes, deliberately duplicated, linked by sharing the same `name`. The builder nudges the organizer to keep them in sync (§10).

Contact info (`email`, `phone`) belongs to the **submission**, not to any person — friends never had their own, and nothing is copied anywhere.

### 5.1 `DEFAULT_FORM`

Reproduces today's live form. Field names equal the legacy `EventResponse` column names, which makes the legacy merge in the read layer an identity mapping and unifies CSV columns across old and new data.

```ts
export const DEFAULT_FORM: FieldDescriptor[] = [
  {
    type: "text",
    version: 1,
    data: { name: "name", label: "Name", required: true },
  },
  {
    type: "email",
    version: 1,
    data: { name: "email", label: "Email", required: true },
  },
  {
    type: "phone",
    version: 1,
    data: { name: "phone", label: "Phone number", required: true },
  },
  {
    type: "checkbox",
    version: 1,
    data: { name: "vegetarian", label: "Vegan / Vegetarian", required: false },
  },
  {
    type: "checkbox",
    version: 1,
    data: { name: "student", label: "Student", required: false },
  },
  {
    type: "text",
    version: 1,
    data: {
      name: "restrictions",
      label: "Dietary restrictions",
      required: false,
    },
  },
  {
    type: "list",
    version: 1,
    data: {
      name: "friends",
      label: "Friends",
      maxCount: 3,
      addLabel: "Add a friend",
      removeLabel: "Remove this person",
      itemFields: [
        {
          type: "text",
          version: 1,
          data: { name: "name", label: "Name", required: true },
        },
        {
          type: "checkbox",
          version: 1,
          data: {
            name: "vegetarian",
            label: "Vegan / Vegetarian",
            required: false,
          },
        },
        {
          type: "checkbox",
          version: 1,
          data: { name: "student", label: "Student", required: false },
        },
        {
          type: "text",
          version: 1,
          data: {
            name: "restrictions",
            label: "Dietary restrictions",
            required: false,
          },
        },
      ],
    },
  },
  {
    type: "textarea",
    version: 1,
    data: { name: "comment", label: "Comment", required: false },
  },
];
```

---

## 6. Validation & rendering

### 6.1 Building the Zod schema

```ts
// forms/build-submission-schema.ts (generic)
export function buildSubmissionSchema(fields: FieldDescriptor[]): z.ZodObject {
  // top-level non-list fields -> zodForField leaves;
  // list fields -> z.array(z.object(itemFields)).max(data.maxCount)
}

// signup-form/build-schema.ts (profile)
export function buildSignupSchema(fields: FieldDescriptor[]) {
  return buildSubmissionSchema(fields)
    .extend({ acceptedPrivacy: z.boolean() })
    .refine((v) => v.acceptedPrivacy === true, {
      path: ["acceptedPrivacy"],
      error: "You must agree to register",
    });
}
```

Conform is schema-agnostic — `getZodConstraint(schema)` and `parseWithZod(formData, { schema })` accept any Zod object, same shape as the current code in [`dinners_.$dinnerId.tsx`](../../app/routes/dinners_.$dinnerId.tsx):

- **Client:** the loader passes the current version's descriptors; `const schema = useMemo(() => buildSignupSchema(fields), [formVersionId])`, fed to `useForm`.
- **Server:** the action re-reads the current `FormVersion` from the DB, rebuilds the identical schema, and runs the authoritative `parseWithZod`. Client-submitted descriptors are never accepted.

Field access is dynamic: `fields[name]`, and per friend `friendsList[i].getFieldset()[name]`. Input name paths follow the structure (`friends[0].vegetarian`).

### 6.2 Rendering

Registry-driven: map descriptors to views via the field registry, reusing the existing components in [`app/components/forms.tsx`](../../app/components/forms.tsx). The list view wraps Conform's field-list helpers (`insert`/`remove` buttons using `addLabel`/`removeLabel`, remove per item, nothing rendered when `maxCount` is 0, list-level `ErrorList`). The privacy checkbox and submit button stay hardcoded after the mapped fields.

---

## 7. Writing submissions

The action validates against the rebuilt schema and writes **one row**:

```ts
const { acceptedPrivacy: _, ...answers } = submission.value;

await createFormSubmission({
  formVersionId: currentVersion.id, // the version the loader rendered & the action re-read
  answers, // { name, email, phone, vegetarian, …, friends: [{…}], comment }
});
```

No fan-out, no copy-down, no transaction juggling: the party is one record, and "who signed up with whom" is now first-class data. Signup remains blocked for past events, as today.

---

## 8. Reading back: the attendee read layer

`getAttendeesForEvent` is the **only** code that knows signup semantics on the read side. The admin signups table and the CSV export consume its output and never touch `FormSubmission` or `EventResponse` directly.

```ts
// app/features/signup-form/read.server.ts
export function getAttendeesForEvent(eventId: string): Promise<Attendee[]>;

export interface Attendee {
  submissionId: string; // groups a party; legacy rows use the row id
  isSigner: boolean | null; // null = legacy row (signer-ness was never recorded)
  name: string;
  email: string; // party contact (submission-level) for new data
  phone: string;
  answers: Record<string, string | boolean>; // flattened per-person view
  createdAt: Date;
}
```

Flattening rules for a `FormSubmission`:

- The **signer** is one `Attendee` (`isSigner: true`) built from the top-level answers; each `friends[i]` item is one `Attendee` (`isSigner: false`).
- **Per-attendee vs submission-level is derived, not configured:** a top-level field whose `name` also exists in the friends `itemFields` is the signer's _personal_ answer (merged into the shared roster column); a top-level field with no counterpart in the list (`email`, `phone`, `comment`, custom one-off questions) is **submission-level** and is replicated onto every attendee of the party — matching how the legacy CSV showed `comment` on each row.
- **Legacy `EventResponse` rows** map one row → one `Attendee` with `isSigner: null`, values read from the typed columns. Because `DEFAULT_FORM` names equal the column names, this mapping is an identity function.

Consumers:

- **Admin signups table** ([`admin.dinners.$dinnerId_.signups.tsx`](../../app/routes/admin.dinners.$dinnerId_.signups.tsx)): renders `Attendee[]` — same one-row-per-person display as today, now sourced through the read layer.
- **CSV export** ([`admin.dinners.$dinnerId.[signups.csv].tsx`](../../app/routes/admin.dinners.$dinnerId.[signups.csv].tsx)): one line per `Attendee`. Columns are keyed by field `name`, taking the **union across all `FormVersion`s that have submissions** (plus the legacy defaults); header text comes from the latest version that contains the name. Booleans format as `"true"`/`"false"`. [`buildCSVObject`](../../app/lib/csv-builder.server.ts) is unchanged.

---

## 9. Form versioning policy

On saving the dinner edit screen:

1. If the schema is deep-equal to the current version's — do nothing.
2. If the current version has **no submissions** — update it in place (no version spam while drafting).
3. Otherwise — create a new `FormVersion` with `version = current + 1`.

Versions with submissions are immutable. Because each submission references its version, editing a form never orphans or reinterprets existing answers; the CSV union handles removed/added fields naturally (a removed field's column simply has no values for newer submissions).

---

## 10. Admin builder UI

A "Signup form" section in [`admin-dinner-form.tsx`](../../app/components/admin-dinner-form.tsx): a Conform field array of descriptor rows (same `insert`/`remove`/`reorder` pattern as the current `people` handling; up/down reorder).

Constraints, all mirrored server-side by `SignupFormSchema`:

- The **friends list is fixed**: it cannot be removed, renamed, or joined by other lists; its `itemFields` are editable and `maxCount` (0–10) is the only structural knob. Lists are not addable in v1 — future form kinds may allow it, with their own profiles.
- `name`/`email`/`phone` are fixed and non-removable.
- Field keys: auto-derived from the label as a slug on add, **immutable once submissions exist**, captioned **"Field key"** in the UI (never "Name" — the machine key sits next to a human `label` and one default field is literally named `name`).
- **Sync nudge:** when adding a field to the signer scope, offer "also ask this for each friend?" (and vice versa), creating the twin with the same `name` and type. This is how per-attendee questions stay merged in the roster.
- Warn before removing a field that already has responses.
- "Reset to default" replaces the working schema with `DEFAULT_FORM` (subject to the same versioning policy).

---

## 11. Risks & mitigations

| Risk                                                 | Mitigation                                                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malformed schema blob breaks a live signup page      | Validate with `SignupFormSchema` on every write. On read, `safeParse`; a failure is a bug (we control all writers) — log and hide the signup section rather than render a wrong form against a versioned submission path. |
| Client/server schema drift                           | Both sides build from the same persisted `FormVersion`; the action re-reads from the DB. One shared `buildSignupSchema`.                                                                                                  |
| Public endpoint write amplification                  | `maxCount` ceiling (`MAX_LIST_COUNT = 10`) is a code constant; submission arrays validate against stored `maxCount ≤ 10`. Field budget `MAX_TOTAL_FIELDS = 40` counts recursively.                                        |
| Signer/friend question drift (duplication by design) | Same-`name` merge rule + builder sync nudge; cross-scope same-`name` requires same type (authoring-time validation).                                                                                                      |
| Renaming/reusing field keys corrupts history         | Keys immutable once submissions exist; versions with submissions immutable; submissions pin their version.                                                                                                                |
| Event deletion orphans form data                     | All event deletes go through the data-access-layer transaction (§3.2).                                                                                                                                                    |
| SQL analytics on custom answers later                | Answers are `Json`; SQLite JSON1 can query them, or promote a hot field to a column when a hard requirement appears. Identity queries on legacy data are unaffected.                                                      |

---

## 12. File-by-file change map

| File                                                                                                                 | Change                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`prisma/schema.prisma`](../../prisma/schema.prisma)                                                                 | Add `Form`, `FormVersion`, `FormSubmission`; `Event.formId` (non-null, unique). `EventResponse` untouched.                                                                                        |
| `prisma/migrations/<new>/`                                                                                           | Create tables + backfill one `Form`/`FormVersion(DEFAULT_FORM)` per existing event.                                                                                                               |
| `app/features/forms/**` (new)                                                                                        | Generic primitives: field registry (incl. `list`), `FormSchema` + bounds, `buildSubmissionSchema`, renderer, serialization. Grown out of the existing `app/features/signup-form/fields/` folders. |
| `app/features/signup-form/**`                                                                                        | Profile: `SignupFormSchema`, `DEFAULT_FORM`, `buildSignupSchema`, `read.server.ts` (`getAttendeesForEvent`). Remove `scope` and the scope-based schema builder.                                   |
| `app/models/form.server.ts` (new)                                                                                    | `Form`/`FormVersion` access + versioning policy (§9).                                                                                                                                             |
| `app/models/form-submission.server.ts` (new)                                                                         | `createFormSubmission`, submissions-for-event query.                                                                                                                                              |
| `app/models/event.server.ts`                                                                                         | Create form with event; app-level cascade delete (§3.2).                                                                                                                                          |
| [`app/routes/dinners_.$dinnerId.tsx`](../../app/routes/dinners_.$dinnerId.tsx)                                       | Loader passes current version's descriptors; registry-driven render; action rebuilds schema from DB and writes one `FormSubmission`.                                                              |
| [`app/routes/admin.dinners.$dinnerId_.signups.tsx`](../../app/routes/admin.dinners.$dinnerId_.signups.tsx)           | Consume `getAttendeesForEvent`.                                                                                                                                                                   |
| [`app/routes/admin.dinners.$dinnerId.[signups.csv].tsx`](../../app/routes/admin.dinners.$dinnerId.[signups.csv].tsx) | Dynamic headers/rows from the read layer (§8).                                                                                                                                                    |
| [`app/components/admin-dinner-form.tsx`](../../app/components/admin-dinner-form.tsx)                                 | "Signup form" builder section (§10).                                                                                                                                                              |
| [`app/models/event-response.server.ts`](../../app/models/event-response.server.ts)                                   | Frozen; read-only access used by the read layer's legacy merge.                                                                                                                                   |
| [`app/utils/event-signup-validation.ts`](../../app/utils/event-signup-validation.ts)                                 | Kept as the parity/regression anchor for `DEFAULT_FORM`.                                                                                                                                          |

See [`implementation-plan.md`](./implementation-plan.md) for the phased rollout and the cleanup of code already on this branch.
