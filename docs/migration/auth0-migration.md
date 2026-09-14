# Migrating from Auth0 to PEZHWAN

## 1. Overview

Auth0 typically fronts web/mobile applications with hosted login, social and
enterprise connections, RBAC, and Guardian-based MFA. Its data model is user
accounts (`user_id`, `email`, `app_metadata`, `user_metadata`) plus a separate
role/permission model, owned by a single Auth0 tenant (equivalent to one
Pezhwan tenant). This guide moves that population into Pezhwan.

## 2. Before you start

Take stock of what you actually run:

- **Users** — total count and which fields are populated: `email`,
  `phone_number`, `email_verified`, `app_metadata`, `user_metadata`.
- **Roles and claims** — your Auth0 RBAC role set and whether authorization
  decisions read `app_metadata` permissions directly.
- **MFA state** — how many users have Guardian factors enrolled. TOTP seeds
  **cannot** be exported; those users re-enroll in Pezhwan.
- **Tokens** — which clients rely on Auth0-issued JWTs (and their `audience`),
  and which refresh-token/session contracts you must replace.
- **Password state** — Auth0 password hashes are not readable; every user takes
  a reset/forgot path (or a temporary password) after cutover.

Record the Pezhwan bootstrap target: `npm run seed` (or `ensureBootstrap`) to
create the destination tenant, application, and `ADMIN` role before importing.

## 3. Export from Auth0

Use the Management API v2 (a read-only M2M token with `read:users`,
`read:roles` scopes):

```bash
# Users (paginated, with totals)
curl -s "https://<tenant>.auth0.com/api/v2/users?per_page=100&include_totals=true" \
  -H "Authorization: Bearer $MGMT_TOKEN" > users.json

# Roles and each role's members
curl -s "https://<tenant>.auth0.com/api/v2/roles" -H "Authorization: Bearer $MGMT_TOKEN"
curl -s "https://<tenant>.auth0.com/api/v2/roles/$ROLE_ID/users" \
  -H "Authorization: Bearer $MGMT_TOKEN"
```

Alternatively queue the built-in **Export users** job to a CSV/JSON file.
Capture `user_id`, `email`, `email_verified`, `phone_number`,
`app_metadata`, `user_metadata`, and the per-role membership. Also list your
Auth0 applications/clients — they map onto Pezhwan `Application` records.

## 4. Import into Pezhwan

### Option A — admin API (interactive / low volume)

Provision the bootstrap tenant + `ADMIN` user (`npm run seed`), obtain an admin
Bearer token, then create each user and assign roles:

```bash
curl -s http://localhost:4011/v1/admin/users \
  -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","emailVerified":true,"roles":["admin"],"metadata":{"source":"auth0","originalId":"auth0|123"}}'

curl -s -X POST http://localhost:4011/v1/admin/roles/assign \
  -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"userId":"<pezhwanUserId>","roleName":"admin"}'
```

### Option B — import script (volume)

```ts
import mongoose from 'mongoose';
import { createPezhwan, UserModel } from '@pezhwan/core';
import { hashPassword } from '@pezhwan/crypto';

await mongoose.connect(process.env.PEZHWAN_MONGODB_URI!);
const runtime = createPezhwan({
  tenantId: 'acme-prod',
  applicationId: 'web',
  issuer: 'https://id.example.com',
  audience: 'pezhwan.clients',
  otpDelivery: {},
});
for (const u of exportedUsers) {
  const passwordHash = u.temporaryPassword ? await hashPassword(u.temporaryPassword) : null;
  const doc = await UserModel.create({
    tenantId: 'acme-prod',
    email: u.email,
    emailVerified: u.emailVerified,
    passwordHash,
    metadata: { source: 'auth0', originalId: u.user_id, ...u.app_metadata, ...u.user_metadata },
  }).catch(() => undefined); // skip duplicates
  if (!doc) continue;
  for (const role of u.roles ?? []) {
    await runtime.authorization
      .assignRole({
        userId: String(doc._id),
        tenantId: 'acme-prod',
        applicationId: 'web',
        roleName: role.toLowerCase(),
      })
      .catch(() => undefined);
  }
}
await mongoose.disconnect();
```

## 5. Mapping

| Auth0 concept                    | Pezhwan concept                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `user_id` (e.g. `auth0           | abc`)                                                                                             | `User._id`; keep the original in `metadata.originalId`. |
| `email` / `phone_number`         | `User.email` / `User.phone` (unique per tenant).                                                  |
| `email_verified`                 | `User.emailVerified`.                                                                             |
| `app_metadata` + `user_metadata` | `User.metadata` (free-form claims).                                                               |
| RBAC roles                       | `Role` (tenant+application scoped) + `UserRoleAssignment`; surfaced as `roles[]` on the identity. |
| Auth0 tenant / connection        | Pezhwan `Tenant` (`slug`); social/enterprise providers become `LinkedIdentity`.                   |
| Guardian MFA                     | `User.mfaEnabled` after re-enrollment; factor secrets cannot transfer.                            |
| Auth0 application/client         | `Application` (`clientId`).                                                                       |
| Auth0 access/refresh JWTs        | Pezhwan RS256 access token (15m) + rotating refresh family.                                       |
| Password hash (BCrypt-family)    | Not transferable — users reset via `/v1/verify/password/forgot` or temporary password.            |

## 6. Rolling out

Run a **dual-write** period: new registrations and profile changes are written
to both Auth0 and Pezhwan; read auth state from the migrated Pezhwan records.
On login, if the user is not yet in Pezhwan, fall back to verifying against
Auth0 and lazily importing the account (mirroring "migration on login"). Keep
the Auth0 tenant read-only for anything Pezhwan now owns. Trigger password
resets for users imported without a temporary credential before announcing
cutover.

## 7. Cutover & decommission

1. Point your clients' `issuer`/`audience` and token verification at Pezhwan's
   `/.well-known/jwks.json` / `openid-configuration`.
2. Swap hosted-login redirects (Auth0 Universal Login) for the Pezhwan login
   routes or SDK guards.
3. Verify counts: users, roles, admin logins, and a sample of MFA re-enrollments.
4. Keep Auth0 in read-only for a monitoring window (a week is typical), then
   disable the Auth0 connection, revoke its M2M tokens, and export an archive
   for compliance.
