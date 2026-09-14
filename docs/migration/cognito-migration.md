# Migrating from AWS Cognito to PEZHWAN

## 1. Overview

Amazon Cognito User Pools power app sign-up/sign-in, social/enterprise IdPs,
groups, custom attributes, and (SMS/TOTP) MFA. A user pool maps to one Pezhwan
tenant; each Cognito **app client** (with its OAuth scopes, redirect URIs, and
client secrets) maps to a Pezhwan `Application`/OAuth client. Cognito **groups**
map to Pezhwan roles; custom attributes map to `User.metadata` + RBAC. Passwords
and MFA seeds are not exportable — both require reset/re-enroll paths.

## 2. Before you start

- **Users** — count, `Username` (UUID), email/phone (which attributes are
  `required` and `mutable`), `UserStatus` (`CONFIRMED`, `FORCE_CHANGE_PASSWORD`),
  `Enabled`, and `UserCreateDate`/`LastModifiedDate`.
- **Groups** — group names + membership (`admin-list-groups-for-user`), and
  whether `cognito:groups` claims drive your API authorization.
- **App clients** — client IDs, redirect URIs, allowed OAuth scopes/flows,
  and confidential client secrets.
- **Custom attributes** — the `custom:*` schema (e.g. `custom:role`,
  `custom:plan`) and their use.
- **MFA** — pool MFA configuration and per-user factor state. TOTP device
  secrets and SMS factor seeds are not readable.
- **IdP federation** — whether users sign in through Google/Apple/SAML/Enterprise
  (federated identities are not really "in" the pool).

Bootstrap the destination Pezhwan tenant/application/`ADMIN` role
(`npm run seed`) before importing.

## 3. Export from Cognito

Cognito has no offline bulk export of hashes, but the CSV/JSON user export, the
Admin API, or the S3 "ExportUsers" data flow give you profile data:

```bash
aws cognito-idp list-users \
  --user-pool-id <pool-id> \
  --query "sort_by(Users,&Username)[]" \
  --max-results 60 > users.json

# Groups per user type
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id <pool-id> --username <u> \
  --query "Groups[].GroupName"
```

Emit one record per user with `Username`, `Attributes[]`
(`email`, `email_verified`, `phone_number`, `custom:*`), `UserStatus`,
`Enabled`, and a resolved `Groups[]`. Also dump the app-client list
(`aws cognito-idp list-user-pool-clients`) and registered **WebAuthn/TOTP
status** (`admin-get-device` / MFA settings) — types only.

## 4. Import into Pezhwan

Create tenants/applications from the pool + app clients, roles from groups,
then users. Adapt the canonical script from
[`migration/README.md`](./README.md):

- `Username` → `User._id` (Cognito usernames are stable UUIDs; keep them as the
  `_id` if downstream references exist, otherwise `metadata.cognitoUsername`).
- `email`, `email_verified`, `phone_number` → `User.email`, `emailVerified`,
  `phone`.
- `Enabled` → `User.isActive`; `UserStatus='FORCE_CHANGE_PASSWORD'` → import
  with `passwordHash = null` and let a reset flow provision one.
- `custom:*` attributes → `User.metadata` under their short names
  (e.g. `metadata['custom:role']`), and to `Role` + `UserRoleAssignment` where
  they behave as roles (e.g. `custom:role=admin` → Pezhwan `ADMIN`).
- No password value is exportable; every user resets via
  `/v1/verify/password/forgot` or receives a temporary password.

Per-user import via the admin API:

```bash
curl -s http://localhost:4011/v1/admin/users \
  -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","emailVerified":true,"roles":["admin"],"metadata":{"cognitoUsername":"<uuid>","custom:plan":"pro"}}'

curl -s -X POST http://localhost:4011/v1/admin/roles/assign \
  -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"userId":"<pezhwanUserId>","roleName":"admin"}'
```

## 5. Mapping

| Cognito concept                    | Pezhwan concept                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| User pool                          | `Tenant` (`slug`).                                                                       |
| App client                         | `Application` / OAuth client (`redirectUris`, public/confidential).                      |
| `Username` (UUID)                  | `User._id` (or `metadata.cognitoUsername`).                                              |
| `email` / `phone_number`           | `User.email` / `User.phone`.                                                             |
| `email_verified` / `Enabled`       | `User.emailVerified` / `User.isActive`.                                                  |
| `UserStatus` FORCE_CHANGE_PASSWORD | Import without a password; require reset.                                                |
| `custom:*` attributes              | `User.metadata` (+ role derivation for `custom:role`-style keys).                        |
| Groups                             | `Role` + `UserRoleAssignment` (`roles[]`); `cognito:groups` claim → Pezhwan role claims. |
| HttpOnly/refresh cookie sessions   | Pezhwan access + rotating refresh family.                                                |
| TOTP/SMS MFA factors               | Re-enroll (`User.mfaEnabled`); seeds not transferable.                                   |
| Password hashes                    | Not transferable — reset/forgot or temporary password.                                   |
| Social/IdP federation              | `LinkedIdentity` (`provider`, `subject`).                                                |

## 6. Rolling out

Dual-write sign-ups and profile edits to Cognito and Pezhwan; keep an
`aws cognito-idp admin-get-user` fallback for lookups during the overlap. Gate
logins on whichever side owns the account, then re-hydrate Pezhwan on first
contact ("migration on login"). Wire group→role sync before pushing logins.
Because passwords do not transfer, stagger reset emails to your most-active
users first and monitor forgot/reset completion against support tickets before
announcing full cutover.

## 7. Cutover & decommission

1. Point OAuth/OIDC discovery and client `issuer`/audience at Pezhwan
   (`/.well-known/openid-configuration`), and verify JWKS changes mid-stream.
2. Remove the Cognito Hosted UI / Amplify auth bootstrap; use the SDK providers
   or `/v1/auth/*` directly.
3. Re-assert group→role coverage and MFA re-enrollment for high-risk users.
4. After the monitoring window, disable the user pool's app clients, remove AWS
   IAM access for maintenance scripts, and archive the exported user data per
   retention (remember: pool settings are not recoverable after deletion).
