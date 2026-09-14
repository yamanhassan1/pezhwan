# Caching Strategy — 4 Tier Hierarchy

From edge CDN to MongoDB source of truth, each tier serves a specific purpose.

```mermaid
flowchart TB
    L1["Tier 1: Edge Cache (CDN / Worker)<br/>━━━━━━━━━━━━━━━━━━━━━━━<br/>JWKS (kid-keyed, 10 min TTL)<br/>OIDC Discovery (.well-known, 1hr TTL)<br/>Static assets (immutable)<br/>Hit rate > 99% for JWKS"]

    L2["Tier 2: Process-Local Cache (In-Memory per Pod)<br/>━━━━━━━━━━━━━━━━━━━━━━━<br/>JWKS keys (5 min TTL) — fallback when edge unavailable<br/>Account state (30 sec TTL)<br/>Tenant config (1 min TTL)<br/>Key store (kid-keyed, no TTL — state machine drives eviction)"]

    L3["Tier 3: Distributed Cache (Redis Cluster)<br/>━━━━━━━━━━━━━━━━━━━━━━━<br/>Session liveness (30 sec TTL)<br/>Rate limits (fixed-window counters, atomic)<br/>OTP attempt state (per-OTP counters, 5 min TTL)<br/>Distributed locks (Redlock)<br/>Global revocation pub/sub"]

    L4["Tier 4: Source of Truth (MongoDB Replica Set)<br/>━━━━━━━━━━━━━━━━━━━━━━━<br/>All durable state<br/>Session families + refresh rotation (transactional)<br/>Audit log chain (strictly ordered, SHA-256)<br/>User records, roles, permissions<br/>OAuth clients + authorization codes"]

    L1 -->|"Cache miss"| L2
    L2 -->|"Cache miss"| L3
    L3 -->|"Cache miss / write"| L4

    style L1 fill:#e3f2fd,stroke:#1565c0
    style L2 fill:#e8f5e9,stroke:#2e7d32
    style L3 fill:#fff3e0,stroke:#e65100
    style L4 fill:#fce4ec,stroke:#c62828
```

## Redis Key Reference

| Key Pattern                | TTL            | Purpose                             |
| -------------------------- | -------------- | ----------------------------------- |
| `session:<id>`             | 30s            | Cheap `isSessionActive` check       |
| `accountState:<userId>`    | 30s            | Token version gate on every request |
| `rl:<type>:<scope>`        | Sliding window | Atomic rate limit counters          |
| `otp:<tenant>:<app>:<key>` | 5m             | OTP attempt state + cooldown        |
| `lock:<resource>`          | Redlock TTL    | Distributed coordination            |

## Caching Decision Rules

| Data              | Tier    | Rationale                                           |
| ----------------- | ------- | --------------------------------------------------- |
| JWKS              | L1 + L2 | Read-heavy, rarely changes; 10min/5min TTL          |
| Account state     | L2 + L3 | Checked every request; 30s TTL; fail-closed on miss |
| Session liveness  | L3      | Hot path; 30s TTL; evicted on revocation            |
| Rate limits       | L3      | Shared across pods; atomic counters                 |
| All durable state | L4      | Source of truth; transactional writes               |

## Performance Targets

| Metric                             | Target     |
| ---------------------------------- | ---------- |
| Combined cache hit rate (L1+L2+L3) | > 95%      |
| Edge JWKS hit rate                 | > 99%      |
| DB queries per request             | < 5        |
| Token verification (edge)          | < 10ms p95 |
| Session lookup (cached)            | < 20ms p95 |
