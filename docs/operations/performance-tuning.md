# Performance Tuning

Pezhwan is designed for stateless horizontal scaling: token verification is a
local JWKS check and the account-state gate is a short Redis read (30 s TTL)
that falls through to MongoDB on miss. This document covers defaults, cache
tiers, bottlenecks, and how to measure and tune.

---

## Defaults

Token/session lifetimes (`packages/shared/src/constants.ts`, overridable via
`PEZHWAN_*` env in `apps/identity-server/src/config/env.ts`):

| Parameter                   | Default  |     | Parameter              | Default          |
| --------------------------- | -------- | --- | ---------------------- | ---------------- |
| Access token TTL            | 15 min   |     | Session TTL            | 30 days          |
| Refresh token TTL           | 30 days  |     | Verification token TTL | 24 h             |
| Password-reset token TTL    | 15 min   |     | OTP TTL / length       | 5 min / 6 digits |
| OTP max attempts / cooldown | 5 / 30 s |     | Max active sessions    | runtime-config   |

Rate limits (`PEZHWAN_RATE_LIMIT_*`): login 10 / 15 min, register 10 / 15 min,
OTP 5 / 10 min, refresh 30 / 15 min, API 100 / 15 min. Lockout: 5 failed
logins → 15-minute lock.

Mongo indexes are seeded by `infrastructure/docker/mongo/init.js` and the model
schemas (`packages/core/src/models/`): `users.{tenantId,email}` /
`{tenantId,phone}` unique partials; `sessions.{userId,applicationId,status}`,
`{expiresAt}` TTL, `{currentRefreshTokenHash}` unique (reuse detection);
`auditlogs.{sequence}` unique; plus per-model indexes (oauthClient,
authorizationCode, otp, verificationToken, role/permission, apiKey,
backupCode, trusted-device, webauthn-credential). Indexes survive
backup/restore — the backup-drill seed mirrors the real schema.

## Redis cache tiers

| Key pattern                        | TTL                  | Purpose                             |
| ---------------------------------- | -------------------- | ----------------------------------- |
| `accountState:<userId>`            | 30 s                 | Token-version gate on every request |
| `session:<id>`                     | 30 s                 | Cheap `isSessionActive` liveness    |
| `rl:<type>:<scope>`                | window-based         | Fixed-window rate-limit counters    |
| OTP counters                       | OTP TTL              | Attempt caps, resend cooldown       |
| Locks / JWKS cache / region probes | short / 300 s / 15 s | Rotation, key cache, nearest region |

Redis is an **optimiser, never a gate**: on Redis loss, account-state falls
back to Mongo (fail-closed 503 on Mongo read failure) and rate limits to a
durable Mongo counter.

## Limits

- **Body size** — `PEZHWAN_BODY_LIMIT` defaults to `100kb` via
  `express.json({ limit })`; keep the nginx `client_max_body_size` (1m) aligned.

## Scale-out approach

1. **Local JWKS verify** — RS256 tokens verified against locally-cached signing
   keys (`Cache-Control: public, max-age=300`); no session-store lookup on the hot path.
2. **Redis-backed account state** — `AccountStateService.validate()` reads the
   30 s TTL cache, missing to a single indexed Mongo read.
3. **Shared signing keys** — `FileKeyStoreAdapter` persists `kid.pem` records on
   a shared volume (`PEZHWAN_SIGNING_KEYS_PATH`) or KMS so all pods share a `kid` family.
4. **Durable Mongo** — transactions serialize refresh rotation / OAuth code
   redeem; audit writes are fire-and-forget with buffered flush.

No shared in-process memory; every pod is interchangeable behind a stateless load
balancer (`trust proxy = 1`).

## Load-test targets

Phase 6 targets (`docs/architecture/scaling.md`, `docs/PROMPT.md`): overall p95
< 100 ms; auth < 50 ms p95; token verify < 10 ms p95; session lookup < 20 ms
p95; 10,000 RPS per instance; < 5 DB queries/request; > 95 % cache hit.
Per endpoint: login 10,000, refresh 8,000, sessions 5,000, register 5,000,
OAuth 3,000, MFA 2,000, audit 1,000 RPS.

`npm run test:load` references the `tests/load/` suite and
`scripts/benchmark.mjs` is a planned helper; neither is executed yet
(PRODUCTION_READINESS lists throughput/latency baselines as pending).

## Bottlenecks and mitigations

| Bottleneck                  | Mitigation                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| Argon2id CPU cost           | Parallelizes to CPU count; vertical-size or dedicated sign-in workers; tune `memoryCost`/`timeCost` |
| Mongo pool / slow queries   | Bounded pool (100/node); read replicas for session/account reads; profiler on `system.profile`      |
| Redis saturation            | Cluster mode; durable Mongo counter as outage fallback                                              |
| RSA sign/verify             | Local-only; cached JWKS; rotate ~30-day keys so `kid` stays hot                                     |
| Audit writes                | Fire-and-forget sink, buffered flush (`/v1/admin/metrics/flush`), off the hot path                  |
| Refresh rotation contention | Mongo transaction + atomic `active → rotating` claim: one winner per token                          |

## How to measure

- **Health** — `GET /health/live` (liveness); `GET /health/ready` (200 only when Mongo connected).
- **Status** — `GET /v1/admin/status` (issuer, uptime, metrics snapshot, ADMIN);
  `POST /v1/admin/metrics/flush` emits buffered metrics.
- **Mongo** — `db.setProfilingLevel(1)`, analyse `system.profile`; **Redis** —
  `redis-cli info` for memory, hit-rate, connections.
- **Load** — `npm run test:load` once `tests/load/` is implemented;
  `scripts/benchmark.mjs` for latency histograms.
