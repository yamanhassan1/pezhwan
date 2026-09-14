# Migrating from Okta to PEZHWAN

## 1. Overview

Okta is used as an identity provider for workforce (SSO, Active Directory/LDAP
federation, group-based access) and customer identity. Its model: one **org**
per tenant, **users** with a flat `profile` (subject/email/attributes),
**groups**, group policy/rules, and factors (TOTP, SMS, WebAuthn). An Okta org
maps to one Pezhwan tenant; groups map to roles (or role buckets); profile
attributes map to `User.metadata`. Factor seeds and passwords do not transfer.

## 2. Before you start

- **Users** — total, `id`, `login` (email), `status` (`ACTIVE`/`SUSPENDED`/
  `DEPROVISIONED`), `profile` attributes, and `activated`/`lastLogin`.
- **Groups** — group names and membership, plus any group-rule-granted groups.
  Decide whether every Okta group becomes a Pezhwan role or whether you map
  groups → one coarse role per app.
- **Authorization** — how applications interpret group membership today (default
  roles vs. assertion groups for SaaS apps).
- **MFA** — factor enrollment counts (TOTP/SMS/WebAuthn) and the org's
  `okta.verify` policy. TOTP seeds are not exportable.
- **Apps** — Okta OpenID Connect apps: client IDs, redirect URIs, and whether
  app-level groups (`app_groups` claims) are relied upon.
- **Directories** — whether users come via AD/LDAP (then decide if Pezhwan
  should be the identity of record or a federated `LinkedIdentity`).

Bootstrap the destination tenant/application/`ADMIN` role (`npm run seed`).

## 3. Export from Okta

Use the Okta Users/Groups API with an admin API token:

```bash
API=https://<org>.okta.com/api/v1

# Groups and members
curl -s "$API/groups" -H "Authorization: SSWS $TOKEN"
curl -s "$API/groups/$GROUP_ID/users" -H "Authorization: SSWS $TOKEN"

# Users (paged, with profile + status)
curl -s "$API/users?limit=200&filter=status eq \"ACTIVE\"" \
  -H "Authorization: SSWS $TOKEN"
```

`GET /api/v1/users/:id` includes `profile`, `status`, `credentials` (no usable
password), and factor-enrollment metadata; `GET /api/v1/users/:id/factors`
lists factor types (types only — no seeds). For volume, export the DSV/Syslog
report of `user.account.claim` events or use the Okta APIs' cursor iteration.

## 4. Import into Pezhwan

Create the tenant + roles, then users via the admin API or the canonical
import script:

```ts
import mongoose from 'mongoose';
import { createPezhwan, UserModel } from '@pezhwan/core';
import { hashPassword } from '@pezhwan/crypto';

await mongoose.connect(process.env.PEZHWAN_MONGODB_URI!);
const runtime = createPezhwan({
  tenantId: 'acme',
  applicationId: 'app',
  /* ... */ otpDelivery: {},
});
for (const u of exportedUsers) {
  const doc = await UserModel.create({
    tenantId: 'acme',
    email: u.profile.email?.toLowerCase(),
    emailVerified: true,
    isActive: u.status === 'ACTIVE',
    passwordHash: u.temporaryPassword ? await hashPassword(u.temporaryPassword) : null,
    metadata: { source: 'okta', oktaId: u.id, ...u.profile },
  }).catch(() => undefined);
  if (!doc) continue;
  for (const group of u.groups ?? []) {
    await runtime.authorization
      .assignRole({
        userId: String(doc._id),
        tenantId: 'acme',
        applicationId: 'app',
        roleName: group.toUpperCase(),
      })
      .catch(() => undefined);
  }
}
```

Do not import `credentials`/factors; record `mfaEnabled` only after a successful
re-enrollment.

## 5. Mapping

| Okta concept                                    | Pezhwan concept                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- |
| Okta org                                        | `Tenant` (`slug` = org subdomain).                                                 |
| OIDC app (client)                               | `Application` / OAuth client (`clientId`, `redirectUris`).                         |
| `users.id`                                      | `User._id` (or `metadata.oktaId`).                                                 |
| `profile.login` / `profile.email`               | `User.email`.                                                                      |
| `profile.*` attributes                          | `User.metadata`.                                                                   |
| `status` (ACTIVE/SUSPENDED/DEPROVISIONED)       | `User.isActive` (true for ACTIVE).                                                 |
| Groups (incl. group rules / app groups)         | `Role` + `UserRoleAssignment` (`roles[]`).                                         |
| Saml/OIDC group claims (`groups`, `app_groups`) | Role-derived claims in the Pezhwan access token.                                   |
| TOTP/SMS/WebAuthn factors                       | Re-enroll on Pezhwan (`User.mfaEnabled`).                                          |
| AD/LDAP directory                               | Decide: become the source of truth (import) or keep as federated `LinkedIdentity`. |
| Session/SSO cookies, ID tokens                  | Pezhwan access + rotating refresh family.                                          |
| Password hashes                                 | Not transferable — reset/forgot or temporary password.                             |

## 6. Rolling out

Run dual-write for profile changes and new sign-ups; keep Okta readable as the
fallback identity source during the overlap. Reverse-proxy a compatibility
endpoint that verifies Okta ID tokens until **all** callers migrate issuer and
audience to Pezhwan. Wave group→role syncing first, then users, so that by the
time login is switched, roles already exist. Trigger Okta password-reset-in-
Pezhwan for users without temporary credentials.

## 7. Cutover & decommission

1. Flip token verification and discovery to Pezhwan; remove Okta JWT-acceptance
   from your API gate.
2. Decommission Okta Sign-In Widgets / redirect flows; land on Pezhwan SDK
   guards or `/v1/auth/*`.
3. Validate the effective role set per group and spot-check MFA re-enrollment.
4. After the monitoring window, revoke the Okta API token, archive the user
   export, and disable the org or downgrade to read-only. If identity was
   delegated from AD/LDAP, either make the directory the seed for Pezhwan
   provisioning or cut the link deliberately.
