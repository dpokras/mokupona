# Auth Rework — Implementation Plan

Companion to [`design.md`](./design.md). Five phases. Phase 0 is pure infrastructure with zero user impact; **Phase 1 is the cutover** (global logout + force-reset) and must ship in one deploy with working reset email; everything after is additive. Roles, guards, and the admin UI are untouched throughout (design §2, §9).

**Recap:** better-auth = authn only (sessions, password + verification + reset, Google, linking). All mail through the provider-agnostic `app/features/mail/` layer (design §3.1; Resend is just the first provider). Custom `Invite` table (email-bound, single-use, 7-day, ceiling `moderator`). `name` mandatory on `User`. Old `Password` table dropped; existing users force-reset. Guard shim preserves the `session.server.ts` API so the ~21 admin call sites only change an import.

---

## Phase 0 — Mail layer (no user-visible change)

Goal: the provider-agnostic mail feature exists (design §3.1), sends real mail in prod/staging through Resend, and gives e2e a capture seam — before anything depends on it.

- [x] `app/features/mail/`: `MailMessage`/`MailProvider` types, `sendMail()` entry point, provider selection by `MAIL_PROVIDER` at startup (fail fast on unknown value or missing `RESEND_API_KEY` when `resend` is selected).
- [x] Providers: `resend.server.ts` (the **only** module importing the Resend SDK), `console.server.ts` (dev default), `capture.server.ts` (e2e: one JSON file per message in a well-known directory, cleared on startup).
- [ ] Resend account; verify mokupona.ch (SPF/DKIM DNS records); pick sender address (e.g. `no-reply@mokupona.ch`).
- [x] Cypress helper to read captured mail and extract links (used by Phases 1 and 3 for verification/reset/invite flows).
- [x] Env wiring: `MAIL_PROVIDER` defaults per environment (dev `console`, e2e `capture`, Fly `resend`); `RESEND_API_KEY` in `.env.example` + Fly secrets (prod and staging, `-a` for staging).

Templates are **not** built here — they live with their features (verification/reset in `auth/`, invite in `users/`) and arrive with Phases 1 and 3. Plain HTML/text; no React-email dependency unless trivially cheap.

**Acceptance:** a scratch route/script sends a real email in staging via `resend`; the same code path under `test:e2e:run` produces a capture file the Cypress helper can parse. `npm run validate` green.

**Rollback:** nothing depends on this yet; delete the feature.

---

## Phase 1 — better-auth core + migration + password parity + reset ⚠️ CUTOVER

Goal: better-auth owns identity and sessions; login/signup/logout work through it at parity; verification + reset flows live. Deployed as **one release**: the migration kills old sessions and passwords, so reset must work the same minute.

- [x] Install better-auth; `app/features/auth/auth.server.ts`: `prismaAdapter(prisma, { provider: "sqlite" })`, `emailAndPassword` with `requireEmailVerification: true`, `sendResetPassword`/`sendVerificationEmail` → verification/reset templates (in `auth/`) handed to `sendMail()` (design §3.1), `onPasswordReset` sets `emailVerified: true`, `databaseHooks.user.create.before` assigns default role `user` (design §3–5). `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` env.
- [x] Schema (design §4): CLI-generate `Session`/`Account`/`Verification`, hand-merge into [`schema.prisma`](../../prisma/schema.prisma); add `name`/`emailVerified`/`image` to `User` (ids and `roleId` FK unchanged); drop `Password`.
- [x] Data migration for existing users: backfill `name` from email local-part; credential `Account` row per user with a random-secret scrypt hash (design §7 — old passwords intentionally dead, reset path guaranteed).
- [x] Catch-all handler route `app/routes/api.auth.$.ts`; `auth-client.ts` (`better-auth/react`).
- [x] `app/features/auth/guards.server.ts`: same-signature port of [`session.server.ts`](../../app/utils/session.server.ts) helpers onto `auth.api.getSession`; switch imports in [`root.tsx`](../../app/root.tsx), the ~21 `admin.*` routes, and remaining call sites. Delete `session.server.ts`; retire `SESSION_SECRET`.
- [x] Rewrite [`login.tsx`](../../app/routes/login.tsx) / [`join.tsx`](../../app/routes/join.tsx) actions onto better-auth server API; join gains required `name`; privacy checkbox → consent notice on both pages (design §5); remember-me checkbox maps to better-auth `rememberMe`; login gains a "forgot password?" link; keep Conform/Zod UX and `redirectTo` semantics.
- [x] New routes: check-your-inbox interstitial after signup (no resend button — unverified login re-sends automatically, design §5), `verify-email` landing, `forgot-password`, `reset-password`.
- [x] Rewrite [`seed.ts`](../../prisma/seed.ts) via better-auth's API (roles + demo users preserved); update [`user.server.ts`](../../app/models/user.server.ts) creators/mutators that touched `Password`.
- [x] Update `smoke.cy.ts` + unit tests: signup now includes name + verification-link hop (via the capture provider + Phase 0 Cypress helper).
- [ ] Deploy staging → verify signup/verify/login/logout/reset end-to-end with real mail → prod deploy + heads-up message to the <20 users.

**Acceptance:** new signup requires name, receives verification mail, can't log in before verifying, can after; reset flow works and verifies migrated users; all `/admin` guards behave exactly as before (spot-check moderator vs admin vs user); admin immutability intact; `npm run validate` green.

**Rollback:** restore previous release + pre-migration SQLite snapshot (Fly volume snapshot / `litestream` point). Post-cutover rollback re-kills sessions — acceptable at this user count. Take an explicit DB backup immediately before the prod migration.

---

## Phase 2 — Google OAuth + account linking

- [ ] Google Cloud: consent screen + OAuth client; redirect URIs for localhost, staging, prod; `GOOGLE_CLIENT_ID`/`SECRET` env + Fly secrets.
- [x] `socialProviders.google` + `accountLinking { enabled, trustedProviders: ["google"] }` in `auth.server.ts` (safe per design §5 — password accounts are always verified).
- [x] "Continue with Google" button on `/login` and `/join` (consent notice already covers it).
- [ ] Verify: fresh Google signup (gets name/image/role `user`), Google login linking to an existing verified password account, `redirectTo` preserved through the OAuth round-trip.

**Acceptance:** both Google paths work on staging with the real consent screen; a linked user can log in either way and `/admin` guards see one identity.

**Rollback:** remove the button + provider config; linked `Account` rows sit inert.

---

## Phase 3 — Invites

- [x] `Invite` model migration (design §4) + `app/features/users/invite.server.ts`: create (ceiling `moderator` enforced server-side), validate, accept-in-transaction (role change + `acceptedAt` atomically; role changes only ever through [`updateNonAdminUserRole`](../../app/models/user.server.ts) so admins stay immutable).
- [x] Admin UI, inline on `/admin/users` (design §6): "Invite" header action with email + role picker (no `admin`); pending invites as a distinct card-row section on the same page, each with revoke; guard `["admin"]`.
- [x] Invite email: template in `users/`, sent via `sendMail()`; link `/invite/$token`.
- [x] Tokens stored as sha256 hashes (`Invite.tokenHash`); the raw token surfaces only in the email, so the link itself proves mailbox control — no admin "copy link".
- [x] Acceptance route per design §6: dead-end page (invalid/expired/used); new-user path (locked-email signup or Google, mismatch handling, `emailVerified` set on accept); existing-user upgrade path; logged-in-mismatch path.
- [x] Cypress: invite → new-user signup lands as moderator; invite → existing-user upgrade; expired/reused token rejected.

**Acceptance:** an admin can invite a fresh address as moderator and the invitee reaches `/admin` after signup; a second use of the link fails; `admin` role cannot be granted via invite by any means.

**Rollback:** hide the admin UI entry; table is additive.

---

## Phase 4 — /me account page + cleanup

- [x] Revive [`me.tsx`](../../app/routes/me.tsx) (drop the `ENABLED = false` gate): show name/email/role; change password (current-password required) — or **set password** when the account has no credential account (Google-only signups; no current-password field, and setting one makes Google unlinkable); connected-accounts section (Google linked? link/unlink via auth client); "sign out other sessions" (DB session revocation). No self-service account deletion (manual via admin).
- [x] Allow editing `name` (migrated users carry an email-derived placeholder).
- [x] Cleanup sweep: dead bcryptjs dependency, leftover `Password` references, `SESSION_SECRET` in docs/deploy config, [`.env.example`](../../.env.example) accurate.
- [ ] Optionally move admin user-management routes' model code under `app/features/users/` (mechanical; skip if it churns phase-2 ground).

**Acceptance:** password change works and other sessions can be revoked; unlinking Google is blocked when it's the only credential (no lock-outs); `npm run validate` green.

**Rollback:** re-gate `/me`.

---

## Cross-cutting

**Tests**

- Unit: guard shim (each helper against a faked session); invite lifecycle (create/ceiling/expiry/single-use/admin-immutability); `user.create` hook role assignment; mail provider selection (unknown `MAIL_PROVIDER` / missing key fails fast).
- E2E (cypress, mail via the capture provider): signup+verify+login; reset; invite new-user and upgrade paths; admin guard spot-checks. Google OAuth stays a manual staging checklist (not mocked in e2e).
- Parity anchor: before Phase 1, note current behavior of `redirectTo`, logged-in redirects on `/login`/`/join`, and 403s for each role — re-verify after.

**Known gotchas**

- **Phase 1 is atomic**: never deploy the migration without working reset email — users would be locked out with no recovery.
- The `user.create.before` hook must always set `roleId` (non-null FK, `onDelete: Restrict`) — Google signups included; a missed path fails at the DB, which is the safety net, not the UX.
- better-auth CLI schema output drifts between versions — hand-merge into `schema.prisma`, don't let it rewrite the file (our `User` carries the `roleId` relation and `events`).
- Invite acceptance and role upgrade must share one transaction, or a reused token can double-apply.
- `emailVerified` shortcuts (reset completion, invite acceptance) are deliberate (mailbox control proven) — don't "fix" them into requiring a second verification mail.
- Backup the prod SQLite volume immediately before the Phase 1 migration.
