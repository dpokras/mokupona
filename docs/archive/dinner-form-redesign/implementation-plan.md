# Implementation Plan — Dinner Create/Edit Redesign

Source design: `tmp/design-reference.html` + `tmp/README.md` (Claude designer handoff).
Targets **both** `app/routes/admin.dinners.new.tsx` and
`app/routes/admin.dinners.$dinnerId_.edit.tsx`.

## ⚠️ OPEN — VERIFY BEFORE BUILDING

- [ ] **`max-w-4xl` width.** The admin layout (`app/routes/admin.tsx:18`) constrains all
      admin pages to `max-w-4xl` (≈896px). The new shell is a 220px nav rail **+** a content
      column of section cards. 220 + ~640 _should_ fit, but this is unconfirmed and may feel
      cramped. **Eyeball the real page before committing.** If too tight, widen **only these
      two dinner routes** (README allows "widen as needed") — do NOT widen the shared
      `admin.tsx` layout, that propagates to every admin page.
- [ ] **Edit page title copy** — "Edit dinner" vs. include the dinner name.

## Central architectural fact

Both routes render the same shared `AdminDinnerForm`. The redesign therefore lands almost
entirely in shared components (`admin-dinner-form.tsx`, `signup-form-builder.tsx`) and
reaches both pages automatically. The data layer (`features/signup-form/*`,
`features/forms/*`, Conform intents, descriptor mapping) is untouched — this is a pure
presentation/layout change. Conform's `FormMetadata.dirty` (confirmed in
`@conform-to/react` context.d.ts:21) drives the save bar with no new form state.

## Decisions locked in

1. **Icon buttons: reuse the existing `Button` as-is.** No new size or color variants.
   We deviate from the design's 30/26px spec and use the current `size="icon"` (36px) /
   `size="sm"`. Swap the Up/Down/Remove _text_ for `@radix-ui/react-icons` glyphs
   (`ArrowUpIcon`, `ArrowDownIcon`, `TrashIcon`, `ChevronDownIcon`). `ui/button.tsx`
   stays untouched → zero propagation risk.
2. **Type chips → shadcn `badge`** (new component), not a tailwind chip token.
3. **Section cards → shadcn `card`** (new component).
4. **Collapsible rows → shadcn `collapsible`** (new component).
5. **Discounts field → "Schedule & pricing" section** (with Date/Slots/Price).
6. **Page title → prop** on `AdminDinnerForm` (mirrors existing `submitText`).
7. **Do NOT fix the shadcn config first.** `components.json` points at a non-existent
   `tailwind.config.ts` (repo is Tailwind v4 CSS-first), but that config is only read by
   the `shadcn` CLI. We hand-port the three components (see below), so the CLI never runs
   and the stale config is irrelevant. Fixing it wouldn't even save work: the CLI emits
   `@radix-ui/react-*` per-package imports (repo uses the unified `radix-ui` package) and
   would install redundant deps, so its output would need rewriting anyway. Leave config
   cleanup as a separate optional chore if CLI convenience is wanted later.

## shadcn primitives to base off (research result)

Repo is shadcn-configured (`components.json`, new-york, baseColor gray) BUT uses the
unified `radix-ui` package + `@radix-ui/react-icons`, and has no `tailwind.config.ts`
(Tailwind v4 CSS-first). **Hand-port each component in the repo's style**, mirroring the
existing `app/components/ui/accordion.tsx` (`import { X as XPrimitive } from "radix-ui"`).
All three are currently absent from `app/components/ui/`.

| New file             | shadcn base                                                             | Used for               | Notes                                                                                                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/card.tsx`        | **card**                                                                | `SectionCard` shell    | `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`. Add an `id` on the outer card for the nav's scroll-target anchor.                                                                                                                                                 |
| `ui/badge.tsx`       | **badge**                                                               | field-row type chips   | cva variants. Our `--primary` **is** orange, so pinned = `<Badge>` default (orange); custom = `variant="secondary"` (gray). Friends teal handled below.                                                                                                                            |
| `ui/collapsible.tsx` | **collapsible** (Radix `Collapsible`, confirmed exported by `radix-ui`) | collapsible field rows | Controlled via our `Set<string>` open-state. `CollapsibleTrigger` wraps only the label+chevron; reorder/remove buttons sit as siblings in the header. This is why we use Collapsible, not Accordion — Accordion's trigger wraps the whole header and can't contain nested buttons. |

**Friends-list teal accent** (the one new color, README §Design Tokens
`oklch(75% 0.09 220)`): no new tailwind token. Render the friends chip as
`<Badge variant="outline">` with an inline arbitrary-value className
(`text-[oklch(75%_0.09_220)] border-[oklch(75%_0.09_220/0.4)] bg-[oklch(75%_0.09_220/0.16)]`),
contained at the single call site.

## Reuse / Change / Create

### Reuse as-is

- `Field`, `TextareaField`, `SelectField`, `CheckboxField`, `ErrorList` (`forms.tsx`)
- `Input`, `Textarea`, `Label`, `Checkbox`, **`Button`** (`ui/*`)
- All of `features/signup-form/*`, `features/forms/*` — data model, validation, twin-sync
- Conform intents `form.insert/remove/reorder/update`, `getButtonProps`
- `form.dirty` for the save bar
- `@radix-ui/react-icons` (already a dep)

### Change

| File                      | Change                                                                                                                                                                                             | Propagation                                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `admin-dinner-form.tsx`   | Regroup the flat field column into 5 `SectionCard`s + sticky nav rail/chip nav + sticky save bar. Field calls unchanged, just grouped. New props: `pageTitle`, `cancelHref`.                       | Both create & edit, automatically.                                                                                                                     |
| `signup-form-builder.tsx` | Rows become collapsible cards (shadcn Collapsible + our `Set<string>` open-state); `RowHeader` gains a badge chip + chevron + icon-only reorder/remove buttons (existing Button, no new variants). | Self-contained — `RowHeader`/`EditableRowView`/`PinnedIdentityRowView`/`FriendsRowView` are module-private; `SignupFormBuilder`'s props are unchanged. |
| `ui/button.tsx`           | **No change.**                                                                                                                                                                                     | —                                                                                                                                                      |
| `tailwind.css`            | **No new token.**                                                                                                                                                                                  | —                                                                                                                                                      |
| `components.json`         | **No change** (see decision 7).                                                                                                                                                                    | —                                                                                                                                                      |

### Create new

- `ui/card.tsx`, `ui/badge.tsx`, `ui/collapsible.tsx` (hand-ported shadcn, repo style)
- `SectionNav` — sticky 220px rail (desktop) → horizontal chip nav (mobile), active-section
  highlight via `IntersectionObserver` scroll-spy; anchors map to card `id`s.
- `SaveBar` — sticky bottom, translucent/blurred; "Unsaved changes" from `form.dirty`,
  Cancel (`cancelHref`) + submit; full-width stacked on mobile.
- `SectionCard` wrapper composing `ui/card.tsx` + an `id` anchor (or inline in the form).

## Section mapping (final)

| Section               | Fields                            | Current source                |
| --------------------- | --------------------------------- | ----------------------------- |
| 1. Basics             | Title, Description                | `admin-dinner-form.tsx:73-86` |
| 2. Menu & donation    | Menu, Donation                    | `:88-104`                     |
| 3. Schedule & pricing | Date, Slots, Price, **Discounts** | `:106-141`                    |
| 4. Cover & location   | Cover, Address                    | `:143-160`                    |
| 5. Signup form        | `<SignupFormBuilder>`             | `:162-165`                    |

## Signup-builder rules to preserve (unchanged behavior)

- Pinned identity detection (`:244`), friends-list detection (`:222`)
- Field-key locking on edit-with-signups (`rowLocked`, `:220`) + confirm-on-remove
- Twin sync "Also ask each friend"/"the signer" (`:384-483`)
- Reset-to-default confirm dialog incl. locked warning (`:170-182`)
- **New-row default-expanded**: reuse existing `isStoredRow(row.key)` (`:112`) — a newly
  inserted row's key isn't in `initialRowKeysRef`, so default it open; stored rows start
  collapsed. User toggles overlay via the `Set<string>`.

## Route changes (small)

- `admin.dinners.new.tsx:133` — replace `<div>Create a new dinner</div>`; pass
  `pageTitle="Create a new dinner"`, `cancelHref="/admin/dinners"`.
- `admin.dinners.$dinnerId_.edit.tsx` — add `pageTitle` (copy TBD) +
  ``cancelHref={`/admin/dinners/${dinner.id}`}``. No loader/action changes.

## Build order

1. Hand-port `ui/card.tsx`, `ui/badge.tsx`, `ui/collapsible.tsx` (repo import style).
2. Shell primitives: `SectionCard`, `SectionNav` (scroll-spy), `SaveBar` on static markup.
3. `admin-dinner-form.tsx` — regroup into 5 sections + nav + save bar. Verify both routes.
4. `signup-form-builder.tsx` — collapsible rows, badge chips, icon buttons, open-state Set.
5. Route glue (`pageTitle`/`cancelHref`).
6. Verify e2e: reorder/add/remove, twin-sync, locked-key path (edit w/ signups),
   reset-to-default, dirty→save-bar, mobile chip nav + stacked save bar.
   **Check `max-w-4xl` fit here.**
