# PEZHWAN Deployment Patterns

<!-- markdownlint-disable MD013 -->

Reference infrastructure lives under `infrastructure/`. Nothing here is the only
way to run PEZHWAN â€” it is the canonical set of patterns, from a local Compose
stack to active-active multi-region.

## 1. Docker Compose (local / single host)

`infrastructure/docker/docker-compose.yml` runs the full development stack:

| Service           | Image / build                                   | Role                                             |
| ----------------- | ----------------------------------------------- | ------------------------------------------------ |
| `mongo1..3`       | `mongo:7` (3-node replica set `pezhwan-rs`)     | Transactions-capable source of truth             |
| `redis`           | `redis:7-alpine`                                | Ephemeral state: rate limits, OTP, session cache |
| `identity-server` | Dockerfile at `apps/identity-server/Dockerfile` | The API (port `4011`)                            |

````bash
docker compose up --build        # in infrastructure/docker
```text

Notes:

- The 3-node replica set is required for multi-document transactions (refresh
  rotation, OAuth code redeem) â€” see `SessionService.withTransaction`.
- MongoDB init runs `rs.initiate()` from `./mongo/init.js`; healthchecks gate
  the identity-server startup with `depends_on: condition: service_healthy`.
- `PEZHWAN_ISSUER_REPLACEMENT` lets the issuer work both with host networking
  and behind a reverse proxy; `PEZHWAN_ALLOWED_ORIGINS` lists exact CORS
  origins.

## 2. Kubernetes + Helm

Plain manifests: `infrastructure/kubernetes/manifests/` â€” **16 manifests** for a
single `pezhwan` namespace:

| Group              | Manifests                                                                         |
| ------------------ | --------------------------------------------------------------------------------- |
| Namespace / config | `namespace.yaml`, `configmap.yaml`, `secret.yaml`, `configmap-mongo.yaml`         |
| MongoDB            | `statefulset-mongo.yaml` (3 replicas), `service-mongo.yaml`, `pvc-mongo.yaml`     |
| Redis              | `deployment-redis.yaml`, `service-redis.yaml`, `pvc-redis.yaml`                   |
| Identity Server    | `deployment.yaml`, `service.yaml`, `pvc.yaml` (signing-key store), `ingress.yaml` |
| Operations         | `hpa.yaml` (CPU 70% / memory 80%, 2â†’10 replicas), `network-policy.yaml`           |

The `network-policy.yaml` is the zero-trust template: ingress only from
`ingress-nginx`, egress only to the Mongo and Redis pods plus DNS â€” no other
paths exist.

Helm chart: `infrastructure/kubernetes/helm/pezhwan/` with a `pdb.yaml` template
(in addition to the HPA, network policy, ingress, secrets, and config templates)
and per-environment values:

- `values-dev.yaml`, `values-staging.yaml`, `values-prod.yaml` â€” overrides for
  `replicaCount`, `image.tag`, `resources`, `autoscaling`, `secrets`, and
  storage classes on top of `values.yaml`.

Rollout pattern for zero downtime: update the image tag,
`kubectl rollout status deployment/pezhwan-identity-server`; HPA scales up
before draining via the rolling-update maxSurge default, and readiness is gated
on Mongo (`GET /health/ready`).

> Note: the manifests are single-region. The multi-region active-active plane
> documented below is not wired into these manifests; add a second cluster +
> region event transport when you need it.

## 3. Terraform modules

`infrastructure/terraform/` provides IaC and a Terraform provider:

- `modules/aws/` â€” VPC + security groups, ALB, ECS (Fargate-style identity
  server), RDS (document/Mongo-compatible data layer), ElastiCache (Redis).
- `modules/azure/` â€” equivalent Azure landing zone (that target surface).
- `modules/gcp/` â€” equivalent GCP landing zone (that target surface).
- `main.tf` / `variables.tf` / `outputs.tf` â€” compose the modules with
  per-environment variables.
- `provider/` â€” a custom Terraform provider (`provider.go`, resources for
  tenant, user, role, OAuth client, webhook) so directory-wide configuration can
  be codified with `terraform apply`.

## 4. Nginx reverse proxy + TLS termination

Production is TLS-terminated upstream (Nginx, cloud LB, or Ingress) with the
identity server behind it:

````

Client â‡„ HTTPS :443 (Nginx / Ingress / ALB; TLS 1.2+/1.3, HSTS) â‡„ HTTP :4011
(identity-server)

```text

Ground rules:

- Set `trust proxy = 1` server-side so `req.ip`, audit, and rate-limit scopes
  see the real client (already the app default in `server.ts`).
- Proxy `/health/live` and `/health/ready` for LB health checks.
- CORS stays strict â€” the server reject origins that are not in
  `PEZHWAN_ALLOWED_ORIGINS`; do not add wildcard CORS at the proxy.
- `/.well-known/*` is deliberately readable cross-origin (public discovery).

## 5. Multi-region active-active

`docs/operations/multi-region.md` + `RegionManager`
(`packages/core/src/services/infrastructure/region-manager.ts`):

- Each region runs its own pods, Mongo, and Redis; a global traffic manager
  routes to the nearest healthy region.
- `RegionManager.getNearestRegion()` (regionId â†’ geoResolver â†’ geodesic â†’
  primary), `pickBestRegion()` latency probing (cached 15s), and
  `broadcastEvent()` invalidate session/password/MFA state in **every** region
  over an injectable `RegionEventTransport` (Redis pub/sub, SNS/SQS, Kafka).
- Events are idempotent (`id`, `sourceRegion`, `issuedAt`) and deduplicated per
  window (`dedupeWindowMs`, default 60s) so at-least-once transports still apply
  each invalidation exactly once.
- `switchPrimary(regionId)` promotes a region and broadcasts `PRIMARY_CHANGED`.
- Multi-region consistency is your correctness budget: single-location identity
  data behind active-active read replicas, or shared ledger/sync â€” choose per
  `docs/operations/multi-region.md` deployment notes.

## 6. Backup / restore

`docs/operations/backup-restore.md` documents the executed, evidence-producing
drill (`npm run drill:backup-restore`):

- **Backup** â€” logical (driver JSON) or binary (`mongodump`) dump of every
  collection + index manifest, gzip + AES-256-GCM encrypted with a 32-byte key,
  SHA-256 checked. RPO < 24h target.
- **Restore** â€” decrypt (auth-tag verified), restore into an isolated replica
  set, verify all indexes from the manifest, then `--verify-auth` boots the real
  runtime and proves `session create â†’ refresh â†’ reuse-rejected`.
- RTO < 1 hour; run the drill quarterly and keep backups offsite via the storage
  adapters (`packages/core/src/adapters/storage/`).

Signing keys are a separate failure domain: keys persist via
`FileKeyStoreAdapter` so already-issued JWTs keep verifying after restore â€” see
`docs/operations/disaster-recovery.md`.

## 7. Zero-downtime checklist

| Concern           | Pattern                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| Rolling deploys   | Deployment + HPA; readiness gated on `GET /health/ready` (Mongo connected)               |
| Key continuity    | Persisted `FileKeyStoreAdapter` (shared volume / KMS); rotate keys, never drop old `kid` |
| Startup bootstrap | `initKeyPersistence()` + `ensureBootstrap()` finish before serving traffic               |
| Graceful shutdown | SIGINT/SIGTERM â†’ close Redis + Mongo; drain before terminate                             |
| Rollback          | Old image tag is still `RollingUpdate`-compatible; JWKS keeps validating                 |
| Traffic on outage | Rate limiter and account-state fail _closed_; 503 is honest, never silent-allow          |
```
