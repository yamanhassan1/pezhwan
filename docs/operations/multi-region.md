# Multi-Region Active-Active

Pezhwan supports running the identity control plane in several regions at
once, with requests routed to the nearest healthy region and security events
(session revocation, password/MFA changes, account locks) invalidated in
**every** region. The coordinator is the `RegionManager`
(`packages/core/src/services/infrastructure/region-manager.ts`), exported
from `@pezhwan/core`.

```ts
import { createRegionManager, type RegionConfig } from '@pezhwan/core';

const manager = createRegionManager({
  regions: [
    {
      id: 'us-east-1',
      name: 'US East (N. Virginia)',
      mongodbUri: process.env.US_MONGO_URI!,
      redisUrl: process.env.US_REDIS_URL!,
      primary: true,
      location: { lat: 39.0438, long: -77.4874 },
    },
    {
      id: 'eu-central-1',
      name: 'EU (Frankfurt)',
      mongodbUri: process.env.EU_MONGO_URI!,
      redisUrl: process.env.EU_REDIS_URL!,
      primary: false,
      location: { lat: 50.102, long: 8.7768 },
    },
  ],
});
```

## Request routing

Routing is best-effort — an unknown location or a down routing data path
**falls back to the primary region** instead of failing the request (routing
is an optimiser, never a gate).

Priority order in `getNearestRegion(location)`:

1. Explicit `location.regionId` (must name a configured region).
2. A `geoResolver` you supply, mapping `countryCode` / `ip` to a region id.
3. Geodesic nearest region when coordinates (`lat`/`long`) are present.
4. The designated primary.

For latency-aware selection, `pickBestRegion()` probes every region and
returns the one with the lowest measured round-trip time. Probe results are
cached (default 15 s) so the hot path never re-pings.

```ts
const region = manager.getNearestRegion({ countryCode: 'DE' });
const client = manager.getClient(region.id); // mongodbUri / redisUrl / health
const best = await manager.pickBestRegion();
```

`getClient(regionId)` returns configuration and a live health check — it
never opens connections itself, so routing adds no I/O until you build your
own clients from `context.config`.

## Global event broadcast (session invalidation)

Events travel over an injectable `RegionEventTransport`. The default is an
in-process bus (`LocalRegionEventTransport`), which gives single-node
deployments and tests identical semantics; multi-region deployments supply a
cross-region transport (Redis pub/sub, SNS/SQS, Kafka, ...).

```ts
await manager.revokeSession('us-east-1', 'session-001', 'user-001');

// or the general form
await manager.broadcastEvent({ type: 'PASSWORD_CHANGED', userId: 'u-1' });
```

Delivery guarantees:

- Every event is stamped with `id` (idempotency key), `sourceRegion`, and
  `issuedAt`.
- Each receiving manager deduplicates within a window (`dedupeWindowMs`,
  default 60 s; override per event with `ttlSeconds`) so at-least-once
  transports still apply the invalidation exactly once.
- Subscribers register with `manager.subscribe(handler)` and receive the
  event locally; a handler error is logged and never breaks delivery to other
  consumers.
- `PRIMARY_CHANGED` is broadcast automatically when you call
  `switchPrimary(regionId)`.

## Health and failover

`manager.health()` probes every region and reports
`healthy | degraded | down | unknown` per region. Without a configured probe
the status is honestly `unknown` (never guessed). Provide a `RegionProbe` to
measure MongoDB/Redis reachability and RTT:

```ts
const health = await manager.health(); // health spread across regions
```

Promote another region with `switchPrimary('eu-central-1')`; the manager
flips the flags, and routing falls back to the new primary for unknown
locations.

## Deployment notes

- Supply the same region registry to every node in the deployment so the
  registry matches across regions.
- Each region should run its own MongoDB/Search deployment (an active-active
  identity plane still needs a single source of truth for cross-region
  consistency — use sync/mirroring, or a shared ledger, that suits your
  correctness budget).
- Wire a real probe for latency routing and health dashboards.
- On shutdown call `manager.disconnect()` to release transport resources.
