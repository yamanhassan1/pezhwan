# Pezhwan Docker Stack

Containerized development infrastructure for the PEZHWAN identity platform: a
3-node MongoDB 7 replica set (with transactions), Redis 7 for ephemeral state,
and the reference Identity Server — plus prebuilt TLS-reverse-proxy and
observability assets in `nginx/` and `monitoring/`.

## Compose contents

`docker-compose.yml` defines three services:

| Service          | Image       | Ports                | Purpose                                        |
| ---------------- | ----------- | -------------------- | ---------------------------------------------- |
| `mongo1`         | `mongo:7`   | `127.0.0.1:27017`    | Replica-set primary (`pezhwan-rs`)             |
| `mongo2` / `mongo3` | `mongo:7` | —                    | Secondary nodes                                |
| `redis`          | `redis:7-alpine` | `127.0.0.1:6379` | Rate limits, OTP, session cache                |
| `identity-server`| built       | `4011` (host → 4011) | Reference identity server                      |

Details:

- **MongoDB replica set.** All three nodes mount `mongo/mongod.conf`. On first
  boot, `mongo/init.js` (mounted at `/docker-entrypoint-initdb.d/init.js`) runs
  `rs.initiate()` for the `pezhwan-rs` set (with `mongo1` at higher priority),
  then creates the `pezhwan` database, its collections (with JSON-schema
  validation), and indexes (unique `(tenantId, email)` / `(tenantId, phone)`,
  session TTL). Data lives in the `pezhwan_mongo{1,2,3}_data` volumes.
- **Redis.** `redis:7-alpine`, data in `pezhwan_redis_data`.
- **Identity server.** Built from the monorepo root via
  `apps/identity-server/Dockerfile`; starts only after `mongo1` and `redis` are
  healthy. Environment overrides come from the shell env with defaulted values:
  `PEZHWAN_ISSUER`, `PEZHWAN_TENANT_ID=dev-tenant`,
  `PEZHWAN_APPLICATION_ID=dev-app`, `PEZHWAN_MONGODB_URI` (replica-set URI
  across all three nodes), `PEZHWAN_REDIS_URL`, and `PEZHWAN_ALLOWED_ORIGINS`
  (defaults include `http://localhost:4011` and `http://localhost:5173`).

## Health checks

- MongoDB nodes: `mongosh --eval "db.adminCommand('ping').ok"` — checked every
  5s, 20 retries; `identity-server` waits on the replica-set primary via
  `depends_on: condition: service_healthy`.
- Redis: `redis-cli ping`.
- Identity server: image `HEALTHCHECK` (15s interval) fetches
  `/.well-known/jwks.json` on port 4011.

## The Identity Server Dockerfile

`apps/identity-server/Dockerfile` is multi-stage:

1. **build** (`node:22-alpine`) — installs deps with build tools for the native
   `argon2` module, compiles every workspace and the server with `npm run build`,
   then prunes to production dependencies.
2. **runtime** (`node:22-alpine`) — copies only the compiled `dist/` trees plus
   the pruned `node_modules`, runs as the non-root `pezhwan` user, exposes
   `4011`, and starts `node dist/server.js`.

## Other config assets

- `nginx/` — `nginx.conf` is a TLS-terminating reverse proxy: redirects HTTP→HTTPS,
  enforces HSTS and security headers (CSP, X-Frame-Options, nosniff), and proxies
  to the `identity-server` upstream. Mount a certificate bundle as
  `tls.crt` / `tls.key` under `/etc/nginx/certs` (`ssl/` reserves the directory).
- `monitoring/` — per-component build configs: `prometheus/` (`prometheus.yml`
  scrape config, `alerts.yml`), `grafana/` (`datasources.yml`, prebuilt
  dashboards), and `loki/` (`loki-config.yml`) for log aggregation.
- `mongo/scripts/` — replica-set helper scripts; `mongo/seed.js` seeds data.

## Running the stack

From `infrastructure/docker/`, or with `-f` anywhere:

```bash
docker compose up --build
```

The identity server is then reachable at `http://localhost:4011` (Mongo on
127.0.0.1:27017, Redis on 127.0.0.1:6379). Tear down with `docker compose down`;
add `-v` to drop the named data volumes.

Verify the Compose file is valid from the repository root:

```bash
npm run verify:compose
# → docker compose -f infrastructure/docker/docker-compose.yml config --quiet
```

The `compose-validation` job in `.github/workflows/ci.yml` runs the same check
on every push/PR.

## Overrides

`docker-compose.dev.yml`, `docker-compose.test.yml`, and
`docker-compose.prod.yml` are reserved for the corresponding environment
overrides:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

They are currently empty placeholders and will be fleshed out as the dev,
test, and production flavors of the stack take shape. The monitoring/nginx
assets above are the intended build blocks for the production override.

## Related

- `README.md` at the repo root — quick start with the server on `localhost:4011`
- `infrastructure/kubernetes/` — single-region manifests (MongoDB + Redis + server)
- `infrastructure/terraform/` — cloud provisioning (AWS/Azure/GCP modules)
- `apps/identity-server/README.md` — running, configuring, and seeding the server