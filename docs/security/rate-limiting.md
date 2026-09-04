# Rate limiting

Authentication, token, password reset, MFA, OAuth, and administrative
endpoints use bounded rate limits keyed by the appropriate combination of
subject, client, tenant, and network source. Limits fail closed for the
protected operation when the authoritative limiter is unavailable; Redis
degradation is observable and must not create an unbounded in-memory store.

Every limit has a documented window, threshold, response, and alert. Verify
that successful requests recover normally, burst traffic is bounded, and
limits cannot be bypassed by changing case, forwarded headers, or identifiers.

## Chosen strategy: hybrid Option-C (Redis → durable MongoDB → in-memory)

Per the distributed rate-limiting requirement, the limiter is a **fixed-window
atomic counter** with three durability tiers so an outage can never widen or
bypass a limit:

1. **Redis ready** — atomic `INCR` + one-time `EXPIRE`, shared across all
   instances, low latency.
2. **Redis configured but down** — the atomic check-and-increment delegates to
   a **durable MongoDB counter** (`ratelimitcounters`, incremented with a
   single `findOneAndUpdate` aggregation pipeline that also resets the window
   when it lapses). Limits remain shared across instances through the one
   shared MongoDB; an outage degrades _persistence_ but never _strictness_.
3. **Redis never configured / no Mongo** — bounded in-process counter
   (documented single-node degraded mode).

`RateLimitService` (`packages/core/src/services/rateLimit.service.ts`) selects
the tier automatically: the durable Mongo fallback is only enabled when Redis
is **configured** (so a never-configured deployment keeps the lightweight
in-memory path), and no tier ever throws to the caller.

## Guarantees

- **Atomicity** — checks and increments are a single storage op; concurrent
  requests cannot lose increments and silently weaken a limit.
- **No bypass on outage** — every tier enforces the same window; a Redis or
  Mongo failure degrades the _backing store_, never the _limit_.
- **Self-cleaning** — expired windows reset atomically; no background sweep.

## Coverage

- Integration suite: `tests/integration/rate-limit.test.ts` (failure mode
  never bypasses), `tests/integration/rate-limit-durable.test.ts` (two
  instances share one Mongo counter during a Redis outage; window reset).
- Unit suite: `packages/core/test/security.test.ts` (atomicity under
  concurrency, 429-on-budget-exhaustion via the HTTP middleware).
