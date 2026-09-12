# Alerting

Alert rules for a Pezhwan deployment, loaded by Prometheus from
`infrastructure/docker/monitoring/prometheus/alerts.yml` (reference via
`rule_files` in `prometheus.yml`).

> **Status:** `alerts.yml` is currently an empty placeholder. The rules below
> are the operating set operators should install; thresholds are starting
> points that must be tuned to each deployment.

---

## Recommended alert rules

| Alert | Expression (PromQL) | Severity | Meaning |
| ----- | ------------------- | -------- | ------- |
| `PezhwanDown` | `up{job="identity-server"} == 0` | critical | Auth is down |
| `PezhwanNotReady` | `/health/ready` probe 503 for 2 min | critical | Mongo dependency unavailable |
| `MongoDBDown` | `mongodb_up == 0` or connections to 0 | critical | Primary store unreachable |
| `RedisDown` | `redis_up == 0` for 1 min | warning | Degraded to in-memory/Mongo fallback by design |
| `LoginFailureSpike` | `rate(auth_login_failed_total[5m]) > N for 5m` | critical | Brute-force / credential stuffing |
| `MfaFailureRatio` | `rate(auth_mfa_failed_total[5m]) / rate(auth_mfa_success_total[5m]) > R for 10m` | critical | MFA bypass attempts or broken factor |
| `OtpSendFailure` | `rate(auth_otp_failed_total[5m]) > N for 5m` | warning | Provider failing; check circuit breakers |
| `RefreshReuseSpike` | `rate(auth_refresh_reuse_total[5m]) > N for 5m` | critical | Token theft / replay attack |
| `TokenRevokeBurst` | `rate(token_revoked_total[5m]) > N for 5m` | warning | Mass revocation (investigate) |
| `AuthzDenialSpike` | `rate(authz_denied_total[5m]) > N for 5m` | warning | Misconfigured permissions / probing |
| `RateLimitSaturation` | `rate(ratelimit_hit_total[5m]) > N for 15m` | warning | Abuse or over-tuned limits |
| `SecurityEventFlood` | `increase(security_event_total[5m]) > N` | warning | Audit anomaly spike; correlate with logs |

Metric names expose a `_total` suffix in Prometheus text format
(`auth_login_success_total`, etc.).

## Severity guidance

| Severity | Response | Example |
| -------- | -------- | ------- |
| `critical` | Immediately page; on-call engages | Server down, login-failure spike, MFA ratio |
| `warning` | Ticket; review within business hours | OTP send faults, rate-limit saturation, revoke bursts |
| `info` | Dashboard-only | Uptime changes, rotation events |

## Tuning thresholds

Start from the load-test baseline (see
[PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)) and re-target:

| Rule | Slow start | Steady state |
| ---- | ---------- | ------------ |
| Login-failure spike | 10 / 5m | 2-3x p95 of normal failure volume |
| MFA failure ratio | 0.5 | Deterministic drift above baseline |
| OTP send failure | > 1 / 5m | Alert on ratios; the chain retries by design |
| Refresh reuse | 0 for 5m (zero-tolerance) | Any volume is suspicious |

Principles:

- Thresholds are **rates/ratios**, not raw counts, so they survive traffic growth.
- Pair rate alerts with a baseline check so campaign scale-up does not page on-call.
- Use `for` clauses (5-10 min) to suppress transient blips.

## Runbook references

| Alert | Runbook |
| ----- | ------- |
| `PezhwanDown`, `MongoDBDown`, `RedisDown` | [database-failover.md](./runbooks/database-failover.md) |
| `LoginFailureSpike`, `RefreshReuseSpike` | [security-breach.md](./runbooks/security-breach.md) |
| `MfaFailureRatio`, `OtpSendFailure` | [security-breach.md](./runbooks/security-breach.md), [../security/incident-response.md](../security/incident-response.md) |
| `TokenRevokeBurst`, `AuthzDenialSpike` | [incident-response.md](./runbooks/incident-response.md) |

## Grafana alert sources

For in-Grafana alerting:

1. Add Prometheus and Loki as data sources (`datasources.yml`).
2. Provision notification policies: `critical` to PagerDuty, `warning` to
   Slack/webhook.
3. Mirror the critical-security rules as Grafana alerts over **Loki log
   signals** (e.g. an audit-chain-break message) that counters cannot see.
4. Keep the source of truth in `alerts.yml`; the bundle has no Grafana alert
   provisioner yet.

## Validation

`problems.md` records that alert thresholds and dashboards are **documented,
not tested**. Before production approval, run a staged drill per condition
(block a provider, kill a replica, trigger a failed-login flood) and confirm the
correct alert reaches the correct channel.