# PEZHWAN Scaling Guide

PEZHWAN's design goal is stateless verification with durable state colocated in
Mongo + Redis, so the identity-server itself scales horizontally without a
shared application session store.

## Why it scales

### Stateless verification

Access tokens are self-contained RS256 JWTs carrying the full
`IdentityContext` (`userId`, `tenantId`, `applicationId`, `roles`,
`permissions`, `tokenVersion`). A node verifies them **locally**:

1. Verify the JWT signature + `kid` against the locally-cached JWKS
   (no session-store lookup, `Cache-Control: public, max-age=300`).
2. Validate account state via `AccountStateService.validate(userId,
   tokenVersion)` — a Redis read (`accountState:<userId>`, 30s TTL) that falls
   back to a single indexed Mongo read on miss.

No shared in-process memory is consulted; every pod is interchangeable.

### MongoDB as source of truth

All durable state — users, sessions/families, roles, OTPs, audit chain, OAuth
codes, webhooks, API keys — lives in MongoDB (transaction-capable replica set).
Multi-document transactions serialize refresh rotation and OAuth code redeem
across nodes because they target the same data store.

### Redis as the performance layer

Redis holds the ephemeral hot path only:

| Concern            | Key shape                | Notes                                     |
| ------------------ | ------------------------ | ----------------------------------------- |
| Rate limits        | `rl:<type>:<scope>`      | Atomic fixed-window counter, shared       |
| Session liveness   | `session:<id>` (30s)     | Cheap `isSessionActive`                   |
| Account state      | `accountState:<userId>` (30s) | Token-version gate on every request   |
| OTP attempt state  | per-OTP counters         | Attempt caps + cooldown                   |
| Distributed locks  | Redlock-style            | Key rotation, cross-instance coordination |

Redis is an optimiser, never a gate: if it is down the limiter slides to the
durable Mongo counter and account-state falls back to Mongo.

## Horizontal scaling topology

```
                 ┌── LB (sticky-free) ───────────────────────────┐
Client ──► TLS ──┤  identity-server ×N (stateless pods)          │
                 │    · local JWKS verify                       │
                 │    · local key store (shared volume/KMS)     │
                 └──────────────┬──────────────┬────────────────┘
                                ▼              ▼
                   MongoDB replica set    Redis (shared)
                   (transactions)         (limits, cache, state)
```

Minimum for N>1 nodes:

- `trust proxy = 1` so `req.ip` is real (audit + rate-limit scopes).
- A shared Redis URL so budgets and caches are not per-process.
- **Shared signing-key persistence**: `FileKeyStoreAdapter` (PEM files on a
  mounted volume or KMS-backed) so all pods sign with the same `kid` family and
  JWTs minted before a rollout still verify. `KeyStoreService.init()` loads
  persisted keys; `rotate()` appends a new key and retires the previous one
  without invalidating outstanding JWTs (`keyStore.service.ts`).

## Caching tiers

```
L1 in-process: JWKS (5m), account-state (30s), tenant config (1m)
L2 Redis:      session liveness (30s), rate limits, OTP attempts, locks
L3 Mongo:      durable source of truth (sessions, families, audit chain)
```

## Sharding

Because every query and authorization decision is tenant-scoped (see
[`multi-tenancy.md`](./multi-tenancy.md)), the data layer can be sharded or
partitioned by `tenantId`. Hashing or range-shard on `tenantId` keeps a
tenant's sessions, roles, and OTPs co-located; cross-tenant joins do not exist
by construction.

## Performance expectations

Section 9 (Scalability) and the KPI table of [`architecture.md`](./architecture.md),
plus the Phase 6 load-test targets in [`../PROMPT.md`](../PROMPT.md):

| Metric                       | Target                                   |
| ---------------------------- | ---------------------------------------- |
| Authentication               | < 50 ms p95                              |
| Token verification           | < 10 ms p95                              |
| Session lookup               | < 20 ms p95                              |
| Overall request p95          | < 100 ms                                 |
| Throughput per instance      | 10,000 RPS                               |
| DB queries per request       | < 5                                      |
| Cache hit rate               | > 95%                                    |
| DB / Redis connections/node  | 100 / 50                                 |

Load suites in `tests/load/` (`tests/load/lib/runner.js`) target: login
10,000 RPS, refresh 8,000 RPS, sessions 5,000 RPS, register 5,000 RPS, OAuth
token exchange 3,000 RPS, MFA verify 2,000 RPS, audit write 1,000 RPS.

## Bottlenecks and mitigations

| Bottleneck                  | Mitigation                                                               |
| --------------------------- | ------------------------------------------------------------------------ |
| Argon2id CPU cost           | Cheaply parallelizes up to CPU count per node; vertical-size the node, isolate hashing workers, or run dedicated sign-in workers; keep `memoryCost`/`timeCost` per policy |
| Mongo connection pool       | Bounded pool per instance (100/node target); read replicas for session/account reads |
| Redis single point          | Cluster mode + the tier-2 durable Mongo counter as the outage path        |
| RSA sign/verify             | Local-only (no remote call); cache JWKS; rotate 30-day keys so `kid` lookups stay hot |
| Audit writes                | Fire-and-forget sink, buffered writes + periodic flush (`/v1/admin/metrics/flush`), never on the auth hot path |
| Lockout/OTP counters        | Redis-backed dedupe so repeated attempts hit the shared counter, not per-pod memory |
| Refresh rotation contention | Mongo transaction + atomic `active → rotating` claim serializes to one winner per token |