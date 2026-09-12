# Docker Deployment

The Compose stack in `infrastructure/docker/` runs the full identity plane on a
single host: a 3-node MongoDB 7 replica set (`mongo1`, `mongo2`, `mongo3`),
Redis 7, and the reference identity server (HTTP `4011`). This is the fastest
path to a working deployment and the base for on-premise
([on-premise.md](./on-premise.md)).

## Stack layout (`docker-compose.yml`)

| Service           | Image / build                                    | Notes                                                                                                                                  |
| ----------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `mongo1..3`       | `mongo:7`                                        | Replica set `pezhwan-rs`; `--replSet` + `mongod.conf`; named volumes `pezhwan_mongo{1,2,3}_data`; `mongosh` ping healthcheck every 5 s |
| `redis`           | `redis:7-alpine`                                 | Ephemeral state (rate limits, OTP, session cache); volume `pezhwan_redis_data`; `redis-cli ping` healthcheck                           |
| `identity-server` | monorepo root, `apps/identity-server/Dockerfile` | Depends on healthy `mongo1` + `redis`; port `4011:4011`                                                                                |

Assembly details:

- **Mongo image config** (`mongo/mongod.conf`) — journaling enabled, log to
  `/var/log/mongodb/mongod.log`, `bindIpAll`, `replSetName: pezhwan-rs`.
- **`mongo/init.js`** — runs on first boot: `rs.initiate()` with
  `pezhwan-rs` (priority `mongo1`=2, `mongo2`/`mongo3`=1; election timeout
  10 s), then waits for a primary and creates the `pezhwan` database with
  JSON-schema validation and the core indexes.
- **Server environment** — `PEZHWAN_ISSUER` is interpolated from
  `PEZHWAN_ISSUER_REPLACEMENT` (default `http://localhost:4011`) so it works
  both with host networking and behind a reverse proxy; the Mongo URI uses
  `?replicaSet=pezhwan-rs` and the standard `dev-tenant`/`dev-app` defaults.

Start / stop / verify:

```bash
docker compose -f infrastructure/docker/docker-compose.yml up --build -d
docker compose -f infrastructure/docker/docker-compose.yml ps          # all healthy
curl -fsS http://localhost:4011/health/ready                            # {"ok":true}
curl -fsS http://localhost:4011/.well-known/jwks.json                   # public keys
docker compose -f infrastructure/docker/docker-compose.yml down
npm run verify:compose                                                  # compose config sanity
```

## Compose overlays

- **`docker-compose.dev.yml`** — run `node --watch` in the container with an
  inspector on `127.0.0.1:9229`, bind-mount `apps/identity-server/src` and
  `packages/`, and opt into the `mongo-express` UI with `--profile dev-tools`
  (HTTP `127.0.0.1:8081`). Build once locally (`npm run build`) before `up`.
- **`docker-compose.test.yml`** — standalone test stack: single-node `mongo`,
  `redis`, identity server with `NODE_ENV=test`, lenient rate limits and
  disabled key rotation for the integration suite.
- **`docker-compose.prod.yml`** — production hardening overlay
  (`-f docker-compose.yml -f docker-compose.prod.yml`): `restart: always`,
  memory limits (Mongo 2 GiB each, Redis 512 MiB, server 1 GiB), read-only
  root with a `/tmp` tmpfs, `no-new-privileges`, `NODE_ENV=production`,
  secure cookies, a JWKS-fetch healthcheck, and fail-fast `:?` env
  interpolation for `PEZHWAN_PUBLIC_ISSUER` and `PEZHWAN_ALLOWED_ORIGINS`.
  The read-only root moves signing keys to `/tmp/keys` — mount a volume there
  if keys must survive container restarts.

## TLS reverse proxy (`nginx/`)

`infrastructure/docker/nginx/` provides an nginx:alpine proxy that terminates
TLS and enforces HSTS plus defense-in-depth headers. Mount your certificate
chain and key into `/etc/nginx/certs/` as `tls.crt` / `tls.key` (the `ssl/`
directory is reserved via `.gitkeep`). HTTP (80) redirects to HTTPS; the
upstream defaults to `http://identity-server:4011`, matching the Compose
network where the server listens on 4011. Rename the upstream host in
`proxy_pass` if the server is not reachable by its Compose service name, and
set the server's `PEZHWAN_ISSUER` to the public base URL.

## Monitoring stack

`infrastructure/docker/monitoring/` organizes Prometheus, Grafana, and Loki:
each subfolder has a `Dockerfile` and a config target
(`prometheus/prometheus.yml`, `grafana/datasources.yml`, `loki/loki-config.yml`).
These configs and images are placeholders — fill them in and wire Prometheus to
scrape the identity server before using them for production observability
(see [../monitoring.md](../monitoring.md)).

## Backups

The backup drill runs inside or outside the stack:

```bash
export PEZHWAN_MONGODB_URI="mongodb://localhost:27017,mongo2:27017,mongo3:27017/pezhwan?replicaSet=pezhwan-rs"
export PEZHWAN_BACKUP_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
npm run drill:backup-restore
```

`scripts/backup-drill.mjs` dumps (logical JSON by default, `mongodump` with
`--strategy binary`), compresses and AES-256-GCM encrypts into
`backups/pezhwan-<timestamp>.pzbu`; `scripts/restore-drill.mjs --verify-auth`
restores into an isolated replica set and validates indexes, integrity, and an
auth round-trip. Production backups should additionally run
`scripts/verify-backup.mjs <archive>` and copy archives offsite (see
[../disaster-recovery.md](../disaster-recovery.md)).

## Upgrading

```bash
docker compose -f infrastructure/docker/docker-compose.yml build
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

The Mongo containers keep their named volumes and the replica set does not
re-initialise (`init.js` is a no-op once a primary exists). Rolling restart
order is `mongo` (secondary-first preferred) → `redis` → `identity-server`.

## Dockerfile notes (`apps/identity-server/Dockerfile`)

- **Multi-stage** on `node:22-alpine`: a build stage installs workspaces and
  compiles with `npm run build`, then `npm ci --omit=dev` for the runtime
  stage, which copies only `dist` + `node_modules` + the browser demo
  (`demos/browser-sdk`).
- **Non-root user** `pezhwan` created in the runtime stage; the process runs as
  that user in `apps/identity-server`.
- **`EXPOSE 4011`** and a **HEALTHCHECK** that fetches
  `/.well-known/jwks.json` every 15 s (timeout 3 s, 10 retries) — reused as the
  compose `healthcheck` and k8s readiness/liveness probe.
