# PEZHWAN Migrations

This directory contains numbered database migrations. Each migration is a
self-contained script that brings the schema **up** to a target state.

## Conventions

- Files are named `NNN-<kebab-case-name>.ts` (`001-initial-schema.ts`).
- Migrations run **in numeric order** via `migration-runner.ts`.
- A migration may export an async `up()` function, or perform its work at
  import time (side-effect). The runner records each applied migration in the
  `_migrations` collection so it runs exactly once.
- Rollback scripts for destructive/irreversible changes live in `rollback/`
  with the `-rollback.ts` suffix and are run manually.

## Usage

```bash
# Export your Mongo URI (optional; defaults to localhost:27017/pezhwan)
export PEZHWAN_MONGODB_URI="mongodb://127.0.0.1:27017/pezhwan"

# Apply pending migrations
node dist/migrations/migration-runner.js up

# Show applied vs pending
node dist/migrations/migration-runner.js status
```

## Special migrations

### 004 — MFA legacy-secret encryption

Upgrades stored MFA TOTP secrets to the current `v2:` AES-256-GCM envelope. It
is **dry-run by default** and supports batching, validation, and rollback. See
`docs/operations/mfa-migration.md` for the full operational guide.

```bash
export PEZHWAN_MFA_ENCRYPTION_KEY="<base64 32-byte AES key>"

# Preview (no writes)
node dist/migrations/004-mfa-secrets-encryption.js

# Apply in batches with round-trip validation
node dist/migrations/004-mfa-secrets-encryption.js --apply --batch-size 5000 --validate

# Restore from backup if something went wrong
node dist/migrations/004-mfa-secrets-encryption.js --rollback
```
