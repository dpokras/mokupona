# Logging rework: winston → pino

Status: phases 0–8 **landed on `chore/logging-rework`** 2026-07-26. Everything
below is the plan as written; where it differs from the code, the code and
[`contract.md`](./contract.md) win.

Three verification steps remain and can only be run by the owner, on Fly:

- the five phase 2 rotation checks below — `cron` alive, config parses, a forced
  rotation produces a compressed file and leaves `app.log` small, new lines keep
  arriving, and `logrotate` sits in `/etc/cron.hourly`.
- the phase 5 RSS and latency reading on the production machine.
- `ls /data/logs/` after 30 days, for the retention commitment.

Open question 1 (does `SIGINT` reach node through npm) is deferred by owner
decision; `start.sh` still ends with `exec npm run start`.

## Goal

1. Replace winston with pino, writing to **stdout** (captured by Fly) and **a
   rotating file on `/data`**, rotated by `logrotate` with a **30-day retention
   window** to match the planned privacy policy.
2. Close the observability gaps the migration exposes: unhandled errors that
   never reach the logger, no audit trail on privilege changes or invites, and
   ~26 silent failure paths.

## Current state

`app/logger.server.ts` writes `./logs/*.log` — the **ephemeral container
rootfs**, not the `/data` volume — so production log files are discarded on every
deploy and grow unbounded in between.

Across 19 call sites: 12 `info` (4 of them failure paths), 6 `error`, 1 `warn`.

- `app/entry.server.tsx` has no `handleError` export, so React Router falls back
  to `console.error`. Three more silent surfaces in the same file: `onShellError`
  (`:63`), `onError` (`:66`), the 6 s stream abort (`:73`).
- `obscureEmail` (`app/shared/http.server.ts:43`, 9 call sites) renders
  `"undefined***@..."` on a malformed address and is called on user-controlled
  input inside logging paths (`dinners_.$dinnerId.tsx:108`, `join.tsx:52`).
- IPs are logged raw at 9 sites with no retention policy.
- `app/features/auth/guards.server.ts:27` interpolates data into the message
  string, on the root middleware path, for every request by an affected user.

## Constraints

| Constraint         | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| Production machine | `mokupona-stack-b568`, 1 shared CPU, 256 MB RAM        |
| Volume             | 1 GB, `/data`, shared with the SQLite database         |
| Node               | 24 (`node:24-bullseye-slim`)                           |
| Server             | `@react-router/serve` 8.2.0 (Express 5 under the hood) |

---

## 1. Logger

Two sinks combined with `pino.multistream`, on the main thread — no worker
transport, no rotation library. `pino` 10.3.1 and `pino-pretty` 13.1.3 replace
winston; both are **production** dependencies. One construction path for every
environment: the stdout sink is either a raw `pino.destination(1)` or a
`pino-pretty` stream, and nothing else about the wiring changes.

```ts
// app/logger.server.ts
import pino from "pino";
import pretty from "pino-pretty";

const PRODUCTION = process.env.NODE_ENV === "production";
const LEVEL = process.env.LOG_LEVEL ?? (PRODUCTION ? "info" : "debug");
const LOG_DIR = process.env.LOG_DIR ?? path.join(os.tmpdir(), "mokupona-logs");

const stdout = PRODUCTION
  ? pino.destination(1)
  : pretty({
      colorize: true,
      translateTime: "SYS:HH:MM:ss.l",
      ignore: "pid,hostname",
    });

const fileDest = pino.destination({
  dest: `${LOG_DIR}/app.log`,
  append: true,
  mkdir: true,
});

const logger = pino(
  {
    level: LEVEL,
    redact: REDACT,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  },
  pino.multistream([
    { level: LEVEL, stream: stdout },
    { level: LEVEL, stream: fileDest },
  ]),
);
```

Implementation traps:

- **`level` must be set on every stream entry.** It defaults to `info`
  independently of `logger.level`; omitting it silently drops `debug` from that
  sink.
- **`append: true`** is what makes `copytruncate` rotation safe. Without
  `O_APPEND` the file goes sparse after truncation.
- **`pino.final` does not exist** (removed in v8). Use `flushSync()`.
- **The pretty stream goes on the stdout entry only.** The file sink always gets
  raw JSON — it is read over `fly ssh console` with `grep`, where ANSI colour
  codes are actively harmful.
- **`pretty()` returns a plain Transform, not a SonicBoom**, so it has no
  `flushSync()` — see §5.
- **`isoTime` and the level formatter replace pino's numeric defaults**
  (`"time":1753524000123`, `"level":30`) with `"time":"2026-07-26T09:20:00.123Z"`
  and `"level":"info"`. The file sink's greppability depends on both. `pino-pretty`
  also depends on them — `translateTime` shortens the ISO string, and colourising
  needs a string level label. If either misbehaves, adjust the `pino-pretty`
  options (drop `translateTime`, pass `useOnlyCustomProps: false`), never the pino
  ones.
- **Errors serialize as `err.message`, not `msg`.** pino's `api.md` documents the
  pre-v7 shape and is wrong.
- `package.json` sets `"sideEffects": false` — keep exporting and importing the
  `logger` binding; do not switch to an import-for-side-effect pattern.

### Environment

Two variables. Everything else is derived.

| Variable    | Default                                                      | Purpose                                     |
| ----------- | ------------------------------------------------------------ | ------------------------------------------- |
| `LOG_LEVEL` | `info` in production, `debug` otherwise                      | minimum level; must be ≤ every stream level |
| `LOG_DIR`   | `os.tmpdir()/mokupona-logs`; `/data/logs` on Fly via `[env]` | log file destination                        |

The file sink is always constructed — there is no on/off switch and no
environment branch in the wiring. Pretty-printing on stdout is
`NODE_ENV !== "production"`.

`LOG_DIR` also appears hard-coded in the logrotate config (§2) — they must agree
or rotation silently does nothing. Nothing is written inside the repo any more;
the `logs/` gitignore entry and the existing `.dockerignore` `*.log` rule become
vestigial and the stale `logs/` directory can be deleted.

### Development and test

**Dev**: `debug` level, stdout through `pino-pretty`, file sink under the OS temp
directory. Only `/data/logs` is rotated; the temp-directory file grows until the
OS clears it.

`pino-pretty` must be a **production** dependency. The server build externalises
every `node_modules` dependency (`build/server/index.js` opens with a bare
`import winston from "winston"` today) and the Dockerfile runs
`npm prune --omit=dev` at line 25, so a devDependency reached by a hoisted static
import is `ERR_MODULE_NOT_FOUND` at boot.

Two accepted consequences: the module and its 13 transitive deps (~360 KB, on par
with winston's 11) are parsed at boot in production even though `pretty()` is
never called there, and `pretty()` runs on the main thread rather than in a
worker.

**Test**: under `NODE_ENV === "test"`, construct `pino({ level: "silent" })` with
no streams and no destination — no pretty stream and no file, so vitest never
touches the temp directory.

- `app/features/images/image-storage.server.test.ts:22-24` mocks the logger with
  `{ logger: { warn } }` only — replace with a shared stub exposing
  `trace`/`debug`/`info`/`warn`/`error`/`fatal`/`child`, where `child` returns
  the stub.
- `guards.server.test.ts`, `middleware.server.test.ts` and `read.server.test.ts`
  import the real logger transitively with no mock.
- `test/setup-test-env.ts` has no global stub registration today; add one.

---

## 2. Rotation and retention

`logrotate` + `cron`, `copytruncate` mode. The app contains no rotation code.

`logrotate.conf` in the repo, copied to `/etc/logrotate.d/mokupona`:

```
/data/logs/app.log {
  su root root
  daily
  rotate 45
  maxage 30
  maxsize 5M
  dateext
  dateformat -%Y%m%d-%H%M%S
  compress
  ifempty
  missingok
  copytruncate
}
```

Four directives are load-bearing and easy to get wrong:

- **`maxage 30` is the retention control**, not `rotate`. It deletes by date.
  `rotate 45` is only a file-count backstop, deliberately above 30 so extra
  `maxsize` rotations cannot shorten the window.
- **`maxsize`, never `size`.** `size` overrides the time directive entirely,
  making `daily` inert and turning `rotate N` into a count of rotations rather
  than days.
- **`ifempty`, never `notifempty`.** Skipping rotation on an empty file skips the
  whole cleanup pass, so `maxage` never runs and files outlive the policy.
- **`dateformat` must include the time.** With day-granularity suffixes a second
  same-day rotation fails outright (`destination … already exists, skipping
rotation`), and `maxsize` can fire more than once a day.

Container changes:

- **Dockerfile** — extend the existing apt line to
  `apt-get install -y openssl sqlite3 logrotate cron`; `COPY logrotate.conf /etc/logrotate.d/mokupona`;
  `mv /etc/cron.daily/logrotate /etc/cron.hourly/` (Debian's default runs it once
  a day at 06:25, too coarse for `maxsize`).
- **`start.sh`** — run `cron` before the existing `exec npm run start`.

Footprint: ~160 KB/day compressed at today's volume, so ~5 MB for the 30-day
window. Request logging (§5) raises that. The bound that protects the SQLite
volume is `rotate 45` × `maxsize 5M` compressed, ~25 MB worst case.

Retention is "30 days, plus up to an hour" — logrotate only evaluates when cron
fires. **This does not hold as shipped**; see §2a for why the `daily` clock never
elapses and what the window actually depends on.

**Escalation if `copytruncate` ever loses lines:** switch to `postrotate` +
`SIGHUP` + `dest.reopen()`. That mode additionally requires a pidfile holding
`process.pid` (not PID 1 — see §5), a `SIGHUP` handler, and `delaycompress`.
§2a removes all three requirements by making node the scheduler.

---

## 2a. Option: node-driven rotation

Not implemented. Proposed 2026-07-26, after §2 shipped, as the resolution to two
defects §2 has in production.

Keep `logrotate` — it is the battle-tested part, and the four directive traps
above stay exactly as they are. Replace only the **scheduler**: an unref'd hourly
`setInterval` in the app `execFile`s

```
/usr/sbin/logrotate --state /data/logrotate.status /myapp/logrotate.conf
```

then calls the file destination's `reopen()`. It runs once at boot as well, so a
machine redeployed more often than the interval still rotates.

### The two defects it fixes

- **The state file is on the ephemeral rootfs.** `logrotate` in bullseye defaults
  to `/var/lib/logrotate/status`, and Debian's `cron.daily/logrotate` invokes it
  bare, so every deploy resets the `daily` clock. `maxage` pruning only executes
  **as part of an actual rotation** — a run that decides "not due" cleans nothing.
  Verified against fabricated 30-day-old files: on a fresh state file they all
  survive. `maxsize` fires independently of state, so the real severity is not
  "retention never runs" but **"`daily` is dead, and the 30-day window is enforced
  solely as a side effect of `app.log` crossing 5 MB"** — roughly correct at
  today's volume, and silently broken if volume ever drops. `--state` on `/data`
  is the whole fix, and it is unavailable without replacing Debian's shipped
  script, which hardcodes the bare invocation.
- **A failed rotation is invisible.** `/dev/log` does not exist in the container,
  so cron's `logger -t logrotate "ALERT exited abnormally"` writes to nothing, and
  its stdout is mailed to an exim4 spool on the ephemeral rootfs that nothing
  reads. Under node the failure goes through pino, so it reaches `fly logs` **and**
  `app.log`.

### The prize: `copytruncate` goes away

The §2 escalation path needs a pidfile and a `SIGHUP` handler only because an
external scheduler has to reach into node. When node invokes `logrotate` itself,
`reopen()` is the next statement. `pino.destination()` returns a SonicBoom, which
exposes `reopen()`.

That converts the failure mode from lossy to lossless: under `copytruncate`, lines
written between the copy and the truncate are destroyed; under rename +
`delaycompress` + `reopen()` they land in the rotated file, misfiled by
milliseconds. **`delaycompress` is load-bearing** — without it logrotate gzips and
unlinks the renamed file immediately, and writes into the deleted inode really are
lost.

### Changes implied

| File                   | Change                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `Dockerfile`           | drop `cron`, add `--no-install-recommends`, drop the `cron.hourly` move, `COPY logrotate.conf /myapp/logrotate.conf` |
| `start.sh`             | drop the `cron` line; `exec npm run start` untouched, so §8 Q1 is unaffected                                         |
| `logrotate.conf`       | `copytruncate` → `delaycompress`; the four load-bearing directives unchanged                                         |
| `app/logger.server.ts` | `createLogger()` returns the file SonicBoom so the rotation module can `reopen()` it                                 |
| new module             | the interval, the `execFile`, non-zero exit and stderr logged at `error`                                             |
| deleted                | `app/logger/cron-check.server.ts` + test, and the `isCronRunning()` boot warn                                        |

`fly.toml` does not change.

`--no-install-recommends` is worth doing either way: `cron` Recommends an MTA,
which apt resolves to 46 packages including exim4, `libpython3.9-stdlib` and
MariaDB client libraries. Measured rootfs delta **+83 MB**, against **+5 MB** with
the flag.

### Why not Fly's schedulers

Fly's [task-scheduling blueprint](https://fly.io/docs/blueprints/task-scheduling/)
configures supercronic as a `[processes]` group. Process groups run on **separate
Machines**, and a volume attaches to exactly one Machine — so the scheduler would
not be able to see `/data/logs/app.log`. The same constraint rules out Cron
Manager and scheduled Machines. Every scheduler the blueprint offers is
out-of-container; this work is in-container because it operates on a volume owned
by one Machine.

Running supercronic as a sidecar instead is a configuration Fly does not document,
and it costs memory this machine does not have — measured idle RSS **20.3 MB** on
the v0.2.29 that Fly's own snippet pins, **56.3 MB** on current v0.2.48, against
**5.1 MB** for Debian cron. It also creates a supervision problem that does not
exist today: Debian cron daemonizes and re-parents to PID 1, supercronic
deliberately stays in the foreground.

### Before adopting

- Soak-test rename + `delaycompress` + `reopen()` under concurrent writes. It
  follows from SonicBoom's `reopen()` and standard logrotate semantics, but the
  sequence has not been exercised end to end.
- All footprint figures above are from local Docker on `linux/amd64`, not from
  `mokupona-stack-b568`.

**Smaller fallback, if the interval is not wanted:** keep cron, but replace the
moved Debian script with one that passes `--state /data/logrotate.status` and
redirects to `>> /proc/1/fd/1 2>&1`. That fixes both defects at 5 MB, and forgoes
the `copytruncate` removal.

---

## 3. Redaction and PII

All PII policy lives in one `redact` config. Call sites log the plain value under
an agreed key; the censor transforms it on the way to the sinks. This replaces
all nine `obscureEmail` call sites, and the nine sites that log
`getClientIPAddress(request)` raw.

```ts
redact: {
  paths: ["email", "*.email", "ip", "*.ip", "req.headers.authorization", "password"],
  censor: (value, path) => {
    if (typeof value !== "string") return "[redacted]";
    switch (path.at(-1)) {
      case "email":
        return value.replace(/^(.).*(@.*)$/, "$1***$2");
      case "ip":
        return hashIp(value);
      default:
        return "[redacted]";
    }
  },
},
```

An IP is personal data under GDPR. `hashIp` is an HMAC under a salt that rotates
daily, using `node:crypto` only:

```ts
// app/logger/hash-ip.server.ts
import { createHmac, randomBytes } from "node:crypto";

const EPOCH_MS = 24 * 60 * 60 * 1000;
let epoch = -1;
let salt: Buffer;

export function hashIp(ip: string) {
  const current = Math.floor(Date.now() / EPOCH_MS);
  if (current !== epoch) {
    epoch = current;
    salt = randomBytes(32);
  }
  return createHmac("sha256", salt).update(ip).digest("base64url").slice(0, 16);
}
```

Resulting properties:

- Correlatable within an epoch — failed-login clustering still works.
- Not correlatable across epochs, and not across process restarts: the salt is
  held in memory only and never persisted.
- No new secret and no new environment variable. `BETTER_AUTH_SECRET` stays
  scoped to better-auth.
- Single machine, so there is no cross-instance correlation to preserve.

Redaction only matches declared paths, so the migration must **standardise the
key names**: every site logs an address under `email` and an address under `ip`,
never `recipient`, `to`, `clientIp` or `remoteAddress`. Paths are case-sensitive,
hyphenated keys need bracket notation, and a path must never be built from user
input. `redact` does not touch the message string, so no site may interpolate
either value into it.

**Verify when wiring phase 3:** that `redact` also applies to `logger.child()`
bindings. Keep `email` and `ip` out of child bindings either way — the child in
§5 carries `requestId` only.

Fold in while the file is open: `app/shared/http.server.ts:48` checks
`X-Forwarded-For` before `Fly-Client-IP`. On Fly the platform-set header should
win.

---

## 4. Errors

`handleError` and the §5 instrumentation are **not** interchangeable, and their
records do not overlap:

|          | `handleError`                                                      | `instrumentations.handler.request`                                                                      |
| -------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Fires on | any non-`Response` throw in a loader, action, middleware or render | every request through the React Router handler                                                          |
| Sees     | the `Error` itself, with stack                                     | `statusCode`, `meta.pattern`, `meta.params`, and `status: "error"` only when the handler itself rejects |
| Misses   | thrown `Response`s (403/404), requests that never error            | errors React Router recovers from by rendering an `ErrorBoundary` — the handler resolves normally       |

Division of labour:

- **`handleError` is the only place that logs at `error` level with a stack.**
- **Instrumentation emits exactly one completion line per request** (`pattern`,
  `statusCode`, `shellMs`, `requestId`) and never logs the error object. A
  `status: "error"` result raises that line's level; it does not add a second
  record.

Not exporting `handleError` is not an option: its absence is what makes React
Router fall back to `console.error`, which bypasses pino entirely.

Add the export to `app/entry.server.tsx`:

```ts
interface HandleErrorFunction {
  (error: unknown, args: { request: Request; context: …; params: … }): void;
}
```

- It returns `void` and **is not awaited** — the handler body must be
  synchronous.
- Exporting it **replaces** React Router's built-in `console.error`.
- **Guard on `request.signal.aborted`** — React Router aborts many requests
  normally and logging all of them is noise.
- Thrown `Response`s are filtered out before it fires, so the 403s from
  `assertUserHasRole` and 404s from `requireFound` need logging at the throw site
  (§6), not here.
- `args.params` comes from the **root** match; prefer instrumentation's
  `result.meta.params` where params matter.

Also log the three silent surfaces in the same file: `onShellError` (`:63`),
`onError` (`:66`), and the abort timer (`:73`) — the last only when the timeout
actually fires.

---

## 5. Request logging, correlation, lifecycle

### Correlation

Middleware mints the id; instrumentation logs the completed request.

```ts
// app/root.tsx:45 — existing middleware
async ({ context, request }, next) => {
  const requestId =
    request.headers.get("fly-request-id") ?? crypto.randomUUID();
  context.set(loggerContext, logger.child({ requestId }));
  return next();
};
```

Honouring `fly-request-id` correlates app logs with Fly's platform logs.
`entry.server.tsx` gains `instrumentations` (stable, non-`unstable_` in 8.2.0)
for the completion line — it covers resource routes, 404s and `/api/auth/*`,
which middleware does not, and its `info.context` is a live delegate so it can
read the id middleware set.

Constraints: `info.request` is a readonly projection
(`{ method, url, headers: Pick<Headers,"get"> }`) — no `.clone()`, no body, no
`signal`. `info.context` is `ReadonlyContext | undefined`, so the `requestId`
lookup must tolerate `undefined`. Instrumentations are observational only; a
throw is swallowed. Error records belong to `handleError`, not here (§4).

Log `pattern`, not `request.url` — the latter is unbounded cardinality. The
duration field is **`shellMs`**: both `await next()` and `await handleRequest()`
resolve when the `Response` exists, which for streamed HTML is shell-ready, not
body-complete.

Seed an **AsyncLocalStorage** store in the same middleware, since the context API
does not reach `app/models/*.server.ts`, `sendTemplate`, `storeImage` or
`guards.server.ts`. Store the ALS instance via `app/utils/singleton.server.ts`,
matching the existing pattern for `prisma` and `better-auth`.

### Noise exclusions — from day one

| Surface                          | Volume                                            | Handling                                      |
| -------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| `/healthcheck`                   | every 10 s, and it `fetch`es itself → 2 per check | exclude the path _and_ the self-`HEAD`        |
| `.data` requests                 | one per client-side navigation                    | tag `isDataRequest`, do not filter            |
| `file.$fileId`                   | one per image per page view                       | `debug`; the 404s at `:52`/`:61` are `warn`   |
| `guards.server.ts:27`            | per request for an affected user                  | per-user once-per-process cache               |
| `read.server.ts:126,134,187,213` | loops over every submission and friend entry      | aggregate to one summary line per roster load |

Static assets need no exclusion — `@react-router/serve` mounts them before the
route table.

`@react-router/serve` hardcodes `morgan("tiny")` with no way to disable it, so
every request also produces a plaintext line on stdout. Accepted: morgan never
reaches the file, so the duplication is confined to `fly logs`.

### Boot lines

Each answers a question that is currently unanswerable from logs:

- `mail.server.ts:31` — selected mail provider (a prod deploy silently on the
  `console` provider would drop every transactional mail).
- `image-storage.server.ts:30` — image provider + Cloudinary folder prefix.
- `auth.server.ts:14-21` — whether Google OAuth is enabled.
- `db.server.ts:9-17` — `DATABASE_URL`.

Also: `db.server.ts:15` calls `client.$connect()` with no `await` and no
`.catch()` — an unhandled rejection on boot. Fix it, and wire Prisma's
`log: ["warn", "error"]` events into the logger.

### Shutdown

In production both sinks are SonicBoom, so the handler stays synchronous. In dev
the stdout sink is a `pino-pretty` Transform with no `flushSync()` — call it
optionally rather than branching on the environment:

```ts
let closing = false;
function shutdown(signal: NodeJS.Signals) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, "shutting down");
  stdout.flushSync?.();
  fileDest?.flushSync();
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

`flushSync()` throws `"sonic boom is not ready yet"` if the file has not finished
opening — guard with try/catch, which matters for the short-lived `scripts/` ops
tools run under `tsx` on the VM. An unclean kill still loses the buffered tail.

**PID 1:** `fly.toml` sends `SIGINT` with a 5 s `kill_timeout`, but `start.sh`
ends with `exec npm run start`, so npm is PID 1. Verify the signal reaches node:

```
fly ssh console -C "kill -INT 1"
```

If it does not, change `start.sh` to
`exec ./node_modules/.bin/react-router-serve ./build/server/index.js`. Worth
fixing regardless — it is also why a clean Prisma `$disconnect` never runs.
Rotation is unaffected either way (`copytruncate` never signals the app).

Second issue: `@react-router/serve` registers its own SIGTERM/SIGINT handlers
that call `server.close()` and nothing else, with no ordering guarantee against
ours. They do not call `process.exit()`, so ours is not pre-empted.

---

## 6. Audit trail and silent paths

### Tier 1 — security and data-loss

| Location                                              | Gap                                                                                               | Level         |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------- |
| `admin.users.$userId_.edit.tsx:73`                    | `updateNonAdminUserRole` — a privilege change with zero logging                                   | `warn` audit  |
| `admin.users._index.tsx:100` + `invite.server.ts:118` | invite issuance unlogged; `acceptInvite`'s role promotion unlogged                                | `info`/`warn` |
| `guards.server.ts:66`                                 | `assertUserHasRole` throws 403 — the app's only authorization denial point, no record             | `warn`        |
| `admin.users.$userId.delete.tsx:14`                   | account deletion; return value discarded, so a blocked attempt to delete an admin is invisible    | `warn`        |
| `invite.$token.tsx:57-62`, `:133-135`                 | invite token replay and invite/identity mismatch — both silent redirects today                    | `warn`        |
| `admin.dinners.$dinnerId.delete.tsx:18`               | cascades away every `FormSubmission` + `FormVersion`, irreversibly, with no actor recorded        | `warn` audit  |
| `read.server.ts:126,134,187,213`                      | silent attendee/answer drops from the roster and the caterer CSV — aggregate to one line per load | `error`       |

### Tier 2 — mail

`mail.server.ts:35-45` `sendTemplate` is the single chokepoint for every outbound
mail and has no logging. `auth.server.ts:47` and `:62` hand it directly to
better-auth callbacks, where a throw is swallowed — **password reset and email
verification can fail completely silently today.** One try/catch fixes the class.

`resend.server.ts:20-27` throws an error whose message contains the **unmasked**
recipient address.

### Tier 3 — silent no-ops reported to the UI as success

Three model functions return `null` on a blocked write while their callers
discard the return value and redirect as though it worked:

- `address.server.ts:84` ← `admin.locations.$locationId.delete.tsx:14`
- `user.server.ts:111` ← `admin.users.$userId.delete.tsx:14`
- `invite.server.ts:48` (`resendInvite`) ← `admin.users._index.tsx:121`

Logging makes it diagnosable; checking the return value is the actual fix, out of
scope here — file it.

### Tier 4 — bare catches

- `me.tsx:101` — a database outage is reported to the user as "that doesn't match
  your current password".
- `me.tsx:135` — `unlinkAccount` failure is a 100% invisible no-op.
- `guards.server.ts:90-93` — `logout()` swallows `signOut` failures.
- `reset-password.tsx:58` — `catch {` discards the real error before logging
  "stale token" at `info`.
- `blur-placeholder.server.ts:38-40` — result is cached for the process lifetime,
  so one boot-time failure degrades the landing page until the next deploy.

### Cheapest coverage

`app/shared/http.server.ts:4` (`requireFound`) and `:63` (`unknownIntent`) sit
behind **13 call sites**. Two log lines instrument all thirteen.

### better-auth hooks

`app/routes/api.auth.$.ts:5-9` proxies all `/api/auth/*` to `auth.handler` —
OAuth callbacks, session refreshes, `linkSocial`, sign-out, email verification —
none of it logged. Unhooked `databaseHooks` worth adding: `session.create` (the
login record for the OAuth path), **`account.create`** (account linking,
auto-enabled via `trustedProviders: ["google"]`, takeover-adjacent and invisible
today), and `user.update`.

### Level corrections

- `login.tsx:70` failed login → `warn`
- `reset-password.tsx:59` stale token → `warn`
- `dinners_.$dinnerId.tsx:138` lost race that dropped a submission → `warn`
- `invite.$token.tsx:137`,`:178` invite accepted → `warn` audit + `userId`,
  `inviteId`
- `reset-password.tsx:65` password reset completed → add user identity
- `auth.server.ts:73` missing default role → add the email
- `guards.server.ts:27` → structured fields, not string interpolation

---

## 7. Phasing

| #   | Phase            | Content                                                                                                                                                                               | Risk   |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 0   | **Contract**     | logger module shape, level policy, field names (`email`, `requestId`, `userId`, `pattern`), shared test stub                                                                          | none   |
| 1   | **Swap**         | winston → pino + `pino-pretty` (both prod deps), stdout only, `isoTime` + string levels, `LOG_LEVEL`; all 19 call sites to `(obj, msg)`; delete the broken file transports; test stub | low    |
| 2   | **Rotation**     | file sink + `LOG_DIR`; Dockerfile `logrotate cron` + config + `cron.hourly`; `start.sh` starts `cron`                                                                                 | medium |
| 3   | **Redaction**    | `redact` config with the `email`/`ip` censor, `hashIp`, drop `obscureEmail`, `Fly-Client-IP` header order                                                                             | low    |
| 4   | **Errors**       | `handleError` + the three `entry.server.tsx` surfaces                                                                                                                                 | low    |
| 5   | **Correlation**  | request-id middleware, `loggerContext`, ALS singleton, `instrumentations`, noise exclusions                                                                                           | medium |
| 6   | **Lifecycle**    | boot lines, `$connect` fix, Prisma log events, shutdown flush, PID 1 verification                                                                                                     | medium |
| 7   | **Audit trail**  | Tier 1 + Tier 2                                                                                                                                                                       | low    |
| 8   | **Silent paths** | Tiers 3 + 4, the two `http.server.ts` helpers, level corrections                                                                                                                      | low    |

Phase 1 lands alone — it touches every call site, so mixing it with behaviour
changes would make the diff unreviewable. Phases 3–8 are largely independent.

**Verify after phase 2**, in order — a silently-dead cron is this design's main
failure mode:

1. `fly ssh console -C "pgrep cron"` — the daemon actually stayed up.
2. `fly ssh console -C "logrotate -d /etc/logrotate.d/mokupona"` — config parses,
   glob matches.
3. `fly ssh console -C "logrotate -f /etc/logrotate.d/mokupona"` — forced
   rotation produces `app.log-<date>-<time>.gz` and leaves `app.log` small.
4. New lines keep arriving in the truncated `app.log`.
5. `ls /etc/cron.hourly/logrotate` — the schedule move landed.

**Verify after phase 5:** RSS and request latency on the production machine,
using the `/proc` technique from `docs/staging-memory-investigation/findings.md`
(the container has no `ps` or `free`).

**Cannot be verified before 30 days:** that `ls /data/logs/` shows nothing older
than 30 days. Set a calendar reminder — it is the privacy-policy commitment and
nothing in CI can assert it.

---

## 8. Open questions

1. **Does SIGINT reach node through npm?** (§5) Determines whether `start.sh`
   changes. Shutdown only; rotation is unaffected.
2. **Custom Express server?** Would remove morgan duplication and give an ordered
   shutdown hook. Deferred — revisit if the flush proves flaky in phase 6.
3. **Who notices if cron dies?** (§2) Rotation stops, retention silently exceeds
   30 days, and the volume fills with SQLite on it. Answered in phase 2 with a
   boot-time check (`app/logger/cron-check.server.ts`); no size alarm. §2a
   dissolves the question instead — with node as the scheduler there is no
   separate daemon to die, and the check is deleted.
4. **Adopt §2a?** It is the only proposal that fixes the ephemeral state file,
   and the `daily` directive is inert until something does.

---

## 9. Follow-up

Filed out of phase 8 (§6 tier 3). A blocked write is now visible in the log, but
the UI still reports it as success. Three actions redirect as though the write
landed because they discard the `null` their model function returns:

| Call site                                | Discarded return                       |
| ---------------------------------------- | -------------------------------------- |
| `admin.locations.$locationId.delete.tsx` | `deleteAddress` — address still in use |
| `admin.users._index.tsx` (`resend`)      | `resendInvite` — no live invite        |
| `admin.users.$userId.delete.tsx`         | `deleteNonAdminUserById` — protected   |

The third already branches on the return value to log the outcome; all three
still need to surface it to the user. Checking the return value and reporting
the failure is a behaviour change, deliberately out of scope for the logging
rework.
