# Tenant Failover (Multi-Region)

## 1. Purpose and symptoms
`RegionManager` (`packages/core/src/services/infrastructure/region-manager.ts`)
coordinates active-active multi-region deployments: geo/latency routing, health
probes, and cross-region event broadcast (session revocation, password/MFA
changes, account locks). `switchPrimary(regionId)` flips the designated primary
and broadcasts `PRIMARY_CHANGED`.
**Symptoms:** primary region probe `down`, elevated per-region `rttMs`, users in
one geography timing out, or planned maintenance on a region.

## 2. Severity / priority
P1 (critical) when the primary is fully down (routing falls back to it). P2
(high) when degraded or on planned maintenance.

## 3. Preconditions
Access to the `RegionManager` instance/admin console. Identical region registry
on every node (`docs/operations/multi-region.md`). Real `RegionProbe` wired so
health is measured, never `unknown`. Cross-region `RegionEventTransport`
configured (Redis pub/sub, SNS/SQS, Kafka).

## 4. Step-by-step response

### 1. Assess health
```ts
const health = await regionManager.health();   // status/mongo/redis/rttMs per region
```
An unprobed region reports `unknown` (never guessed) -- investigate manually.

### 2. Pick the target region
```ts
const best = await regionManager.pickBestRegion();   // lowest RTT, cached 15 s
```
Select explicitly when driven by maintenance/geo knowledge.

### 3. Trigger failover
```ts
await regionManager.switchPrimary('eu-central-1');   // broadcasts PRIMARY_CHANGED
```

### 4. Verify
```ts
regionManager.getPrimary().id;                                     // 'eu-central-1'
(await regionManager.health()).filter(h => h.regionId === 'eu-central-1')[0].status;
```

### 5. Verify event propagation
```ts
await regionManager.revokeSession('eu-central-1', 's-1', 'u-1');
```
Confirm `SESSION_REVOKED` delivered and deduplicated (60 s window) in every
region's transport logs.

### 6. Monitor, then restore when recovered
Watch `auth.login.success`/`auth.login.failed` for 15 min. When the old region
reports `healthy`, `await regionManager.switchPrimary('us-east-1')`.

## 5. Verification
- [ ] `getPrimary()` returns the intended region; `/health/ready` 200 there.
- [ ] Logins/refreshes succeed via the new primary.
- [ ] No `PRIMARY_CHANGED` loop; events reach all regions exactly once.
- [ ] Metrics baseline after 15 min.

## 6. Rollback
`await regionManager.switchPrimary('us-east-1')` to revert. If the transport
fails, run single-region until repaired -- routing is best-effort and degrades
to primary, never to a gate.

## 7. Blast radius and communication
Scope: tenants routed through the affected region; no data loss (independent
Mongo stores; events broadcast). Impact: brief latency while clients re-route;
JWKS cache TTL bounds staleness. Comms: status within 5 min, notify tenants if
data-residency routing changes, close on restoration.

## 8. Post-incident review checklist
- [ ] Timeline: detection, failover, restoration; no data loss.
- [ ] Every broadcast event applied exactly once per region.
- [ ] Probe accurate; evaluate automatic failover.
- [ ] `docs/operations/multi-region.md` updated if gaps surfaced.

## 9. Owner references
| Item | Reference |
| --- | --- |
| Region manager | `packages/core/src/services/infrastructure/region-manager.ts` |
| Architecture | `docs/operations/multi-region.md` |
| Transport | `RegionEventTransport` (Redis pub/sub, SNS/SQS, Kafka) |
| Diagnostics | `RegionProbe` results, `manager.health()` |
| Alert source | Region probe `down`/`degraded`, latency alerts |
| On-call | Platform team (infrastructure / SRE) |