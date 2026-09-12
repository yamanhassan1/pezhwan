# Migrating to PEZHWAN

This directory contains migration guides for moving an existing identity
population **into** Pezhwan — users, roles, custom claims, MFA state, and the
applications that depend on them.

## How migrations work in this repository

Two distinct mechanisms exist; do not confuse them:

- **Database schema migrations** live in `migrations/` and evolve Pezhwan's own
  schema. See [`migrations/README.md`](../../migrations/README.md).
- **Data migration guides** (this directory) describe moving people and
  authorization state **from another identity provider** into Pezhwan via the
  admin API, the seed path, or a one-off script.

### The migration runner

`migrations/migration-runner.ts` applies schema migrations in numeric order:

- Files are named `NNN-<kebab-case-name>.ts` (e.g. `001-initial-schema.ts`).
- Run pending migrations with `node dist/migrations/migration-runner.js up`;
  inspect state with `... status`. Each applied file is recorded in the
  `_migrations` collection and runs exactly once. A migration may export an
  async `up()` or perform its work at import time.
- Destructive/irreversible change scripts live in `migrations/rollback/` with a
  `-rollback.ts` suffix and are run manually.
- Set `PEZHWAN_MONGODB_URI` to point the runner at the target database.

### The MFA secrets migration

`migrations/004-mfa-secrets-encryption.ts` (driven by
`scripts/migrate-mfa-secrets.mjs`) upgrades legacy MFA TOTP envelopes to the
current `v2:` AES-256-GCM format. It is **dry-run by default** and supports
`--apply`, `--batch-size N`, `--validate`, and `--rollback`:

```bash
export PEZHWAN_MFA_ENCRYPTION_KEY="<base64 32-byte AES key>"
node scripts/migrate-mfa-secrets.mjs --apply --batch-size 5000 --validate
```

See [`docs/operations/mfa-migration.md`](../operations/mfa-migration.md) for
the full operational guide (safety model, flags, verification).

## Provider-specific guides

Each guide follows the same structure — (1) overview, (2) before you start,
(3) exporting from the provider, (4) importing into Pezhwan, (5) concept
mapping, (6) phased rollout, (7) cutover and decommission:

| Guide | Typical source |
| --- | --- |
| [`auth0-migration.md`](./auth0-migration.md) | Auth0 tenants, users, RBAC roles, MFA. |
| [`firebase-migration.md`](./firebase-migration.md) | Firebase Authentication (`auth.users`), custom claims. |
| [`keycloak-migration.md`](./keycloak-migration.md) | Keycloak realms, clients, composite roles, user federation. |
| [`okta-migration.md`](./okta-migration.md) | Okta orgs, groups, profile attributes, MFA factors. |
| [`cognito-migration.md`](./cognito-migration.md) | AWS Cognito user pools, app clients, groups, custom attributes. |
| [`supabase-migration.md`](./supabase-migration.md) | Supabase Auth (`auth.users`, identities, user/raw metadata). |
| [`custom-migration.md`](./custom-migration.md) | Any legacy or in-house identity store. |

## Common thread

Regardless of provider, the import surface into Pezhwan is the same:

- **Admin API** — `POST /v1/admin/users` (email/phone + `roles` + `metadata`),
  `POST /v1/admin/roles`, `POST /v1/admin/roles/assign`, plus tenant and
  application provisioning. All gated by a Bearer token with the `ADMIN` role.
- **Seed path** — `npm run seed`/`ensureBootstrap` to provision the bootstrap
  tenant, application, `ADMIN` role, and admin user before the import begins.
- **One-off scripts** — a Node script using `@pezhwan/core` models and
  `hashPassword`/`runtime.authorization.assignRole` for volume imports.

Passwords are **never transferred** between providers (hashing schemes such as
BCrypt/PBKDF2 ≠ Pezhwan's Argon2id). Plan for a password-reset/forgot flow or a
temporary-password step as part of cutover. MFA secrets are also not
transferred — users re-enroll TOTP after the move.