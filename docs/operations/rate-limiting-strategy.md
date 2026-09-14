# Rate-Limiting Strategy

Chosen strategy for Redis Distributed Rate Limiting (docs/PROMPT.md B.6):
**Option C — tiered durability with a MongoDB atomic fallback**, implemented in
`packages/core/src/services/rateLimit.service.ts`. An outage of any single
store degrades _persistence_ but **never widens or bypasses the limit**.

## Decision record

| Option                          | Mechanism                                                       | Chosen?                                                                 |
| ------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A — Fail closed (high-security) | 503 `RATE_LIMIT_UNAVAILABLE` when the limiter errors            | Partial: only when _all_ tiers fail and the caller requests strict mode |
| B — Redis Sentinel              | Automatic Redis failover                                        | Not chosen (infra cost for this tier; see trade-off)                    |
| **C — Tiered durability**       | Redis atomic INCR → MongoDB atomic counter → bounded in-process | **Chosen**                                                              |

### Why not a single-store design

A single Redis dependency means a Redis outage either (a) opens the floodgates
(fail-open) or (b) takes login down entirely (fail-closed). Neither is
acceptable for an identity provider. Options A and C are the only fail-safe
shapes; C is preferred because it stays _available_ while keeping the limit.

## Tier design

```
consume(type, scope)
  │ key = "rl:<type>:<scope>" (lowercased), ttl = window
  │
  ├─ Tier 1 ── Redis (or in-memory cache) ready?
  │             cache.incrementAndExpire(key, ttl)      ← ATOMIC INCR + one-time EXPIRE
  │             → decision(rule, count)
  │
  ├─ Tier 2 ── Redis not ready AND durableFallback enabled
  │             RateLimitCounterModel.findOneAndUpdate(  ← atomic $cond {$inc|reset}, upsert
  │               { _id: key }, ..., { upsert: true })
  │             → decision(rule, count)                  (shared across all instances via MongoDB)
  │             Mongo also down → fall through to Tier 3, never throw
  │
  └─ Tier 3 ── bounded in-process counter (single-node degraded mode only)
               cache.get / cache.set (best-effort, never throws)
```

### Counters are atomic

- Tier 1 uses an atomic `INCR` + one-time `EXPIRE`; concurrent requests can
  never lose increments and silently weaken the limit.
- Tier 2 (`mongoIncrement`, `rateLimit.service.ts:129`) is a single
  `findOneAndUpdate` pass that both resets an expired window and increments the
  live one, via a `$cond` pipeline — race-safe and self-cleaning.
- Tier 3 is bounded and documented degraded-mode only (single node).

## Default budgets

| Type       | Default limit | Window |
| ---------- | ------------- | ------ |
| `login`    | 10            | 15 min |
| `register` | 10            | 15 min |
| `otp`      | 5             | 10 min |
| `refresh`  | 30            | 15 min |
| `api`      | 100           | 15 min |
| `mfa`      | 10            | 10 min |

All budgets are config values (`PEZHWAN_RATE_LIMIT_*` → `rateLimit.rules`, see
`apps/identity-server/src/config/env.ts`); tuning guidance is in
`docs/operations/runbooks/rate-limit-tuning.md`.

## Failure semantics

- **Redis down, Mongo up (durableFallback on):** limits hold at Tier 2 and stay
  shared across instances. This is the default for the identity server.
- **Redis and Mongo both down:** the limiter falls back to a bounded in-process
  counter — it never throws and never returns a false "allowed".
- **Strict fail-closed mode:** the middleware layer can surface
  `RATE_LIMIT_UNAVAILABLE` (503) when both tiers are unreachable instead of
  degrading, per Strategy A (see `middleware/rate-limit.middleware.ts`).

## Acceptance coverage

- `tests/failure/redis-failure.test.ts` — a dead Redis degrades to the durable
  counter; budgets still enforced.
- `tests/integration/rate-limits.test.ts` — 429 with `Retry-After` on budget
  exhaustion; the fixed-window resets after the window.
- Multi-instance sharing is asserted by the integration suite against a single
  shared data tier.

## Distributed caveats

- Fixed window (not sliding) by design: a burst at the window boundary can
  issue up to `2 × limit` units. Acceptable for brute-force throttling; if a
  stricter shape is ever required, switch `decision()` to a sliding-window or
  token-bucket model behind the same `consume()` signature.
- Window is `ceil(windowMs/1000)` seconds; shortest default window is 10 min,
  so cross-instance clock skew of < 1 s is immaterial.
