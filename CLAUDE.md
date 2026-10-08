# moku pona (mp)

Web app for the moku pona dinner society in Zurich. This file is notes-to-self for working in this repo — see [README.md](README.md) for the user-facing setup/deploy docs; don't duplicate that here.

## Repo / remotes

- `origin` → `Apsysikal/mokupona` (upstream, real project)
- `fork` → `dpokras/mokupona` (Daniel's fork)
- Current branch `daniel/website-improvements` tracks `fork/daniel/website-improvements`, not `origin`.
- `main` is the usual PR base branch upstream. Upstream also runs a `dev` → staging / `main` → production promotion flow (see README "Deployment flow").
- Upstream has a convention of Claude-authored feature branches named `claude/<slug>-<id>` merged via PR — this project is used to Claude doing substantial feature work directly.

## Tech stack

React Router v7 (framework mode) + React 19 + TypeScript, Tailwind CSS v4, Prisma ORM over SQLite (`@prisma/adapter-better-sqlite3`), better-auth, Vitest/Testing Library, Cypress e2e, Fly.io deploy via Docker.

## Structure

- `app/routes` — route modules (public pages + `admin.*` area), flat-file routing (`admin.dinners.$dinnerId_.edit.tsx` style)
- `app/features/*` — feature-scoped logic (auth, gallery, signup-form, cms, events, mail, images, board-members, users, forms)
- `app/models` — server-side data access
- `app/components/ui` — design-system primitives (migrated Radix → Base UI, see `docs/design-harmonization`)
- `app/tailwind.css` — theme tokens
- `docs/*` — one subfolder per initiative/investigation; active reference docs live at the top level (design-harmonization, data-access-layer, database-backups, route-module-conventions), shipped/closed ones are under `docs/archive/` — see `docs/README.md`. Check here first for prior art before starting something that sounds like it might have history
- `prisma/schema.prisma`, `prisma/seed.ts`

## Commands

- `npm run dev` — dev server (spawns MSW mock server too)
- `npm run setup` — prisma generate + migrate + seed (seeded users all have password `mokupona`: `user@`, `moderator@`, `admin@mokupona.ch`)
- `npm run validate` — test + lint + typecheck + e2e; run before considering a change done
- `npm run test` — vitest unit tests
- `npm run test:e2e:dev` — Cypress interactive against dev server

## Public text (editable from the admin)

Every public-facing string (pages, nav/footer, meta, alt/aria text, error page, emails) comes from the text catalog in `app/features/site-content/catalog/`, never a literal in JSX. Admins override any entry at `/admin/content/texts/<category>`; overrides live in the `SiteText` table and fall back to the catalog default. Use `useText()` in components, `metaText(matches, key)` in `meta`, `getServerText` for emails; route-scoped categories (privacy, impressum) are loaded by their page's loader. Never put an em dash in a public string: the catalog test and the admin editor both reject them.

## Design system

`docs/design-harmonization/` has the full audit + spec (`design-system-spec.md`) distilled from a drift inventory of the old UI. It was synced to a Claude Design project on claude.ai/design (`projectId: 3208dbb3-75a3-424b-80b0-a1f2a78606aa`, project "mokupona design system"). Key decisions already made there: three-tier radius scale, named type ramp, two intentional voice/density registers (public `font-light`/comfortable vs admin `font-extrabold`/compact), token-only colors (no raw hex). Check `plan.md` in that folder for status before redoing audit work.

## Current work: `daniel/website-improvements`

Visual/content pass on the public site, built on top of the design-harmonization tokens. Recent commits on this branch (newest first):

- Landing page teases 3 past dinners with a "see more" link
- `/dinners` features one dinner prominently
- Widened the past-dinners grid, seeded a back-catalogue of dinners for testing/demo
- Landing page showed every past dinner; next-dinner card dropped its facts list
- Hand-written section headings, hand-drawn wordmark/logo
- Square corners, no panels, more breathing room
- Paper background lightened to `#F7FAE7`
- Cream/purple palette, title card, galleries, hall of fame

So: this branch is iterating on landing page (`app/routes/_index.tsx`) and `/dinners` (`app/routes/dinners._index.tsx`, `app/routes/dinners_.$dinnerId.tsx`) presentation/layout, not backend logic.

## Backlog

[TODO.md](TODO.md) tracks the feature backlog (admin hub expansion, Impressum, FAQ, Stripe/TWINT, editable strings, about page, email domain setup, Cloudinary, guest galleries, recipes site). Update its checkboxes as tasks ship; don't start on it without explicit go-ahead per task.

## Local state notes

- `package.json` has an uncommitted `allowScripts` addition (npm/pnpm trusted postinstall scripts list) — pending, not yet committed as of 2026-10-05.
- `.env` exists locally (gitignored) — don't commit it, don't print its contents.
