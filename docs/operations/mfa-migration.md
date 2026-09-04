# MFA Legacy-Secret Migration

## Purpose

Upgrade stored MFA TOTP secrets to the current **versioned AES-256-GCM
envelope** (`v2:...`). The migration supports a **migration window** during
which both the current `v2:` format and older formats are readable, then
permanently re-encodes every record without changing the underlying TOTP
secret — so **all existing authenticator/backup codes remain valid**.

## Why

Older deployments may hold MFA secrets in one of two pre-`v2:` forms:

| Format                             | Detection                               | Action                       |
| ---------------------------------- | --------------------------------------- | ---------------------------- |
| `v2:<base64(iv‖tag‖ct)>` (current) | starts with `v2:`                       | skipped (already current)    |
| legacy unprefixed AES-GCM envelope | decrypts under the key, no `v2:` prefix | re-wrapped as `v2:`          |
| legacy **raw base64** TOTP secret  | not an envelope, decodes to ≥20 bytes   | wrapped as `v2:`             |
| anything else                      | neither of the above                    | reported, **never modified** |

The runtime's `MfaService` (`packages/core/src/services/mfa.service.ts`)
accepts both `v2:`-prefixed and legacy unprefixed envelopes throughout the
migration window, so reads never break mid-upgrade.

## Safety model

- **Dry-run by default.** Nothing is written unless `--apply` is passed.
- **Backup before change.** The original secret is copied to
  `mfaSecretsBackup` keyed by `userId` before any write, enabling rollback.
- **Optimistic concurrency.** Each write is `{ _id, mfaSecret: <old> } →
$set` so a concurrent change is never silently overwritten.
- **Never destroys unrecognized data.** `corrupt`/`unmigratable` records are
  skipped and surfaced; they are not deleted or blanked.
- **Post-migration validation.** With `--validate`, each upgraded envelope is
  decrypted and compared byte-for-byte to the source secret, confirming TOTP
  codes stay valid.

## Run

```bash
# 1. Configure
export PEZHWAN_MONGODB_URI="mongodb://.../pezhwan"
export PEZHWAN_MFA_ENCRYPTION_KEY="<base64 32-byte AES key>"

# 2. Preview (default: dry-run — counts + reports only)
node scripts/migrate-mfa-secrets.mjs

# 3. Apply in batches, with validation
node scripts/migrate-mfa-secrets.mjs --apply --batch-size 5000 --validate
```

## Flags

| Flag             | Effect                                                            |
| ---------------- | ----------------------------------------------------------------- |
| _(none)_         | dry-run preview; no writes                                        |
| `--apply`        | actually upgrade records                                          |
| `--dry-run`      | force preview (default)                                           |
| `--validate`     | decrypt each upgraded envelope and verify round-trip              |
| `--batch-size=N` | batch N records per read (default `1000`)                         |
| `--rollback`     | restore every secret from `mfaSecretsBackup` and clear the backup |

## Rollback

If a problem is detected after an `--apply` run:

```bash
node scripts/migrate-mfa-secrets.mjs --rollback
```

This restores each backed-up original secret and empties `mfaSecretsBackup`.
Rollback is idempotent: it only touches records that have a backup row.

## Verification

- Run `npm run test:integration` — the `mfa` integration suite covers setup,
  enable, verify, backup codes, and lockout against the migrated format.
- Spot-check a few users in an authenticator app before/after an `--apply` run.

## Capacity

Batches are streamed with a single Mongo cursor; the operation is re-encryption
only (no external I/O), so it is bounded by disk/CPU and completes well within
an hour for large user sets.
