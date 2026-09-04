# Backup / Restore Drill

This document describes the repeatable backup and restore drill used to prove
that the PEZHWAN identity store can be recovered after a disaster, and to
measure the recovery targets (RPO / RTO) that gate production approval.

> Status: **EXECUTED** — `npm run drill:backup-restore` passes end-to-end
> (backup → encrypt → isolate → restore → verify indexes & integrity → verify
> auth → record RPO/RTO/checksums).

---

## Recovery targets

| Metric             | Definition                                                                   | Target       |
| ------------------ | ---------------------------------------------------------------------------- | ------------ |
| **RPO**            | Max acceptable data loss = age of the newest backed-up document at dump time | < 24 hours   |
| **RTO**            | Time to restore a usable identity store + verified auth                      | < 1 hour     |
| **Drill duration** | End-to-end time for the full backup→restore→verify cycle                     | < 15 minutes |

---

## Quick start

```bash
# Generate (or reuse) a 32-byte AES-256-GCM backup key:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
export PEZHWAN_BACKUP_KEY="<base64 32-byte key>"

# Run the FULL drill (seeds a demo DB, backs it up, restores into an isolated
# environment, verifies indexes + data + auth, and prints RPO/RTO/checksums):
npm run drill:backup-restore

# Individual phases:
npm run drill:backup      # backup --seed
npm run drill:restore     # restore --verify-auth (reads backups/latest.pzbu)
```

**Never** commit backup archives or the backup key. Archives are git-ignored
(`backups/`). For a dry-run without encrypting the archive set
`PEZHWAN_BACKUP_KEY_SKIP=1` (development only).

---

## Drill phases

### 1. Backup (`scripts/backup-drill.mjs`)

- Connects to the source database (`PEZHWAN_MONGODB_URI` / `--source`, or an
  in-memory seeded database with `--seed`). The `--seed` flag writes a realistic
  identity dataset (users, sessions, audit entries) **with the schema indexes**
  so the drill proves indexes survive, not just documents.
- Dumps every collection + index manifest. Two strategies:
  - **logical** (default, no external tools): driver-based JSON export.
  - **binary** (`--strategy binary`): uses `mongodump`/`mongorestore` when the
    official DB tools are installed.
- Compresses (gzip) and encrypts (AES-256-GCM) the archive; records the SHA-256
  checksum, byte size, file count and timestamp.
- **RPO** is computed as the age of the newest backed-up identity document at
  dump time.

Output: `backups/pezhwan-<timestamp>.pzbu` plus a stable `backups/latest.pzbu`
for the combined drill.

### 2. Restore (`scripts/restore-drill.mjs`)

- Unpacks and decrypts the archive, verifying the AES-GCM auth tag (a wrong key
  or any tampering fails closed with "unable to authenticate data").
- Boots an **isolated** MongoDB replica set in-memory and restores into it.
- **Validates indexes**: every index recorded in the backup manifest must be
  present after restore (`missingIndexes` must be empty).
- **Validates data integrity**: the seeded user/session must round-trip with
  its metadata intact.
- **RTO** is the measured restore duration.
- **Post-restore auth verification** (`--verify-auth`): boots the actual Pezhwan
  runtime against the restored store and proves `session create → refresh →
reuse-rejected` all succeed — i.e. the recovered store is functionally usable.

---

## Sample executed report

```
[backup] {
  "phase": "backup", "ok": true,
  "archive": "backups/pezhwan-....pzbu",
  "archiveChecksum": "11f88748...",
  "encrypted": true, "strategy": "logical",
  "collectionsBackedUp": 3, "documentsBackedUp": 3,
  "rpoSeconds": 0, "createdAt": "2026-..."
}
[restore] {
  "phase": "restore", "ok": true,
  "archive": "backups/latest.pzbu",
  "restoredCollections": ["users","sessions","auditlogs"],
  "documentsRestored": 3, "indexesRestored": 4, "missingIndexes": [],
  "integrity": { "userRestored": true, "sessionRestored": true, ... },
  "authVerification": { "sessionCreated": true, "refreshRotated": true,
                        "reuseRejected": true, "authOk": true },
  "rtoSeconds": 1
}
```

The backup and restore checksums match, proving archive integrity.

---

## Failed-restore remediation

If any verification step fails (missing index, data-integrity mismatch, auth
failure), treat the restore as **failed** and do **not** point production at the
restored store. Remediation procedure:

1. Capture and preserve the full drill report for post-mortem.
2. Confirm the archive checksum matches the one recorded at backup time; a
   mismatch means the archive is corrupt/tampered — obtain a different backup.
3. If indexes are missing, rebuild them from `infrastructure/docker/mongo/init.js` /
   the model definitions before opening the store to traffic.
4. Retry the restore into a fresh isolated environment and re-run `--verify-auth`.
5. If sign-in key material was separately backed up, restore it into the
   identity server's key store **before** serving token-verifying traffic so
   already-issued JWTs still verify (see `docs/operations/disaster-recovery.md`).
6. Record the outcome in the release record with the RPO/RTO evidence.

---

## Scheduling & evidence

- Run the drill at least **quarterly** and attach the report to the release
  record.
- Keep the encryption key in a secret manager; rotate it per the key-rotation
  policy and keep a copy in escrow so backups remain recoverable.
- Offsite/object-storage archival (S3/GCS/Azure Blob) is supported by the
  storage adapters under `packages/core/src/adapters/storage/`.
