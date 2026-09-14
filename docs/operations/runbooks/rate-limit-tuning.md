# Rate Limit Tuning

## 1. Purpose and symptoms

`RateLimitService` (`packages/core/src/services/rateLimit.service.ts`) enforces
atomic fixed-window limits across three tiers: Redis (`INCR`+`EXPIRE`), durable
MongoDB counter (`ratelimitcounters`) when Redis is configured but down, and
bounded in-process counters otherwise. Defaults
(`packages/shared/src/constants.ts`, `DEFAULT_RATE_LIMITS`): login `10/15m`
(`PEZHWAN_RATE_LIMIT_LOGIN`), OTP `5/10m` (`PEZHWAN_RATE_LIMIT_OTP`), API `100/15m`
(`PEZHWAN_RATE_LIMIT_API`).
**Symptoms:** mass 429s on legitimate users, `ratelimit.hit` spike, counters not
resetting.

## 2. Severity / priority

P2 (medium) when legitimate users are blocked; P3 (low) proactive tuning.

## 3. Preconditions

Env/config + server host + Redis (`PEZHWAN_REDIS_URL`) access; baselines recorded.

## 4. Step-by-step response

### 1. Confirm from response headers

```
429 Too Many Requests
Retry-After: 450           # seconds to window reset
X-RateLimit-Limit: 10      # budget
X-RateLimit-Remaining: 0   # exhausted
```

`Retry-After` well above the window signals stale counters.

### 2. Inspect counters and limiter tier

```bash
redis-cli KEYS 'pezhwan:ratelimit:*'
redis-cli TTL 'pezhwan:ratelimit:login:tenant1:user@example.com'
curl -s https://ISSUER/health/ready | jq '.dependencies.redis'   # ready/degraded
```

Degraded Redis => per-instance counters during the outage
(`docs/security/rate-limiting.md`); confirm traffic is balanced across pods.

### 3. Adjust the budget

```bash
export PEZHWAN_RATE_LIMIT_LOGIN="20/15m"     # raise for a spike
export PEZHWAN_RATE_LIMIT_API="500/15m"
```

Per-tenant budgets pass through `createPezhwan({ rateLimits })`
(`apps/identity-server/src/config/env.ts:132-134`, `config.rateLimit.rules`).
Apply + restart:

```bash
docker compose restart identity-server
kubectl rollout restart deploy/pezhwan-identity-server
```

### 4. Verify the new limit

```bash
for i in $(seq 1 25); do curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST https://ISSUER/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"wrong"}'; done
```

429s must begin only past the new budget (e.g., request 21).

### 5. Revert if over-permissive

If `auth.login.failed` or `security.event` rises, restore defaults and restart.

## 5. Verification

- [ ] 429s only past budget; `Retry-After` matches the window.
- [ ] `ratelimit.hit` correlates with genuine excess traffic.
- [ ] Legitimate users unaffected; Redis counters expire on-window.

## 6. Rollback

Restore previous env values + restart (budgets load at startup, not dynamically).
Follow `security-breach.md` if the cause was an attack, not load.

## 7. Post-incident review checklist

- [ ] New limits recorded; root cause (load vs stuffing) confirmed before raising.
- [ ] Tenant-scoped or global choice documented.
- [ ] Redis health verified; `docs/security/rate-limiting.md` updated if permanent.

## 8. Owner references

| Item               | Reference                                                                             |
| ------------------ | ------------------------------------------------------------------------------------- |
| Service / defaults | `packages/core/src/services/rateLimit.service.ts`, `packages/shared/src/constants.ts` |
| Middleware         | `packages/express/src/rateLimit.ts` (G1)                                              |
| Policy / controls  | `docs/security/rate-limiting.md`; G1/G6 `docs/security-audit.md`                      |
| Env config         | `PEZHWAN_RATE_LIMIT_*` `apps/identity-server/src/config/env.ts:132-134`               |
| Alert source       | `ratelimit.hit`, mass 429s                                                            |
| On-call            | Platform team (application infrastructure)                                            |
