# Migrating from a custom / legacy identity store to PEZHWAN

## 1. Overview

Custom stores are the most varied source: relational `users` tables, LDAP
fronted by a bespoke auth service, legacy session cookie systems, or a
hand-rolled JWT scheme. There is no vendor export tool, so the migration is a
mapping exercise against Pezhwan's own data model (`User`, `Tenant`,
`Application`, `Role`, `UserRoleAssignment`), executed through the admin API,
the seed path, or a one-off `@pezhwan/core` script.

## 2. Before you start

Baseline what the legacy system actually models:

- **Subjects** — primary key type, email/phone availability, uniqueness
  invariants, and soft-delete/disable flags.
- **Security material** — password hashing algorithm and iteration cost,
  per-user MFA factor state, and any stored API keys/tokens.
- **Authorization** — roles, groups, permission tables, and how claims reach
  downstream services (JWT claims, headers, DB grants).
- **Sessions** — token/session-store TTLs, revocation semantics, and which
  clients hold long-lived tokens.
- **Dependents** — every consumer of the legacy identity (proxies verifying
  signatures, services reading `req.user`, cron jobs), because each is a cutover
  seam.

Also decide the destination topology: how many Pezhwan **tenants** and
**applications** you need (one tenant per legacy database, one application per
legacy product/audience), then bootstrap the existence of those tenants,
applications, and the `ADMIN` role via `npm run seed` / `ensureBootstrap`.

## 3. Export from the legacy system

Shape the export as records Pezhwan can ingest directly:

| Column to produce                            | Notes                                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `sourceId`                                   | Legacy primary key; keep for reference and rollback joins.                                               |
| `email`, `phone`                             | Verify uniqueness semantics now — Pezhwan enforces `(tenantId, email)` / `(tenantId, phone)` uniqueness. |
| `emailVerified`, `phoneVerified`, `isActive` | Derive from legacy `verified_at`, `status`, `disabled`, `deleted_at`.                                    |
| `roles[]`                                    | Flatten group→role assignments; record any permission grants you want to reproduce.                      |
| `metadata`                                   | Free-form legacy attributes/claims as a JSON object.                                                     |
| `providerData[]`                             | Federated identities (`{ provider, subject }`).                                                          |
| `mfa`                                        | Factor types + enrollment dates (type only — never the seed).                                            |
| `passwordHash`                               | Reference the algorithm + salt **for documentation**; do not import the value.                           |

Emit idempotent batches (e.g. `WHERE id > $lastId ORDER BY id`) so the import
can resume after failures.

## 4. Import into Pezhwan

### Option A — admin API (interactive / few hundred users)

Create tenants, then applications, roles, and users through
`/v1/admin/tenants`, `/v1/admin/roles`, `/v1/admin/users`, and
`/v1/admin/roles/assign` exactly as shown in the other guides (auth0, cognito)
— same Bearer + `ADMIN` contract.

### Option B — one-off script (volume / bulk)

```ts
import mongoose from 'mongoose';
import { createPezhwan, UserModel } from '@pezhwan/core';
import { hashPassword } from '@pezhwan/crypto';

await mongoose.connect(process.env.PEZHWAN_MONGODB_URI!);
const runtime = createPezhwan({
  tenantId: 'acme',
  applicationId: 'web',
  /* ... */ otpDelivery: {},
});

for (const rec of exportedRecords) {
  const doc = await UserModel.create({
    tenantId: 'acme',
    email: rec.email?.toLowerCase(),
    phone: rec.phone,
    emailVerified: rec.emailVerified,
    phoneVerified: rec.phoneVerified,
    isActive: rec.isActive !== false,
    passwordHash: rec.temporaryPassword ? await hashPassword(rec.temporaryPassword) : null,
    metadata: { source: 'legacy', legacyId: rec.sourceId, ...(rec.metadata ?? {}) },
  }).catch(() => undefined); // resume-safe
  if (!doc) continue;
  for (const roleName of rec.roles ?? []) {
    await runtime.authorization
      .assignRole({
        userId: String(doc._id),
        tenantId: 'acme',
        applicationId: 'web',
        roleName: roleName.toUpperCase(),
      })
      .catch(() => undefined);
  }
}
await mongoose.disconnect();
```

Import in waves by cohort (email-verified-first). **Never** attempt to carry a
legacy password/bcrypt hash into `passwordHash` — Pezhwan only stores Argon2id.

## 5. Mapping

| Legacy concept                        | Pezhwan concept                                                            |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Database / auth service instance      | `Tenant` (`slug`, `name`).                                                 |
| Product / audience scope              | `Application` (`clientId`, platform, `redirectUris`).                      |
| Primary key (`sourceId`)              | `User._id` only if downstream refs demand it, else `metadata.legacyId`.    |
| `email` / `phone`                     | `User.email` / `User.phone` (unique per tenant).                           |
| `verified_at` / `status` / `disabled` | `emailVerified`, `isActive`.                                               |
| Roles / groups / permissions          | `Role` (+ `permissionIds`) and `UserRoleAssignment`; surface as `roles[]`. |
| Custom claims / attributes            | `User.metadata`.                                                           |
| Federation / SSO links                | `LinkedIdentity` (`provider`, `subject`).                                  |
| MFA factor enrollment                 | Re-enroll on Pezhwan (`User.mfaEnabled`) — seeds never transfer.           |
| Legacy token/session TTLs             | Pezhwan access (15m) + rotating refresh family; normalize, don't preserve. |
| Password hash (any scheme)            | Discarded; Argon2id via reset flow or `hashPassword` temporary.            |

## 6. Rolling out

Dual-write while the legacy store stays authoritative; read Pezhwan first and
fall back to legacy for un-migrated accounts, importing on first login
("lazy migration"). Keep a per-record `legacyId → pezhwan _id` lookup table for
rollback and joins. Run the backstop suites (`npm run test:root`,
`test:security`, `test:integration`) after wiring the runtime, and exercise
forgot/reset with real mail in staging before cutover. Announce access-token
issuer/audience changes to every dependent service **before** flipping the
gate.

## 7. Cutover & decommission

1. Flip the API gate to Pezhwan-only token verification; remove legacy JWT
   acceptance and header injection.
2. Migrate consumers that inject identity from the legacy request context
   (proxies, `req.user` setters, cron jobs) to Pezhwan sessions/tokens.
3. Reconcile counts: users, verified addresses, active sessions, roles; sample
   the MFA re-enrollment rate.
4. After the monitoring window, disable legacy sign-in, revoke long-lived
   tokens (bump `tokenVersion` where they overlap), archive the export and the
   `legacyId` mapping for audit, then decommission the legacy stack.

A custom migration maps best when you treat it **as a data model port** — the
provider you are leaving matters less than matching Pezhwan's tenant/user/role
invariants faithfully, because those invariants are what the runtime enforces
from day one.
