# On-Premise Deployment

Run Pezhwan on your own hosts or VMs with the Compose stack from
`infrastructure/docker/`. This is the same stack as
[docker.md](./docker.md) with the operational discipline expected of
self-managed infrastructure.

## Baseline topology

One or more hosts running:

- **MongoDB 7 replica set** — three members (`mongo1`, `mongo2`, `mongo3`) in
  replSet `pezhwan-rs`. Place members on **separate physical hosts** so a
  single server failure does not cost you quorum. `mongo/init.js` assigns
  `mongo1` priority 2 as the preferred primary; if `.gitkeep`-style persistence
  volumes survive, the init script is a no-op on subsequent boots.
- **Redis 7** — a single node is acceptable (Redis is an optimiser, never a
  gate; the system degrades to Mongo-backed counters on Redis loss). For HA
  use the Redis Sentinel config scaffold under `infrastructure/docker/redis/`
  (placeholder — implement `sentinel.conf` before relying on it).
- **identity-server** — one or more replicas behind nginx. All replicas must
  share the signing-key directory (mount one volume across them) and the same
  Redis, so rate-limit budgets and account-state TTLs are shared.

## Reverse proxy and TLS

`infrastructure/docker/nginx/` terminates TLS: mount
`tls.crt`/`tls.key` into `/etc/nginx/certs`, and rename the `proxy_pass`
upstream host if the server is not reachable at `identity-server:4011` (the
Compose service name and port the proxy targets by default). The config
enforces HTTP→HTTPS redirect, HSTS, strict
security headers, and `client_max_body_size 1m`. Obtain certificates from your
own CA or Let's Encrypt and automate renewal (certbot `deploy-hook` to reload
nginx).

## Backups

Backups are the Compose stack's most fragile point on-premise. Run from the
host:

```bash
export PEZHWAN_MONGODB_URI="mongodb://mongo1:27017,mongo2:27017,mongo3:27017/pezhwan?replicaSet=pezhwan-rs"
export PEZHWAN_BACKUP_KEY="$(openssl rand -base64 32)"
npm run drill:backup             # produces backups/pezhwan-<ts>.pzbu (AES-256-GCM)
node scripts/verify-backup.mjs backups/pezhwan-<ts>.pzbu --checksum <hex>
```

- Copy archives off the box (object storage or another site) — a backup on the
  same disks as the database it protects is not a backup.
- Keep `PEZHWAN_BACKUP_KEY` in a secret manager or escrow; losing it makes
  every archive unrecoverable.
- Schedule the quarterly full `drill:backup-restore` (see
  [../disaster-recovery.md](../disaster-recovery.md)).
- The `infrastructure/scripts/*.sh` wrappers (`backup.sh`, `restore.sh`,
  `health-check.sh`, `migrate.sh`, `seed.sh`, `rotate-keys.sh`,
  `generate-secret.sh`) drive the verified `scripts/*.mjs` tools above; call
  them from cron/systemd timers or CI to schedule backups, readiness probes,
  migrations, seeding, and key rotation.

## Monitoring

Use the `infrastructure/docker/monitoring/` composition: add Prometheus
(scrape targets), Grafana (dashboards), and Loki (log shipping) to the Compose
stack. The monitoring configs are placeholders — fill in the identity-server
scrape job and datasource wiring before relying on them; see
[../monitoring.md](../monitoring.md) and [../alerts.md](../alerts.md) for the
metric/alert surface the server exposes.

## Signing-key file storage

Signing keys persist as JSON records in `PEZHWAN_SIGNING_KEYS_PATH` (default
`./keys`) via `FileKeyStoreAdapter` — files named `<kid>.pem` (mode `0600`).
On-premise rules:

- Put the key directory on durable, **encrypted** storage separate from the
  container filesystem; under the prod overlay the root is read-only and the
  path is `/tmp/keys` (a tmpfs), so mount a persistent volume there.
- Back the key directory up together with each database backup — restoring a
  store without its keys leaves previously-issued JWTs unverifiable.
- Rotate keys on a schedule (`KeyStoreService.rotate()`); old keys remain
  valid for outstanding tokens until retired.

## Operational considerations

| Concern                | Guidance                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Time sync**          | Run NTP/chrony on every host and the Mongo container hosts. TOTP depends on clock skew (< 30 s against the OTP period) — unsynced clocks cause intermittent MFA failures.                                                                              |
| **Storage**            | Mongo volumes need predictable IOPS; put `pezhwan_mongo*_data` volumes on backed/raid disks, not tmpfs. Size per `values.yaml`-style expectations (50 GiB prod analogous).                                                                             |
| **Networking**         | Keep `mongo1..3` and Redis on the private/flat network; publish only the nginx 443/80 (and the server's 4011 internally). Mongo port 27017 must not be internet-reachable.                                                                             |
| **Failover**           | If `mongo1` dies, the replSet elects `mongo2`/`mongo3` (election timeout 10 s); the identity server URI lists all three members so the driver follows the new primary.                                                                                 |
| **Restarts**           | Named volumes survive `docker compose down`; only `down -v` destroys data. Rebuild images with `docker compose build` before upgrading.                                                                                                                |
| **Capacity**           | One `identity-server` replica handles modest traffic; add replicas behind nginx and keep them stateless (shared Redis + key volume) — see [../performance-tuning.md](../performance-tuning.md).                                                        |
| **GMPR / OS patching** | Schedule host maintenance for the Mongo quorum: update secondaries first, then step down the primary (`rs.stepDown()`) before patching it — the PDB-style discipline from [kubernetes.md](./kubernetes.md) translates to manual sequencing on-premise. |
