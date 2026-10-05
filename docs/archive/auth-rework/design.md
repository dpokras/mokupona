# Auth Rework — Design

**Status:** Approved design, ready to implement
**Last updated:** 2026-07-08

Replace the hand-rolled cookie/bcrypt auth with **better-auth as the authentication engine only** — sessions, email+password with verification and reset, Google OAuth with account linking, all outbound mail through a **provider-agnostic mail layer** (Resend is the first provider, §3.1). Authorization stays entirely ours: the `Role` table, `requireUserWithRole()`, the admin route guards, and the admin-immutability rules are untouched. **Invite links** (email-bound, role-carrying) are a custom feature built beside better-auth, not a plugin. A later **phase 2** decomposes roles into finer global permissions — this design deliberately keeps better-auth ignorant of roles so that rebuild stays unconstrained.

---

## 1. Goal & scope

### Goals

- Users and auth become separate features: `app/features/auth/` (identity, sessions, OAuth, reset, verification, invite acceptance) and `app/features/users/` (admin user management, invite creation, `/me` account page).
- Social login with **Google** (only provider at launch), auto-linked to password accounts by verified email.
- Password signup/login keeps working; signups now require **email verification**; a **password reset** flow exists.
- **Invite links**: admin enters email + role, an email-bound single-use link (~7-day expiry) onboards a new user directly into that role, or upgrades an existing user. Ceiling is `moderator`.
- Open signup stays; `name` becomes a **mandatory** user field (Google supplies it; the join form asks for it).
- Minimal `/me`: change password (or **set** one, for Google-only accounts), show connected Google account, sign out other sessions (replaces the hard-disabled [`me.tsx`](../../app/routes/me.tsx)). Account deletion stays out of scope — handled manually via the existing admin delete.

### Non-goals (phase 1)

- The permission-model rebuild (phase 2: global roles decomposed into permission strings, e.g. `dinner:create`). Nothing here may presuppose its shape.
- better-auth's admin/organization plugins — rejected: they would impose their role model on phase 2.
- Other providers (Apple, GitHub, …), 2FA, magic links, teams/orgs.
- Keeping old passwords working. With <20 prod users we **force-reset**: old bcrypt hashes die at cutover; the reset flow (which doubles as email verification) is the recovery path.

---

## 2. Decision record

| Decision         | Choice                                                                   | Why                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth library     | better-auth, **authn only**                                              | Covers OAuth/reset/verification/DB sessions on our stack (React Router, Prisma, SQLite); scoping it away from authz caps the blast radius of a young dependency            |
| Signup model     | Open signup + role invites                                               | Community site; invites exist to onboard elevated roles, not to gate entry                                                                                                 |
| Providers        | Google only                                                              | Highest coverage, one consent screen + redirect URI per env                                                                                                                |
| Email            | Resend, behind a provider-agnostic mail layer                            | Verification, reset, invite mail; needs DNS records on mokupona.ch. The Resend SDK is confined to one provider module so it can be swapped without touching the app (§3.1) |
| Account linking  | Auto-link by email **and** require verification for password signups     | Google emails are verified; mandatory verification closes the pre-registration takeover attack                                                                             |
| Invites          | Email-bound, single-use, ~7-day expiry; admins only; ceiling `moderator` | `admin` remains a seed/DB-level role, preserving immutability invariants                                                                                                   |
| Migration        | Force-reset, one-time global logout                                      | <20 prod users; avoids a bcrypt compatibility shim                                                                                                                         |
| Privacy consent  | "By continuing you accept…" notice on login/signup pages                 | Covers both password and Google paths; replaces the join-only checkbox                                                                                                     |
| `name`           | Mandatory on `User`                                                      | Google supplies it anyway; join form gains a required field; migrated users backfilled from email local-part                                                               |
| Roles in phase 1 | Untouched                                                                | `Role` table, guards, admin UI, immutability rules all survive as-is                                                                                                       |

---

## 3. Architecture

```
                 app/features/auth/                          app/features/users/
        ┌────────────────────────────────────┐      ┌──────────────────────────────────┐
        │ auth.server.ts  (betterAuth config) │      │ admin user mgmt (moved from      │
        │ auth-client.ts  (createAuthClient)  │      │   models/user.server.ts + routes)│
        │ guards.server.ts (requireUserId,    │ uses │ invite creation UI + model       │
        │   requireUserWithRole, getUser…)    │◀─────│ /me account page                 │
        │ email templates (verify/reset/…)    │      └──────────────────────────────────┘
        │ invite acceptance route logic       │                    │
        └────────────────────────────────────┘                    │
                 │ auth.handler(request)          │ sendMail(msg)  │
        routes/api.auth.$.ts (catch-all)          ▼                ▼
                                         ┌─────────────────────────────────┐
        Role table + role checks:        │ app/features/mail/  (§3.1)      │
        OURS, unchanged                  │ MailProvider ⇐ resend │ console │
                                         │              ⇐ capture (e2e)    │
                                         └─────────────────────────────────┘
```

- **Handler route:** one catch-all `api.auth.$.ts` forwards loader/action requests to `auth.handler`. Client-side calls go through `createAuthClient` (`better-auth/react`).
- **Guard shim:** `guards.server.ts` re-implements the exact API of [`session.server.ts`](../../app/utils/session.server.ts) (`getUserId`, `getUser`, `getUserWithRole`, `requireUserId`, `requireUser`, `requireUserWithRole`, `logout`) on top of `auth.api.getSession({ headers })`. The ~21 admin routes and [`root.tsx`](../../app/root.tsx) keep their call sites; only the import path changes. This is the load-bearing trick that keeps the cutover small.
- **better-auth learns nothing about roles.** `roleId` is populated by a `databaseHooks.user.create.before` hook (default role `user`, or the invite's role — §6). All role _checks_ stay in our guards.

### 3.1 Mail provider abstraction

Outbound mail is its own small feature, `app/features/mail/`, so no vendor SDK leaks into the rest of the app:

```ts
// app/features/mail/types.ts — deliberately minimal (no cc/attachments until needed)
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}
export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}
```

- **Providers** (one module each, selected once at startup by `MAIL_PROVIDER`):
  - `resend` — the only module that imports the Resend SDK; prod + staging default.
  - `console` — logs the message; local-dev default, no API key needed.
  - `capture` — writes each message as JSON to a well-known directory; e2e default, Cypress reads the files (`cy.readFile`) to follow verification/reset/invite links. No HTTP-level mocking of Resend's API needed.
- **Templates live with their features** (`auth/` owns verification + reset, `users/` owns invite) and call `sendMail(message)` — the layer transports, it doesn't compose. Copy is **neutral transactional English** (not the lowercase site brand voice); minimal text-first HTML, no designed email layout.
- better-auth's `sendResetPassword`/`sendVerificationEmail` callbacks are the only integration points; they build a `MailMessage` and hand it to the layer.

Swapping Resend later = one new provider module + a `MAIL_PROVIDER` value. Nothing else changes.

## 4. Data model

better-auth owns four tables (generated via `npx @better-auth/cli generate`, then hand-merged into [`schema.prisma`](../../prisma/schema.prisma)): `Session`, `Account`, `Verification`, plus new fields on our existing `User`. Our additions in **bold**.

```prisma
model User {
  id            String   @id @default(cuid())   // ids preserved — Event FKs survive
  email         String   @unique
  name          String                          // NEW, mandatory (backfilled for existing users)
  emailVerified Boolean  @default(false)        // NEW (better-auth)
  image         String?                         // NEW (better-auth; Google avatar)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  role   Role   @relation(fields: [roleId], references: [id], onDelete: Restrict)  // UNCHANGED
  roleId String
  events Event[]                                // UNCHANGED
  sessions Session[]
  accounts Account[]
}
// Session / Account / Verification: better-auth defaults, verbatim.
// Password model: DROPPED (force-reset migration, §7).

model Invite {
  id         String    @id @default(cuid())
  email      String                             // bound address — must match at acceptance
  roleName   String                             // "user" | "moderator"; ceiling enforced in code
  token      String    @unique                  // random 32-byte, single-use
  expiresAt  DateTime                           // createdAt + 7 days
  acceptedAt DateTime?
  createdBy  User      @relation(...)           // admin who issued it
  createdAt  DateTime  @default(now())
}
```

Sessions move from stateless cookies to DB rows — server-side revocation ("sign out everywhere") becomes possible; cost is one indexed SQLite read per request (enable better-auth's cookie cache if it ever shows up in the Fly memory/latency profile).

## 5. Auth flows

- **Password signup** (`/join`): name (required) + email + password + confirm; Conform + Zod as today. `requireEmailVerification: true` — login is blocked until the Resend-delivered verification link is clicked. Submitting lands on a **check-your-inbox interstitial** (no resend button: an unverified login attempt makes better-auth send a fresh link, which is the recovery path for lost/expired mail). Privacy notice text sits above the submit button (and on `/login` next to the Google button); the checkbox goes away.
- **Login** (`/login`): email+password or "Continue with Google". The **remember-me checkbox stays**, mapped to better-auth's `rememberMe` (unchecked = session cookie, checked = long-lived session). `redirectTo` behavior of the current pages is preserved. A "forgot password?" link is added.
- **Reset**: `/forgot-password` (request) + `/reset-password` (token form), wired to better-auth's `sendResetPassword` → Resend. Completing a reset proves mailbox ownership → the `onPasswordReset` hook sets `emailVerified: true` (this is how migrated users get verified, §7).
- **Google OAuth**: `socialProviders.google`; `accountLinking: { enabled: true, trustedProviders: ["google"] }`. First-time Google users get `name`/`image` from the profile and role `user` via the create hook. Linking is safe because password accounts are always verified (§2).

## 6. Invites

Custom feature — no better-auth plugin. Creation lives **inline on `/admin/users`**: an "Invite" header action opens a form (email + role picker, `user` | `moderator` — `admin` is not offered and rejected server-side); pending invites render as a distinct card-row section on the same page, each with a revoke action. On submit, a token row is written and Resend sends the link `/invite/$token`.

Acceptance at `/invite/$token`:

1. Token invalid / expired / already accepted → friendly dead-end page.
2. **Not logged in:** show signup (password form, email prefilled and locked, or Google). After the account exists _with the invite's email address_, apply the role and stamp `acceptedAt`. A Google login returning a different address than the invite's → explain and offer retry.
3. **Logged in, email matches:** confirm screen → upgrade role via the existing [`updateNonAdminUserRole`](../../app/models/user.server.ts) guard (admins are never touched — immutability preserved). Downgrades are not performed (moderator invited as user is a no-op).
4. **Logged in, email differs:** explain, offer logout-and-retry.

Race safety: acceptance marks the token used in the same transaction as the role change. Verification note: an invite link click proves control of the bound mailbox, so accepting an invite may set `emailVerified: true` for a password signup created through it (skipping a second verification mail).

## 7. Migration & cutover

One Prisma migration + data script, shipped with the parity phase (implementation-plan Phase 1):

- Add `name` (backfill = email local-part), `emailVerified` (false), `image` (null) to `User`; create `Session`/`Account`/`Verification`/`Invite`; **drop `Password`**.
- For each existing user create a credential `Account` row whose password is a **freshly generated scrypt hash of a random throwaway secret** (via better-auth's `hashPassword`). Old bcrypt hashes are never imported: format-valid, never matches, and guarantees the reset flow has a credential account to update (safer than relying on reset creating one).
- Cutover effects: everyone is logged out (cookie sessions unreadable), every old password fails → users run "forgot password", which also verifies their email. With <20 users: send them a short personal heads-up.
- [`seed.ts`](../../prisma/seed.ts) is rewritten to create users through better-auth's server API (so hashes/accounts are shape-correct), keeping the three roles and demo users.

## 8. Environments & config

New env vars (`.env.example`, Fly secrets on **both** apps — remember [staging needs `-a`](../fly-apps-and-inspection.md)): `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MAIL_PROVIDER` (§3.1), `RESEND_API_KEY` (only where `MAIL_PROVIDER=resend`). `SESSION_SECRET` retires with the old cookie.

Outside-the-repo work, needed before their respective phases: Resend domain verification for mokupona.ch (DNS: SPF/DKIM records); Google Cloud OAuth consent screen + one redirect URI each for localhost, staging, prod.

Local dev & e2e run without real credentials via the mail providers (§3.1): dev uses `console`, e2e uses `capture` (Cypress follows verification/reset/invite links from the captured JSON) — the existing [`mocks/`](../../mocks/index.js) server needs no Resend interception. Google OAuth is exercised manually against localhost, not in e2e.

## 9. Phase 2 outlook (context, not scope)

Roles decompose into **finer global permissions** (permission strings bundled into roles). Everything phase 1 leaves in place points there: `Role` stays a normalized table ready to grow a `Permission` relation; all checks flow through `requireUserWithRole`, the single choke point to swap for `requirePermission`; better-auth has no opinion because it never learned about roles.
