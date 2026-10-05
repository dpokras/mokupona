# Logging contract

The shared contract every phase of the logging rework codes against. The
rationale and the phasing live in [`plan.md`](./plan.md); this file records only
what the contract **is**.

## Module

`app/logger.server.ts` exports one named binding:

```ts
export { logger };
```

- Named import only — `import { logger } from "~/logger.server"`. `package.json`
  sets `"sideEffects": false`, so an import-for-side-effect would be tree-shaken
  away.
- No default export. No `createLogger()` export. No per-module logger factory.
- Child loggers come from `logger.child(bindings)`; they inherit level, format
  and redaction.

The instance is a plain `pino.Logger`, constructed with:

| Setting                | Value                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `timestamp`            | `pino.stdTimeFunctions.isoTime`                                                           |
| `formatters.level`     | `(label) => ({ level: label })`                                                           |
| `serializers.error`    | `pino.stdSerializers.err`                                                                 |
| `redact`               | `app/logger/redact.server.ts`, see below                                                  |
| `level`                | `LOG_LEVEL`, see below                                                                    |
| stdout sink (prod)     | `pino.destination(1)` — raw JSON                                                          |
| stdout sink (non-prod) | `pino-pretty`, colorized, `ignore` pid/hostname                                           |
| file sink              | `pino.destination` on `$LOG_DIR/app.log`, `append: true`, `mkdir: true` — always raw JSON |
| test                   | `pino({ level: "silent" })`, no streams                                                   |

Outside tests both sinks are combined with `pino.multistream`. The file sink is
always constructed — there is no on/off switch and no environment branch in the
wiring; only the shape of the stdout sink varies. Every stream entry carries its
own `level`, which defaults to `info` independently of `logger.level`.

**A failing sink is disabled, never fatal.** `disableOnError`, private to
`app/logger.server.ts`, listens on the file sink, because pino's own listener
handles `EPIPE` and re-emits everything else — and an `error` with no listener
is what Node turns into a throw, out of an fs callback where no `try`/`catch`
of ours can reach it. A full `/data` would otherwise end the
process over a log line. The sink is silenced the way pino silences a broken
pipe, one `error` record reports it, and the run continues on stdout alone.
Rotation is what keeps the volume from filling; this is what happens when
rotation did not.

Every record therefore carries `time` as an ISO-8601 string and `level` as a
lowercase string label. The file sink's greppability and `pino-pretty`'s
rendering both depend on those two; change the `pino-pretty` options if
formatting misbehaves, never the pino ones.

## Environment

| Variable    | Default                                 | Purpose                                     |
| ----------- | --------------------------------------- | ------------------------------------------- |
| `LOG_LEVEL` | `info` in production, `debug` otherwise | minimum level; must be ≤ every stream level |
| `LOG_DIR`   | `os.tmpdir()/mokupona-logs`             | log file destination                        |

`NODE_ENV === "test"` forces `silent` and ignores both variables.

## Shutdown

`app/logger.server.ts` owns the only `SIGTERM`/`SIGINT` handlers the app
registers, outside tests. The handler is idempotent, logs one `shutting down`
record carrying `signal`, flushes both sinks and exits 0. `flushSync` is called
optionally — in dev the stdout sink is a `pino-pretty` Transform, which has
none — and inside a try/catch, because a sink that has not finished opening
throws `"sonic boom is not ready yet"`.

A failed flush does not abort the exit: the handler sets `process.exitCode = 0`
and retries once behind a 250 ms unref'd timer, well inside `fly.toml`'s 5 s
`kill_timeout`. The timer is unref'd so a short-lived `scripts/` tool still
exits immediately, and it has to exist at all because a process whose event loop
is held open by a listening server would otherwise ignore that signal and every
one after it. An unclean kill still loses the buffered tail.

## Redaction

All PII policy lives in one `redact` config, in `app/logger/redact.server.ts`.
Call sites log the plain value under the agreed key and the censor transforms it
on the way to the sinks; no PII is masked, hashed or truncated at the call site.
It is a module of its own rather than an inline literal because the test logger
is `pino({ level: "silent" })` with no redaction, so the only way to assert on
the censor is to build a pino instance around the exported config.

| Declared path                                  | Censor result                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `email`, `*.email`                             | first character, `***`, domain — `alice@example.com` → `a***@example.com`; `[redacted]` when there is no local part to keep |
| `ip`, `*.ip`                                   | `hashIp(value)`                                                                                                             |
| `password`, `req.headers.authorization`, other | `[redacted]`                                                                                                                |

`hashIp` (`app/logger/hash-ip.server.ts`) is an HMAC-SHA256 under a 32-byte salt
that rotates every 24 h, truncated to 16 base64url characters. The salt lives in
memory and is never persisted, and there is no new secret and no new environment
variable — `BETTER_AUTH_SECRET` stays scoped to better-auth. So an address is
correlatable within an epoch (failed-login clustering works) but not across
epochs and not across process restarts. Single machine, so there is no
cross-instance correlation to preserve.

Behaviour that call sites must know about:

- **Redaction applies to `logger.child()` — verified, not assumed.** Both the
  bindings handed to `child()` and the records logged through the child go
  through the censor. `email` and `ip` still stay out of child bindings; the
  request child carries `requestId` only.
- **`*.email` and `*.ip` reach exactly one level down.** `{ user: { email } }` is
  censored, `{ a: { b: { email } } }` is not. Keep bindings flat.
- **A non-string value under a declared path becomes `[redacted]`.**
  `getClientIPAddress` returns `null` for an unresolvable address, so those
  records carry `ip: "[redacted]"` rather than dropping the key.
- **`reason` holding a conform error map is affected.** `{ email: [...] }` under
  `reason` matches `*.email` with a non-string value, so the email field's
  validation messages arrive as `[redacted]`.
- **A string under `email` that is not maskable becomes `[redacted]`.** No `@`,
  an empty string, or a leading `@` leaves no local part to mask, so the whole
  value is dropped rather than written through. This matters because the two
  sites that log an unvalidated submission payload log whatever the user typed
  into the email field.
- **`redact` does not touch the message string**, which is why the call
  convention below requires a static literal.

## Rotation

`/data/logs/app.log` is rotated by `logrotate` (`logrotate.conf`, copied to
`/etc/logrotate.d/mokupona`) from `/etc/cron.hourly`, in `copytruncate` mode. The
app contains no rotation code. `LOG_DIR` in `fly.toml` and the path in
`logrotate.conf` must stay in agreement or rotation silently does nothing.

A dead `cron` is the failure mode this design cannot otherwise see: rotation
stops, retention silently exceeds the 30 day privacy commitment, and the volume
fills alongside SQLite. Decided in phase 2 (open question 3): the app checks once
at boot, in production only, whether a process named `cron` appears in `/proc`,
and logs at `warn` if it does not. `isCronRunning()` lives in
`app/logger/cron-check.server.ts` and returns `undefined` where `/proc` cannot be
read, so an unknown answer never raises a false alarm. No size alarm — `rotate 45`
× `maxsize 5M` compressed already bounds the volume at ~25 MB.

## Call convention

```ts
logger.warn({ userId, role }, "User has a role outside the role vocabulary");
```

- **`(bindings, message)`**, in that order. The message is the second argument.
- **The message is a static string literal.** No template literals, no
  interpolation, no user input. Redaction (phase 3) rewrites field values and
  never touches the message, so anything interpolated into it escapes the
  censor. Aggregate lines may state a count in fields, not in the message.
- Bindings is a flat object of the agreed field names below. A message with no
  fields may be logged as `logger.info("message")`.
- One record per event. A failure path logs once, at the level that matches its
  severity, and does not also log a second summary line.

## Level policy

| Level   | Meaning                                                                                                                                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trace` | unused                                                                                                                                            |
| `debug` | high-volume expected traffic: per-asset requests, per-navigation `.data` requests                                                                 |
| `info`  | normal completed operations: successful login, signup, submission, boot configuration                                                             |
| `warn`  | audit records and expected-but-notable failures: authorization denials, privilege and invite changes, failed login, stale token, lost races, 404s |
| `error` | unexpected failures with a stack or a discarded write: `handleError`, persistence failures, data that violates an invariant                       |
| `fatal` | unused                                                                                                                                            |

`error` is reserved for things a maintainer must act on. Anything a user can
trigger by typing the wrong password is at most `warn`.

## Field names

Redaction matches declared paths, so these names are load-bearing. Use the
listed key, never a synonym.

| Field           | Type      | Meaning                                                                |
| --------------- | --------- | ---------------------------------------------------------------------- |
| `email`         | `string`  | an email address, **always the plain value** — the censor masks it     |
| `ip`            | `string`  | a client IP, **always the plain value** — the censor hashes it         |
| `requestId`     | `string`  | a per-request UUID; carried as a `logger.child()` binding              |
| `userId`        | `string`  | `User.id` of the acting user                                           |
| `targetUserId`  | `string`  | `User.id` of the user an admin action operates on                      |
| `pattern`       | `string`  | matched route pattern; never `request.url`                             |
| `path`          | `string`  | request pathname, no query string; only where no `pattern` is in hand  |
| `statusCode`    | `number`  | response status                                                        |
| `shellMs`       | `number`  | ms until the `Response` exists (shell-ready, not body-complete)        |
| `isDataRequest` | `true`    | present only on the completion line of a single-fetch `.data` request  |
| `role`          | `string`  | a `Role.name`                                                          |
| `dinner`        | `string`  | `Event.id`                                                             |
| `formVersion`   | `string`  | `FormVersion.id`                                                       |
| `inviteId`      | `string`  | `Invite.id`                                                            |
| `addressId`     | `string`  | `Address.id`                                                           |
| `intent`        | `string`  | the `intent` an action dispatched on                                   |
| `storageKey`    | `string`  | image storage provider key                                             |
| `template`      | `string`  | a `mailTemplates` key                                                  |
| `provider`      | `string`  | a configured provider name: mail, image storage, or an auth account    |
| `reason`        | `unknown` | a structured explanation of a failure (validation errors, error codes) |
| `error`         | `unknown` | a caught throwable                                                     |
| `signal`        | `string`  | POSIX signal name, shutdown only                                       |

Boot and form-version fields, each used by a single call site:

| Field               | Type      | Meaning                                                       |
| ------------------- | --------- | ------------------------------------------------------------- |
| `databaseUrl`       | `string`  | `DATABASE_URL`                                                |
| `target`            | `string`  | the Prisma client target a `warn`/`error` log event came from |
| `folderPrefix`      | `string`  | `CLOUDINARY_FOLDER_PREFIX`                                    |
| `googleAuthEnabled` | `boolean` | whether Google OAuth is configured                            |
| `submittedVersion`  | `unknown` | the `formVersionId` a signup was submitted against            |
| `currentVersion`    | `string`  | the `FormVersion.id` that was live at the time                |

Rules:

- `email` and `ip` are **never** masked, hashed or truncated at the call site,
  and never appear under any other key (`recipient`, `to`, `clientIp`,
  `remoteAddress`). `obscureEmail` is gone; the censor replaces it.
- `email` and `ip` are **never** child-logger bindings. The request child
  carries `requestId` only.
- Paths are case-sensitive, and a redaction path is never built from user input.
- A caught throwable goes under `error` and nowhere else: `serializers.error` is
  what turns it into `{ type, message, stack }`. Under any other key an `Error`
  serializes to `{}`, because its own properties are not enumerable.
- New fields are added to this table before they are added to a call site.

## Correlation and request logging

`requestLoggerMiddleware` (`app/features/auth/middleware.server.ts`) runs first
in the root middleware array. It mints a UUID per request — Fly stamps
`fly-request-id` on responses only, so no inbound id is trustworthy — then
publishes `logger.child({ requestId })` two ways:

- `requestLoggerContext`, for anything holding the router context. Its default
  value is the process logger, so `.get()` is safe on a request the middleware
  never ran for (an unmatched path, or the instrumentation reading that
  request's context).
- an `AsyncLocalStorage` store behind `requestLogger`
  (`app/logger/request-context.server.ts`), for the modules the context API does
  not reach: `app/models/*`, mail, image storage, the auth guards.
  `requestLogger` is a proxy that resolves the store on every read, so it is
  used like a logger — `requestLogger.warn(...)` — while still recording under
  the request in scope at the call. The ALS instance is held by
  `app/utils/singleton.server.ts`, like `prisma` and better-auth. Outside a
  request `requestLogger` is the process logger.

**Anything logged while serving a request goes through one of those two.** The
bare `logger` is for boot and shutdown only — a record it writes carries no
`requestId` and cannot be joined to the completion line beside it, which is
worth the least on exactly the auth and signup lines an audit reads first.
Routes take the context, everything below them takes `requestLogger`.

`instrumentations` in `app/entry.server.tsx` emits **exactly one completion
line per request**, `"Request completed"`, carrying `pattern`, `statusCode`,
`shellMs` and — through the child — `requestId`. It covers what middleware does
not: resource routes, 404s, `/api/auth/*`. A handler that rejected raises that
line's level; it never adds a second record, and it never logs the error object,
which belongs to `handleError`. Instrumentations are observational: the router
swallows a throw inside one, so nothing load-bearing goes in there.

The policy the line follows is `app/logger/request-log.server.ts`:

| Surface                          | Handling                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `/healthcheck`, and `HEAD /`     | no record — the healthcheck loader `fetch`es the site root, so one check every 10 s is two requests |
| `.data` requests                 | `debug`, tagged `isDataRequest`; never filtered                                                     |
| `file/:fileId`                   | `debug`                                                                                             |
| any `4xx`                        | `warn` — this is what records the thrown-`Response` 403s and 404s                                   |
| any `5xx`, or a rejected handler | `error`                                                                                             |
| everything else                  | `info`                                                                                              |

Static assets need no exclusion: `@react-router/serve` mounts them before the
route table, so they never reach the handler.

`handleError` in the same file is the counterpart: it is the only surface that
logs a throw out of a loader, action, middleware or render with its stack, under
`error` and `path`. Exporting it is what stops React Router falling back to
`console.error`, which bypasses pino entirely. It returns `void` and is not
awaited, so its body is synchronous; it returns early on
`request.signal.aborted`, because the router aborts superseded navigations as a
matter of course; and thrown `Response`s never reach it, which is why the 4xx
rule above is what records them. The three streaming surfaces in the same file
— `onShellError`, `onError` and the stream timeout — log at `warn` with `path`.

## Test stub

`test/logger-stub.ts` exports `loggerStub`, and `test/setup-test-env.ts`
registers it globally:

```ts
vi.mock("~/logger.server", () => ({ logger: loggerStub }));
```

- The stub exposes `trace`, `debug`, `info`, `warn`, `error`, `fatal` and
  `child`, all `vi.fn()`. `child()` returns the same stub, so child bindings are
  invisible to assertions.
- Every mock is cleared in a global `beforeEach`, so a test file asserting on the
  stub sees only its own records.
- No test file declares its own `~/logger.server` mock. To assert a log record,
  import `loggerStub` and match the `(bindings, message)` argument order:

```ts
expect(loggerStub.warn).toHaveBeenCalledWith(
  expect.objectContaining({ storageKey: "dinners/a" }),
  "Failed to destroy stored image after DB commit",
);
```
