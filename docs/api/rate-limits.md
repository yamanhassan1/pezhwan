# PEZHWAN Rate Limits

Rate limiting protects the authentication surface (login, register, OTP,
refresh, MFA) and the general API from abuse. Every budget is a fixed-window
atomic counter keyed by a scope — by default the client IP, or a per-user /
per-application scope on authenticated endpoints so a shared NAT cannot poison
a budget.

## Default budgets

Defaults come from `DEFAULT_RATE_LIMITS`
(`packages/shared/src/constants.ts`) and are applied by
`RateLimitService` (`packages/core/src/services/rateLimit.service.ts`).

| Budget     | Window          | Default | Scoped by (HTTP layer)                        |
| ---------- | --------------- | ------- | --------------------------------------------- |
| `login`    | 15 minutes      | 10      | IP (`/v1/auth/login`)                         |
| `register` | 15 minutes      | 10      | IP (`/v1/auth/register`)                      |
| `otp`      | 10 minutes      | 5       | IP (`/v1/auth/otp/*`, password flows)         |
| `refresh`  | 15 minutes      | 30      | IP (`/v1/auth/refresh`)                       |
| `mfa`      | 10 minutes      | 10      | IP (`/v1/mfa/*`, OAuth `code_challenge`)      |
| `api`      | 15 minutes      | 100     | IP, or `userId`/client scope on authed routes (sessions, webhooks, GraphQL, teams, subscriptions) |

Related, non-HTTP budgets: account lockout is 5 failed attempts to a 15-minute
`loginLockUntil` (per `DEFAULT_LOCKOUT`); OTPs allow max 5 attempts, 5-minute
TTL, and a 30-second resend cooldown (`DEFAULT_OTP`).

## Durability tiers (Option-C hybrid)

The limiter degrades in tiers so an outage can **never widen or bypass a limit**
(reference: `docs/security/rate-limiting.md`):

1. **Redis ready** — atomic `INCR` + one-time `EXPIRE`, shared across every
   instance, low latency.
2. **Redis configured but down** — the atomic check-and-increment delegates to a
   **durable MongoDB counter** (`ratelimitcounters`, a single
   `findOneAndUpdate` aggregation that also resets the window when it lapses).
   Limits stay shared across instances via the shared MongoDB; the outage
   degrades persistence, never strictness.
3. **Redis never configured / no Mongo** — bounded in-process counter (the
   documented single-node degraded mode).

`RateLimitService.consume()` is a single atomic storage op per request;
concurrent requests cannot lose increments. No tier ever throws to the caller —
if the limiter itself fails, the HTTP middleware answers by letting the request
through (availability over strictness, since the budgets could not be enforced
anyway).

## 429 response

Denials come from `rateLimit()` middleware (`packages/express/src/rateLimit.ts`):

```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
x-request-id: <id>

{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "retryAfterMs": 60000,
    "requestId": "<id>"
  }
}
```

- `Retry-After` — seconds until the window resets; honor it before retrying.
- `X-RateLimit-Limit` / `X-RateLimit-Remaining` — the window budget and units
  left; also sent on **allowed** responses so clients can self-throttle.
- Allowed requests that exhaust the budget within a window are counted by the
  same atomic counter (fixed window per scope).

Core code (non-HTTP gateways) throws `RateLimitError`
(`RATE_LIMIT_EXCEEDED`) carrying `retryAfterSeconds` instead of headers.

## Raising budgets

Budgets are tunable at runtime construction; unspecified budgets keep the
defaults. `createPezhwan` accepts `rateLimits`:

```ts
import { createPezhwan } from '@pezhwan/core';

const runtime = createPezhwan({
  // ...tenantId, applicationId, issuer, audience, otpDelivery
  rateLimits: {
    login:   { limit: 50,   windowMs: 15 * 60_000 },
    otp:     { limit: 20,   windowMs: 10 * 60_000 },
    api:     { limit: 500,  windowMs: 15 * 60_000 },
  },
});
```

The reference identity server exposes these through its server configuration
(`config.rateLimits`; see `packages/core/src/pezhwan.ts:95`). The rate-limit
tuning runbook (`docs/operations/runbooks/rate-limit-tuning.md`) covers raising
budgets on a live deployment.

## Best practices

- Treat 429 as authoritative: back off at least `Retry-After` seconds.
- On the client, spread login/OTP requests so bursts never trip thresholds;
  remember OTP resend has its own 30-second cooldown.
- When running behind a proxy/LB, keep `trust proxy = 1` so `req.ip` is the real
  client IP — otherwise every user shares the proxy's address and burns one
  budget.
- For authenticated endpoints the HTTP middleware scopes by `userId` where
  sensible (`byUser` extractor in `routes.ts`); use a custom `scope` extractor
  (e.g. OAuth `clientId`) for service traffic that should not share an IP budget.
- Monitor the counters: alert on frequent 429s per IP as a brute-force signal
  (see `docs/security/rate-limiting.md` and the rate-limit load tests under
  `tests/security/`).