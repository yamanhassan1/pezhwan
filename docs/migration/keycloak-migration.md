# Migrating from Keycloak to PEZHWAN

## 1. Overview

Keycloak organises identity around **realms** (self-contained groups of users,
clients, roles, and identity providers). A Keycloak realm equates to one
Pezhwan **tenant**; a Keycloak **client** with its scopes/redirect URIs equates
to one Pezhwan **Application** (or OAuth client). Keycloak's composite-realm/-
client roles map onto Pezhwan roles, and user attribute claims map onto
`User.metadata`. Password hashes and OTP factors cannot transfer.

## 2. Before you start

- **Users** — count, `username`/`email`/`phoneNumber`, `emailVerified`,
  `enabled`, and required actions (e.g. `UPDATE_PASSWORD`,
  `CONFIGURE_TOTP`) you rely on.
- **Roles & groups** — realm roles, client roles, composites, and group
  membership; note that composite roles add a level of indirection you must
  flatten.
- **Clients** — client IDs, redirect URIs, protocol (`openid-connect` mostly),
  client authentication type, and service accounts.
- **Claims** — which mapper-generated claims (`sub`, `realm_access`,
  `resource_access`, custom attribute mappers) your applications read.
- **Federation** — LDAP/identity-provider links if any.
- **MFA** — OTP policies and enrolled factors (secrets not exportable).

Bootstrap the destination Pezhwan tenant, application, and `ADMIN` role
(`npm run seed`) before importing.

## 3. Export from Keycloak

Keycloak exposes a full Admin REST API. Use a service account with
`realm-management` roles:

```bash
BASE=https://kc.example.com/admin/realms/<realm>

# Users (paginated; include custom attributes + role mappings)
curl -s "$BASE/users?max=100&first=0&briefRepresentation=false" \
  -H "Authorization: Bearer $TOKEN" > users.json

# Realm roles and client roles
curl -s "$BASE/roles" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/clients/$CLIENT_UUID/roles" -H "Authorization: Bearer $TOKEN"

# Effective role list per user (composites included)
curl -s "$BASE/users/$USER_ID/role-mappings/realm/available" \
  -H "Authorization: Bearer $TOKEN"
```

Alternatively run a full **realm export** (`exportKeycloakRealm` /
`bin/kc.sh export --realm <realm>`) and flatten `users[].attributes` and
`users[].realmRoles`/`clientRoles` from the JSON.

## 4. Import into Pezhwan

Provision the tenant + `ADMIN` user (seed path), then for each client register
an application/OAuth client (redirect URIs, confidential flag), create roles
from the flattened realm+client roles, and create users:

```ts
import mongoose from 'mongoose';
import { createPezhwan, UserModel } from '@pezhwan/core';
import { hashPassword } from '@pezhwan/crypto';

await mongoose.connect(process.env.PEZHWAN_MONGODB_URI!);
const runtime = createPezhwan({ tenantId: 'acme', applicationId: 'portal', /* ... */ otpDelivery: {} });
for (const u of exportedUsers) {
  const doc = await UserModel.create({
    tenantId: 'acme', email: u.email?.toLowerCase(), emailVerified: u.emailVerified,
    phone: u.attributes?.phoneNumber?.[0], isActive: u.enabled,
    passwordHash: u.temporaryPassword ? await hashPassword(u.temporaryPassword) : null,
    metadata: { source: 'keycloak', kcId: u.id, ...(u.attributes ?? {}) },
  }).catch(() => undefined);
  if (!doc) continue;
  for (const roleName of flattenRoles(u)) {
    await runtime.authorization.assignRole({
      userId: String(doc._id), tenantId: 'acme', applicationId: 'portal',
      roleName: roleName.toUpperCase(), // Pezhwan stores role names uppercase
    }).catch(() => undefined);
  }
}
```

Composite roles are resolved to effective role names **before** import; Pezhwan
flattens permissions at the role level, so do not re-create the composite
graph.

## 5. Mapping

| Keycloak concept | Pezhwan concept |
| --- | --- |
| Realm | `Tenant` (`slug` = realm name). |
| Client | `Application` / OAuth client (`redirectUris`, confidential flags). |
| `users.id` | `User._id` (or `metadata.kcId`). |
| `username` / `email` / `phoneNumber` | `email` / `phone` (Pezhwan uses unique email/phone per tenant; map `username` to `metadata.username` if required). |
| `emailVerified` / `enabled` | `User.emailVerified` / `User.isActive`. |
| Realm roles, client roles, composites | Flattened `Role` + `UserRoleAssignment` (`roles[]`). |
| User attributes / claim mappers | `User.metadata`; token claims are derived by Pezhwan, not mapped. |
| LDAP / IdP federation | `LinkedIdentity` (`provider`, `subject`). |
| OTP (TOTP) factors | Re-enroll (`User.mfaEnabled`). |
| Password hashes (PBKDF2/BCrypt) | Not transferable — reset/forgot or temporary password. |
| Session/SSO cookies | Pezhwan access + rotating refresh family, per session. |

## 6. Rolling out

Dual-write new sign-ups to both systems. During the overlap, your gateway
accepts either issuer's JWTs (Keycloak realm signing keys until cutover, then
Pezhwan's). Migrate users in batches by reporting on login-in-window coverage;
re-sync role changes until the gate flips. Users enrolled in OTP must complete
a Pezhwan TOTP setup step before they can use step-up surfaces.

## 7. Cutover & decommission

1. Update OIDC discovery (`/.well-known/openid-configuration`) and client
   `issuer`/audience everywhere to Pezhwan.
2. Remove the Keycloak auth flows from your applications; wire in the express
   middleware or SDKs.
3. Confirm role-permission behaviour on the effective role set; delete stale
   composite expectations from application code.
4. After a monitoring window, disable the realm, archive the realm export, and
   retire the Keycloak host (no shared secrets are readable in either
   direction at that point).