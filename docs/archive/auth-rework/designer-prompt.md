# Design brief — auth rework pages

> Prompt for the design session. Repo: mokupona (React Router v7 + Tailwind v4). Full functional spec: `docs/auth-rework/design.md` (§5 flows, §6 invites) and `docs/auth-rework/implementation-plan.md`.

You are designing the user-facing surfaces for an authentication rework of **moku pona**, a Zürich supper-club community site. We are replacing hand-rolled auth with better-auth: email+password with mandatory email verification, password reset, Google sign-in, role-carrying invite links, and a personal account page. Your job is **visual/interaction design only** — produce mockups, not production code. Implementation happens later against your designs.

## Design system (must be followed, not reinvented)

Dark-only "supper club" palette, defined in `app/tailwind.css` via `@theme`:

- Surfaces: `--background #15110E` (near-black warm), `--card #1B1511`. Text: `--foreground #F5F1EC`, muted `#A79E95`. Subordinate text uses opacity steps `foreground/80·65·50·40` — there are no extra gray tokens.
- Accent: terracotta `--primary #ED825E` (dark text on it), secondary accent `#F1B48C` (eyebrows/kickers, avatar tints). Destructive `#A71D31`. One hairline border token (`foreground/15`). Radius base `0.5rem`; cards are `rounded-2xl`.
- Type: Open Sans. Headings light (300) with tight tracking; buttons/nav semibold (600). Page copy is lowercase brand voice ("welcome back to the table", "made with love in zürich").
- Signature motifs: corner radial glows (`glow-primary`) anchored to corners, **never behind text**; hairline dividers; pill chips.

Existing components to reuse (shadcn-style, in `app/components/`):

- `AuthShell` (`auth-layout.tsx`): full-height split layout for auth pages — left 46% warm brand panel (BrandLockup, eyebrow, big light heading, footer line, corner glow), right 54% centered `max-w-md` form column with a login/sign-up segmented `ModeToggle`. Mobile collapses to a condensed brand header.
- `Field`, `CheckboxField`, `SelectField`, `ErrorList` (`forms.tsx`); `Button` (variants: default/destructive/destructive-outline/outline/secondary/ghost/link; full-width `size="lg"` is the auth-form convention), `Input`, `Checkbox`, `Badge`, `Card`.
- Admin: `AdminPageHeader` (eyebrow + big light title + actions slot), `FilterChip`, `InitialsAvatar`, `AdminEmptyState`; admin lists are **card rows** (`rounded-2xl border bg-card`, avatar + text + actions), not tables. Current reference: `app/routes/admin.users._index.tsx`.

New elements you may design where nothing exists: a "Continue with Google" button (must satisfy Google's sign-in branding guidelines on a dark surface while sitting comfortably next to our terracotta primary button), status/confirmation panels (check-your-inbox, dead-end pages), a connected-account row, a pending-invite row.

## Surfaces to design (all states listed)

Auth pages 1–7 all live inside `AuthShell`. Decide and show how the shell's left-panel copy and the ModeToggle adapt (or disappear) on the non-login/join pages.

1. **`/login` (update).** Email + password fields, remember-me checkbox, new "forgot password?" link, primary submit, an "or" hairline divider, "Continue with Google", and a one-line privacy consent notice ("by continuing you accept the privacy policy", linking `/privacy`) replacing any checkbox. Error state for bad credentials and for "email not verified" (this message must mention that a fresh verification link was just sent).
2. **`/join` (update).** New required **name** field, then email, password, confirm password; consent notice (checkbox removed); Google button. Field-level error states.
3. **Check-your-inbox interstitial** (after signup). Confirms a verification mail was sent to the given address; explains that trying to log in re-sends the link. No resend button. Calm, single-panel, one clear next step.
4. **`/verify-email` landing.** Two states: success ("your email is verified" → continue to login/dinners) and invalid/expired link (explain that logging in sends a fresh link).
5. **`/forgot-password`.** Email field + submit; after submit a neutral confirmation state that does not reveal whether the account exists.
6. **`/reset-password`.** New password + confirm; success state (→ login); invalid/expired-token state (→ request a new link).
7. **`/invite/$token`** — four states:
   - **Dead end**: invalid / expired / already used — friendly, distinct explanation per case is fine as copy variants of one layout.
   - **Logged out**: an invitation framing ("you've been invited to join as _moderator_"), signup form with the **email prefilled and locked**, name + password fields, or Google as alternative; note that Google must return the invited address.
   - **Logged in, email matches**: confirmation screen ("accept invite → your role becomes moderator") with a single confirm action.
   - **Logged in, email differs**: explain the mismatch, offer "log out and retry".
8. **`/me` account page** (currently a disabled stub — free rein, but it's a content page with the site nav, not an AuthShell page). Sections: profile (editable name, email read-only, role display), **password** (change with current-password field — or "set a password" variant without one, shown when the user signed up with Google only), **connected accounts** (Google row: linked state with unlink, unlink disabled with explanation when it's the only way in; not-linked state with link action), **sessions** ("sign out other sessions" with count). No account deletion. Max-width content page, works on mobile.
9. **`/admin/users` additions.** An "Invite" action in the `AdminPageHeader` actions slot opening an inline form or dialog (email + role picker offering only user/moderator) and a **pending invites** section rendered as card rows (invited email, role badge, expiry, revoke action) visually distinct from real users; empty state may simply be absent. Must harmonize with the existing card-row user list and admin motion language.

## Constraints

- Dark theme only. Lowercase brand voice for page copy (you write the copy; keep it warm and short). Forms keep label-above-input with red-300 error lists below fields.
- Every state above needs to be visible in the deliverable — states are the bulk of this work, not the happy paths.
- Mobile-first responsiveness for all surfaces; AuthShell already defines the mobile pattern for auth pages.
- Accessibility: visible focus (ring token = primary), real labels, error text associated with fields, non-color state cues.

## Deliverable

Static high-fidelity HTML mockups using the real token values above (self-contained, one file per surface with its states stacked and labeled), plus a short note per surface mapping regions to the existing components listed here and calling out any new component you introduced. Do not touch `app/` — mockups go in `docs/auth-rework/mockups/`.
