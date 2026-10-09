# Data-Access Layer in `app/models/` — Conventions

Status: **fully implemented and ESLint-enforced** (architecture review
2026-07-18). This document is the reference for the conventions the layer
follows; the original migration plan it replaced has been carried out.

Routes, features, and utils never touch Prisma. The model files in
`app/models/` **are** the data-access layer; their public interfaces take
scalars and declared domain types — never Prisma `select` / `where` /
`include` / `data` shapes — so the ORM could be swapped by rewriting model
bodies while every consumer stays untouched.

## Boundary rule

**Only `app/models/**` may import `~/db.server` and `#prisma/generated/*`.**

Enforced by the `no-restricted-imports` override in `eslint.config.js`, which
applies to all of `app/` and exempts exactly:

- `app/models/**` — the layer itself;
- `app/db.server.ts` — the client singleton;
- `app/features/auth/auth.server.ts` — the Better Auth exception (below);
- `**/*.test.{js,jsx,ts,tsx}` — tests seed the DB directly.

_Within_ the models layer, Prisma types stay legal (e.g.
`Prisma.TransactionClient` on the `*InTx` seams) — they are internal plumbing,
never part of a public signature.

## Public interface conventions

- **Scalars and domain types in, declared types out.** Functions returning
  projections declare **explicit return types** rather than letting Prisma
  infer them — the declared type is the actual contract a replacement
  implementation must satisfy.
- **Entity types are re-exported from the owning model** (e.g.
  `export type { User }` from `user.server.ts`, `EventResponse` from
  `event-response.server.ts`), so consumers never import from the generated
  client.
- **No speculative surface.** No generic `select`/`where` passthroughs, no
  unused filter parameters; each function exists for a concrete caller.

## Error policy

- **Missing rows → `null`.** Lookups (`getXById`, `getXByEmail`, …) return
  `Type | null`; the caller decides whether absence is a 404, a redirect, or
  fine.
- **Invariant violations → typed errors.** When a write fails because the
  world changed underneath the caller, the model throws a dedicated error
  class the route can catch and translate into UX:
  - `FormVersionChangedError` (`form-submission.server.ts`) — the form was
    edited between render and submit;
  - `InviteNoLongerValidError` (`invite.server.ts`) — the invite was consumed
    or revoked.

## Cross-model transactions

Work spanning models composes via explicit `*InTx(tx, …)` functions that take a
`Prisma.TransactionClient` and are called from another model's `$transaction`:

- `deleteEventsInTx` (`event.server.ts`) — event delete with form cascade;
- `saveFormSchemaInTx` (`form.server.ts`) — form/version persistence inside
  event create/update.

These seams are models-internal; nothing outside `app/models/` calls them.

## The Better Auth exception

`app/features/auth/auth.server.ts` is the one intentional, lint-exempt place
outside the models layer that receives the raw client: Better Auth's
`prismaAdapter(prisma, { provider: "sqlite" })` owns its own tables and query
shapes, and wrapping a third-party adapter in model functions would add
indirection without insulation. The app's **own** logic in that file still goes
through models (`getRoleByName`, `setUserEmailVerified`).

## Current model modules

`address`, `board-member`, `event`, `event-response`, `faq`, `form`, `gallery`,
`form-submission`, `health` (DB ping for the healthcheck route), `image`,
`invite`, `page-view`, `password-reset`, `role`, `site-image`, `site-text`,
`user` — all as `*.server.ts` under `app/models/`.
