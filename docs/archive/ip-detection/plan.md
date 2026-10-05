# Client IP detection, and the groundwork for rate limiting

Status: **step 1 implemented 2026-07-26**; part 2 is research for a later
session, nothing in it has been built.

## Goal

1. **Done:** make client-IP extraction reliable and non-spoofable. The helper
   used to return an attacker-chosen string on request; it no longer does.
2. **Later:** when rate limiting is actually introduced, do it from a correct
   starting point. Part 2 records the findings so that session does not have to
   redo the research.

Rate limiting is explicitly **out of scope for step 1**. The header fix stands on
its own — it is a correctness and log-integrity fix, not a prerequisite being
rushed for something else.

## The state that was fixed

For the record — this is what shipped before 2026-07-26 and what the defect list
below refers to:

```ts
export function getClientIPAddress(request: Request) {
  const ip =
    request.headers.get("X-Client-IP") ??
    request.headers.get("X-Forwarded-For") ??
    request.headers.get("HTTP-X-Forwarded-For") ??
    request.headers.get("Fly-Client-IP");

  return ip;
}
```

Four defects, in descending order of severity:

1. **`X-Client-IP` is checked first and nothing on Fly sets it.** It is pure
   client input. Any request can dictate this function's return value with one
   header. The one trustworthy source, `Fly-Client-IP`, is checked **last** and
   therefore never reached in an attack.
2. **`X-Forwarded-For` returns the whole comma-separated list**, unparsed — e.g.
   `"1.2.3.4, 203.0.113.9, 66.241.125.28"` lands in the log as the `ip` value.
3. **`HTTP-X-Forwarded-For` is not an HTTP header at all.** It is the PHP/CGI
   `$_SERVER` variable name (`HTTP_` prefix + header name) that leaked into JS
   libraries by copy-paste. If it ever arrives, a client put it there.
4. **No validation.** The value is not checked to be an IP, so it is also a
   log-injection surface — control characters and arbitrary payloads pass
   through into the structured logs.

The header list traces to `request-ip` → `remix-utils`' 15-header waterfall. The
structural objection to that shape: a union of trust domains is only as strong as
its weakest member, and first-match ordering lets the caller choose which entry
you read.

**Blast radius is bounded.** This helper feeds **logging only** — 12 call sites
across 6 route modules, no rate limit or access check depends on it:

| File                                | Lines         |
| ----------------------------------- | ------------- |
| `app/routes/dinners_.$dinnerId.tsx` | 100, 135, 147 |
| `app/routes/login.tsx`              | 58, 70        |
| `app/routes/join.tsx`               | 51, 77        |
| `app/routes/reset-password.tsx`     | 60, 66        |
| `app/routes/invite.$token.tsx`      | 134, 175      |
| `app/routes/forgot-password.tsx`    | 37            |

So the impact was **unusable abuse forensics plus log injection**, not an
authentication bypass. Fixing it ahead of the logging rework mattered because
`hashIp` over an attacker-supplied string produces confident-looking garbage that
reads exactly like a real client identity.

## Constraints

| Constraint            | Value                                                                   |
| --------------------- | ----------------------------------------------------------------------- |
| Production machine    | `mokupona-stack-b568`, 1 machine, `ams`, shared CPU / 256 MB            |
| Fly app IPs           | `2a09:8280:1::6:e61f` (v6, dedicated), `66.241.125.28` (v4, **shared**) |
| Server                | `@react-router/serve` 8.2.0 (Express 5 under the hood)                  |
| better-auth           | 1.6.23                                                                  |
| Proxy in front of Fly | none                                                                    |

`@react-router/serve` gives loaders and actions a **web `Request`**, so
`app.set("trust proxy")`, `req.ip` and `proxy-addr` are not reachable.
Header-based derivation is the only option — which makes the single-value
`Fly-Client-IP` approach the right design rather than a shortcut.

---

# Step 1 — reliable header extraction (implemented)

## Which header to trust

| Header                                | Fly proxy behaviour                                                            | Trust               |
| ------------------------------------- | ------------------------------------------------------------------------------ | ------------------- |
| `Fly-Client-IP`                       | **Set and unconditionally overwritten** from the real TCP peer. Single-valued. | **Yes**             |
| `Fly-Forwarded-Port`                  | Always set by the proxy                                                        | Yes                 |
| `Fly-Region`                          | Set by the proxy; the edge that accepted the connection                        | Yes                 |
| `X-Forwarded-For`                     | **Appended to, not replaced**                                                  | Partial — see below |
| `X-Forwarded-Port`                    | Fly's docs: "may be set by the client"                                         | No                  |
| `X-Forwarded-Proto` / `-Ssl`          | Documented as client-reported                                                  | No                  |
| `X-Client-IP`, `HTTP-X-Forwarded-For` | **Not set by anything on Fly**                                                 | No                  |

Because Fly _appends_ to `X-Forwarded-For`, the structure on arrival is:

```
X-Forwarded-For: <client-supplied entries…>, <real client IP>, <your Fly app IP>
                  ^ spoofable, any length     ^ index -2        ^ index -1
```

The rightmost entry is **your own app IP**, so the real client is
**second-from-right** — neither the leftmost (spoofable) nor the rightmost (your
own address). Fly's docs recommend `Fly-Client-IP` outright when no other reverse
proxy is in front, which is our case.

**Decision: read `Fly-Client-IP` only, and fail closed.** No waterfall. A silent
fallback is the actual hazard — it hides the day the trusted header stops
arriving and starts trusting a spoofable one instead. The header to read is a
_deployment_ fact, not a runtime guess.

## Implementation — shipped

`app/shared/http.server.ts`, with `import { isIP } from "node:net"` at the top of
the file:

```ts
export function getClientIPAddress(request: Request): string | null {
  const header = request.headers.get("Fly-Client-IP");
  if (!header || header.length > 64) return null;

  const value = header.trim().toLowerCase();
  const family = isIP(value);
  if (family === 0) return null;
  if (family === 4) return value;

  const mapped = /^(?:0*:)*0*ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  return mapped && isIP(mapped[1]) === 4 ? mapped[1] : value;
}
```

Three properties worth keeping:

- **`isIP` gates everything.** Anything that is not an IP becomes `null`, which
  closes the log-injection surface as a side effect rather than as a separate
  control.
- **IPv4-mapped IPv6 is unwrapped.** `::ffff:1.2.3.4` and `1.2.3.4` are the same
  client; leaving both forms in circulation gives one client two identities in
  the logs (and, later, two rate-limit buckets).
- **Length bound before parsing**, so a multi-megabyte header is not parsed at
  all.

Port and bracket stripping (`[2001:db8::1]:443`, `1.2.3.4:5678`) is deliberately
**not** included: `Fly-Client-IP` is a bare address, and an unexpected format
should fail closed rather than be coerced into something plausible. It would only
be needed if an `X-Forwarded-For` path is ever added — see the fallback sketch
in part 2.

## Behaviour changes

- **Return type is unchanged** (`string | null`), and every call site already
  passed the result straight into a log field, so **no call site was edited**.
  The 12 sites in the table above are untouched.
- **Local dev and tests log `ip: null`.** Not a regression — the Vite dev server
  sets none of the four old headers either, so the old helper already returned
  `null` there.
- **In production, values become real.** Before, a crafted request logged
  whatever it chose; now it logs the address Fly saw.

## Tests

`app/shared/http.server.test.ts` — new file, eight cases, all passing:

| Input                                          | Expected        |
| ---------------------------------------------- | --------------- |
| `Fly-Client-IP: 203.0.113.9`                   | `"203.0.113.9"` |
| `Fly-Client-IP: 2001:DB8::1`                   | `"2001:db8::1"` |
| `Fly-Client-IP: ::ffff:203.0.113.9`            | `"203.0.113.9"` |
| `X-Client-IP: 1.2.3.4` only                    | `null`          |
| `X-Forwarded-For: 1.2.3.4, 66.241.125.28` only | `null`          |
| `Fly-Client-IP: not-an-ip`                     | `null`          |
| `Fly-Client-IP: <2 KB of junk>`                | `null`          |
| no headers                                     | `null`          |

`tsc --noEmit` and `eslint` are clean on both files.

## Not verified in production

The behaviour above is verified against the helper's inputs, not against a live
Fly request. Nobody has yet logged the inbound header set on the deployed app to
confirm `Fly-Client-IP` arrives as expected — worth a glance at the first
production logs after the deploy, and a prerequisite anyway for the
absence-detection idea in §2.7.

## Interaction with the logging rework

`docs/logging-rework/plan.md` §3 already folds in "`Fly-Client-IP` should win".
That note is now **done and superseded** — the ordering was not the main problem,
the two never-set headers and the missing validation were, and all three are
fixed. Two refinements to that plan's `hashIp` remain **open**, both from the
privacy research in part 2; neither is implemented:

1. **Truncate before HMAC** — `/24` for IPv4, `/64` for IPv6. Strictly better: it
   shrinks the re-identification surface, and if the value is ever reused as a
   rate-limit key it stops IPv6 rotation from minting a fresh bucket per request.
2. **Say "pseudonymised", not "anonymised"** in the privacy policy. No EU
   authority accepts hashing _or_ truncation as anonymisation (AEPD–EDPS joint
   paper on hash functions; EDPB Guidelines 01/2025). The stronger claim buys no
   legal benefit and creates Art. 19 DSG accuracy risk.

The plan's 30-day retention is defensible **because** the stored values are
HMAC'd; for raw IPs the well-supported figure is 7 days (BGH III ZR 391/13, ULD
Schleswig-Holstein). Also worth logging `Fly-Region` — it is proxy-set, coarse,
and **not personal data**, so it gives free abuse-clustering with nothing to
retain about individuals.

---

# Part 2 — findings for the rate-limiting session

Nothing here needs doing now. It is recorded so the future session starts from
facts rather than from the docs, several of which are stale.

## 2.1 The finding that changes the plan: `auth.api.*` skips the limiter

better-auth registers its rate limiter as the `onRequest` hook inside `router()`
(`node_modules/better-auth/dist/api/index.mjs:163-169`), and **only
`auth.handler` calls `router()`** — `api` comes straight from `getEndpoints`
(`dist/auth/base.mjs:9,34`).

Every sensitive flow in this app calls `auth.api.*` directly from a route action:

| Flow                             | Call site                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `signInEmail`                    | `app/routes/login.tsx:45`, `app/routes/invite.$token.tsx:168`                                   |
| `signUpEmail`                    | `app/routes/join.tsx:63`, `invite.$token.tsx:156`, `app/features/auth/create-user.server.ts:27` |
| `requestPasswordReset`           | `app/routes/forgot-password.tsx:31`                                                             |
| `resetPassword`                  | `app/routes/reset-password.tsx:55`                                                              |
| `changePassword` / `setPassword` | `app/routes/me.tsx:94,104`                                                                      |
| `sendVerificationEmail`          | `app/routes/join.tsx:68`                                                                        |

Only `/api/auth/*` (`app/routes/api.auth.$.ts`, i.e. Google social login and the
client-side calls) passes through `auth.handler` and therefore through the
limiter.

> **So login, signup and password reset currently have no rate limiting at
> all** — not weak limiting, none. Setting `rateLimit` options in
> `auth.server.ts` will _not_ change that on its own.

The future session has to choose between routing those flows through
`auth.handler`, or adding its own limiter in the actions. That is the real design
decision, and it is unrelated to the header fix.

## 2.2 better-auth 1.6.23 facts, verified against installed source

The published docs are stale on two counts. Verified directly:

| Fact                                     | Value                                    | Source                                    |
| ---------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| Default window / max                     | **10 s / 100** — docs claim 60 s         | `dist/context/create-context.mjs:172-173` |
| `enabled` default                        | `isProduction` — off in dev              | same, `:171`                              |
| Default `ipAddressHeaders`               | `["x-forwarded-for"]`                    | `@better-auth/core/src/utils/ip.ts:342`   |
| Multi-entry XFF without `trustedProxies` | **returns `null`**                       | `ip.ts:330`                               |
| IPv6 masking                             | `/64` by default (`ipv6Subnet`)          | `ip.ts:196`                               |
| Dev/test fallback                        | returns `"127.0.0.1"`                    | `ip.ts:376-378`                           |
| `session.ipAddress` when unresolved      | stored as `""`, not NULL                 | `dist/db/internal-adapter.mjs:177`        |
| Unresolved-IP rate limit key             | shared `"no-trusted-ip"` bucket per path | `dist/api/rate-limiter/index.mjs:275`     |

**Consequence today:** Fly's `X-Forwarded-For` always carries ≥2 entries
(client + our app IP), so better-auth's resolver returns `null` on **every**
production request. `/api/auth/*` therefore shares one global bucket per path,
and `session.ipAddress` is written as `""` for all sessions.

Credit where due: 1.6.23's resolver is _correctly conservative_. It refuses
ambiguous chains, walks right-to-left skipping `trustedProxies` when configured,
validates with `isValidIP`, unwraps IPv4-mapped addresses and masks IPv6 to
`/64`. That is the full recommended algorithm — so aligning our helper with it
removes a divergence rather than inventing a second policy.

**One-line fix when the time comes:**

```ts
advanced: { ipAddress: { ipAddressHeaders: ["fly-client-ip"] } },
```

`trustedProxies: ["66.241.125.28", "2a09:8280:1::6:e61f"]` is the alternative
(introduced in 1.6.21) if the `X-Forwarded-For` path is ever needed instead.
Note `advanced.trustedProxyHeaders` is a **different** option — it governs base
URL inference from `X-Forwarded-Host`, nothing to do with IP.

Advisory status: **1.6.23 is past all four** relevant issues, including
CVE-2026-45364 (IPv6 `/128` rate-limit bypass, fixed 1.4.17, and the advisory
names Fly.io specifically) and GHSA-x732-6j76-qmhm (double-slash path bypass,
fixed 1.4.5).

## 2.3 Storage

One machine (`fly machines list` → 1, `ams`), so the default `"memory"` store is
adequate. `"database"` buys durability across restarts and deploys and has an
atomic `consume`; it needs a 4-column table (`id`, `key` unique, `count`,
`lastRequest` bigint). Redis / distributed stores are overkill here.

If the app ever scales past one machine, `"memory"` silently multiplies every
limit by the machine count.

## 2.4 IP-only limiting is weak in both directions

- **False positives — one IP, many members.** RFC 6269 states that penalty-box
  approaches "simply will not work" under address sharing. Cloudflare measured
  CGNAT addresses being rate limited **3× more often despite _lower_ bot rates**,
  and their fix was to replace the IP with a cookie identifier (`_cfuvid`). For
  this site that is not hypothetical: Swisscom/Salt/Sunrise mobile, SBB and café
  Wi-Fi, and ETH networks are exactly the population signing up for dinners.
- **False negatives — one attacker, many IPs.** Residential IPv6 allocations are
  `/56`–`/48` (RIPE-690), so keying on `/128` is worthless; `freebind` exists
  specifically to defeat it. **Bucket at `/64`** — which better-auth already does
  by default.

The high-value control that sidesteps both is **OWASP device cookies**: issue a
signed cookie on successful login, count failures against the cookie when
present and against untrusted clients collectively when absent. Caps an attacker
at ~240 attempts/day/account regardless of botnet size while a member's own
browser keeps working.

Avoid hard account lockout: it is both a DoS vector against members and an
enumeration oracle (only real accounts lock). NIST SP 800-63B's only hard number
is ≤100 consecutive failures per account, with escalating delay as the preferred
supplementary measure and "disregard previous failed attempts after a successful
authentication".

## 2.5 Suggested starting limits

Anchored on better-auth's own defaults (3 req/10 s on `/sign-in/email`), the Epic
Stack (10/60 s), and Supabase (2 auth emails/hour, 60 s per-user cooldown). These
are a starting point, not a verified configuration:

| Endpoint               | Per account/email                                         | Per IP (v4) or /64 (v6) |
| ---------------------- | --------------------------------------------------------- | ----------------------- |
| Login                  | 10 failures / 15 min → escalating delay, reset on success | 20 failures / 15 min    |
| Signup                 | 3 / hour                                                  | 5 / hour, 20 / day      |
| Password reset request | 1 per 60 s, 3–5 / hour, 10 / day                          | 10 / hour               |
| Reset-token verify     | 5 per token, single-use                                   | 20 / hour               |
| All outbound mail      | —                                                         | global ~50–100 / day    |

That last row is arguably the highest-value limit on the list: it protects
`mail.mokupona.ch` deliverability, which is slow to win back once damaged.

## 2.6 Adjacent hardening, same session

- **Decoy-hash on the login path.** Absent-account vs wrong-password differ by
  ~300× when the code early-returns (~0.6 ms vs ~166 ms of bcrypt) — a trivially
  observable enumeration oracle that has shipped as advisories in Traefik,
  Vendure and Rancher. One dummy verify against a fixed hash closes it. Put it
  **behind** the rate limiter, or it becomes a CPU-exhaustion amplifier. Status
  codes and response body lengths have to match too.
- **Generic responses** on login, forgot-password and signup. Audit
  `invite.$token.tsx` and the profile routes for the same leak — enumeration
  resistance on login is pointless if another route answers the question.
- **`remix-utils` Honeypot + a ~2 s timing floor** on the public dinner-signup
  form. Never on login (password managers are guaranteed present). Add
  `data-lpignore="true"` and `data-1p-ignore`.
- **Turnstile as escalation** after ~3 failures, not always-on. Free to 1M
  solves/month; better GDPR posture than reCAPTCHA (Sateur et al., ARES 2025).
  Verify server-side and treat tokens as single-use.

## 2.7 Fly-specific notes

**Fly has no rate limiting and no WAF.** Only upstream DDoS scrubbing plus
connection load-shedding (~400 conn/sec/app, ~32 K concurrent, figures from a
2020-era community thread). That is orders of magnitude above anything that would
protect a login form. Every abuse control is application-layer.

Our v4 ingress is a **shared** IP, and Fly mitigates "a whole /24 block at a
time" — so a neighbour's attack can cause collateral damage. A dedicated IPv4
(~$2/mo) decouples that, but only worth buying if it is actually observed.

**The limit of `Fly-Client-IP`'s trustworthiness:** it is unforgeable only for
requests that traversed the proxy. Fly's private-networking docs state that 6PN
addresses "directly connect one Fly Machine with another, bypassing the Fly
Proxy", and the proxy reaches our machine over that same private network — so
there is no bind address that admits the proxy but excludes in-org 6PN peers.
Anyone with an org WireGuard peer, a `flyctl proxy` session or an org-scoped
`FLY_API_TOKEN` can reach `:8080` directly and forge the whole `Fly-*` set.

Detection, if wanted: `Fly-Client-IP` is documented as always set by the proxy,
so its **absence** means the request was not proxied, and can be rejected in
production. Two caveats before implementing:

- **`/healthcheck` must be exempt** — the check originates on the host over the
  private network. This is an _expectation_, not something we tested; verify by
  logging the inbound header set before enforcing anything, or deploys will break.
- It detects absence, not forgery. A hostile in-org peer that sets the headers is
  indistinguishable. That requires org-level compromise, which is a reasonable
  place to stop for a single-app org — better spent on scoping deploy tokens
  (`fly tokens create deploy`) than on request filtering.

## 2.8 Explicitly not worth doing here

- Cloudflare in front of Fly — would force a `CF-Connecting-IP` migration, a
  second TLS story and a consent question, to solve a problem we do not have.
- Redis or any distributed rate-limit store (one machine, SQLite).
- A graduated `/64` → `/56` → `/48` IPv6 escalation ladder; `/64` is enough.
- nginx or Envoy sidecars for rate limiting (Fly's own 2020-era suggestion).
- Always-on CAPTCHA, IP reputation feeds, device fingerprinting, constant-time
  response padding beyond the decoy hash.
- RoPA, DPIA, DPO, EDÖB registration — all confirmed **not required**: Art. 24
  DSV exempts private organisations under 250 employees, IPs are not Art. 5(c)
  sensitive data, and security logging is not high-risk profiling.

---

# Unrelated bug found in the same file — still open

Not touched by step 1.

`getDomainUrl` (`app/shared/http.server.ts:35`) trusts `X-Forwarded-Host`, which
**Fly does not set** — it is absent from Fly's documented header list, so on Fly
it is fully client-controlled. Its output is used as:

- the `origin` for invite emails — `app/routes/admin.users._index.tsx:107,124`
- the canonical URL — `app/root.tsx:50`

That is host-header injection into outbound links and canonical tags.
`BETTER_AUTH_URL` is already required and set, so the fix is to use a configured
canonical origin instead of deriving one from request headers. Same file, same
bug class, but a separate change from step 1.

---

## Sources

Fly:
[request headers](https://fly.io/docs/networking/request-headers/) ·
[private networking](https://fly.io/docs/networking/private-networking/) ·
[superfly/docs#1554 (XFF parse order)](https://github.com/superfly/docs/issues/1554) ·
[community: about rate limiting](https://community.fly.io/t/about-rate-limiting/156)

Header parsing:
[MDN X-Forwarded-For](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For) ·
[adam-p, The perils of the "real" client IP](https://adam-p.ca/blog/2022/03/x-forwarded-for/) ·
[adam-p, Forwarded Header Sabotage](https://adam-p.ca/blog/2022/03/forwarded-header-sabotage/) ·
[OWASP, IP spoofing via HTTP headers](https://owasp.org/www-community/pages/attacks/ip_spoofing_via_http_headers)

better-auth:
[rate limit docs](https://www.better-auth.com/docs/concepts/rate-limit) ·
[PR #10203 (trustedProxies)](https://github.com/better-auth/better-auth/pull/10203) ·
[CVE-2026-45364](https://github.com/advisories/GHSA-p6v2-xcpg-h6xw) ·
installed source under `node_modules/@better-auth/core/src/utils/ip.ts`

Abuse:
[RFC 6269](https://datatracker.ietf.org/doc/html/rfc6269) ·
[Cloudflare on CGNAT collateral damage](https://blog.cloudflare.com/detecting-cgn-to-reduce-collateral-damage/) ·
[RIPE-690](https://www.ripe.net/publications/docs/ripe-690/) ·
[freebind](https://github.com/blechschmidt/freebind) ·
[OWASP device cookies](https://owasp.org/www-community/Slow_Down_Online_Guessing_Attacks_with_Device_Cookies) ·
[NIST SP 800-63B](https://pages.nist.gov/800-63-3/sp800-63b.html)

Privacy:
[AEPD–EDPS on hash functions](https://www.edps.europa.eu/sites/default/files/publication/19-10-30_aepd-edps_paper_hash_final_en.pdf) ·
[EDPB Guidelines 01/2025 on pseudonymisation](https://www.edpb.europa.eu/system/files/2025-01/edpb_guidelines_202501_pseudonymisation_en.pdf) ·
[ULD, IP addresses FAQ](https://www.datenschutzzentrum.de/artikel/575-IP-Adressen-und-andere-Nutzungsdaten-Haeufig-gestellte-Fragen.html) ·
[Art. 24 DSV](https://www.datenschutzpartner.ch/dsv/dsv-24/)
