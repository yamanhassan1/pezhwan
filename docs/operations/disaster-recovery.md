# Disaster Recovery

This document is the operating plan for recovering the Pezhwan identity plane
after data loss, region loss, or key-material loss. Read
[backup-restore.md](./backup-restore.md) for the drill mechanics and evidence,
and [multi-region.md](./multi-region.md) for failover semantics.

---

## Recovery targets

| Metric                                                           | Target   | Measured (latest drill) |
| ---------------------------------------------------------------- | -------- | ----------------------- |
| **RPO** — max acceptable data loss (age of newest backed-up doc) | < 24 h   | `rpoSeconds: 0`         |
| **RTO** — restore a usable, verified identity store              | < 1 h    | `rtoSeconds: 1`         |
| **Drill duration** — full backup → restore → verify cycle        | < 15 min | end-to-end              |

Production RPO is the age of the newest archive at dump time; RTO is the
measured restore duration. The executed `npm run drill:backup-restore` reports
zero-second RPO and sub-one-second RTO for a seeded dataset.

## Backup strategy

`scripts/backup-drill.mjs` supports two strategies:

- **logical** (default) — driver-based JSON export with a `_dump.json` manifest
  recording every collection's index definitions, so indexes (not just
  documents) are proven durable.
- **binary** (`--strategy binary`) — official `mongodump`/`mongorestore` when
  the DB tools are installed.

Archives are gzip-compressed, AES-256-GCM encrypted with the base64 32-byte
`PEZHWAN_BACKUP_KEY`, and recorded with SHA-256 checksum, byte size, file count
and timestamp (`backups/pezhwan-<timestamp>.pzbu` + stable `backups/latest.pzbu`);
archives and keys are git-ignored. `scripts/verify-backup.mjs` independently
validates an archive: header, file-list/size match, decryption, optional
`--checksum`, and optional full `--restore` into an in-memory Mongo.

## Restore procedure

Via the drill (`npm run drill:restore` / `scripts/restore-drill.mjs
--verify-auth`, or run the steps directly against production):

1. Provision an isolated replica set and unpack the archive.
2. Restore and confirm `missingIndexes` is empty, data-integrity checks pass,
   and the session `create → refresh → reuse-rejected` round-trip succeeds.
   Failing any check = **failed restore**; remediate per backup-restore.md.
3. If indexes are missing, rebuild from `infrastructure/docker/mongo/init.js`
   / the model definitions before opening traffic.
4. Restore signing-key material into the key store **before** serving
   token-verifying traffic so already-issued JWTs still verify.
5. Repoint load balancer/DNS, then confirm `GET /health/ready` returns 200 and
   `/.well-known/jwks.json` serves keys.

## Region failover

`RegionManager` (`packages/core/src/services/infrastructure/region-manager.ts`)
is the failover coordinator:

- `manager.health()` reports `healthy | degraded | down | unknown` per region
  (never guessed without a configured `RegionProbe`).
- Promote a standby with `await manager.switchPrimary('eu-central-1')`; routing
  falls back to the new primary and `PRIMARY_CHANGED` broadcasts to all regions.
- Session revocation / password / MFA-change events broadcast with idempotency
  keys and a dedupe window, so at-least-once transports apply invalidation once.

For a region-scale disaster: confirm surviving regions are healthy, restore or
repoint that region's MongoDB/Redis (`RegionConfig`), run the drill against it,
then `switchPrimary()`.

## Key recovery

`FileKeyStoreAdapter` (`packages/core/src/services/keyStore.service.ts`)
persists keys as JSON records written atomically to `<kid>.pem` (mode `0600`,
directory `0700`) under `PEZHWAN_SIGNING_KEYS_PATH`. `KeyStoreService.init()`
loads persisted keys or generates + persists on first boot; `rotate()` appends
a key and retires the previous one without invalidating outstanding JWTs.
Ops rules:

- Back up the key directory alongside the database — it is small and critical.
- Restore sign-in keys into the same directory **before** serving verifying
  traffic.
- A present-but-corrupt key file fails closed on load: never delete or
  regenerate blindly; reconcile against the escrow copy first.
- In HA, all pods must share the key store (mounted volume or KMS-backed) so a
  rollout never orphans `kid` lookups.

## Test cadence

- Run `npm run drill:backup-restore` at least **quarterly**; attach the RPO/RTO
  report to the release record.
- Keep `PEZHWAN_BACKUP_KEY` in a secret manager, rotate per the key-rotation
  policy, and hold a copy in escrow so archives remain recoverable.
- Test region failover (`switchPrimary`) in staging before production changes;
  archive offsite (S3/GCS/Azure Blob) via the storage adapters under
  `packages/core/src/adapters/storage/`.
