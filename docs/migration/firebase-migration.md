# Migrating from Firebase Authentication to PEZHWAN

## 1. Overview

Firebase Authentication manages users in a per-project `auth.users` table:
anonymous/email/phone users plus federated identities, signed custom claims,
and (recently) TOTP/SMS MFA. Firebase projects map cleanly onto one Pezhwan
tenant; federated `providerData` maps onto `LinkedIdentity`. Password hashes
and TOTP factors are **not** exportable, so both need the reset/re-enroll
paths.

## 2. Before you start

Inventory the project:

- **Users** — count and fields in use: `uid`, `email`, `emailVerified`,
  `phoneNumber`, `displayName`, `photoURL`, `disabled`, `providerData`.
- **Claims** — which keys are signed into `customClaims` and what they mean
  (firebase `customClaims` are limited to ~1000 bytes; many projects also use
  `app_metadata`-style fields).
- **MFA state** — how many users enrolled TOTP/SMS factors. Factor secrets are
  not read back through the SDK; those users re-enroll.
- **Tokens** — where `firebase-admin` ID tokens / session cookies are verified
  and which `claims` are consumed server-side.
- **Identities** — which federated providers (Google, Apple, GitHub, Microsoft)
  your users came through, and whether you need them as `LinkedIdentity`.

Bootstrap the destination Pezhwan tenant/application/`ADMIN` role first
(`npm run seed`).

## 3. Export from Firebase

Use the Firebase Admin SDK (a service-account download, offline, with
`firebase-admin`):

```ts
import admin from 'firebase-admin';
const app = admin.initializeApp({ credential: admin.credential.applicationDefault() });
const list = await app.auth().listUsers(1000);
const users = list.users.map((u) => {
  const c = app.auth().getUser(u.uid) /* or u.customClaims */;
  return {
    uid: u.uid, email: u.email, emailVerified: u.emailVerified,
    phoneNumber: u.phoneNumber, disabled: u.disabled,
    providerData: u.providerData.map((p) => ({ provider: p.providerId, subject: p.uid })),
    claims: u.customClaims ?? {},
  };
});
```

For volume/deterministic exports, dump `auth.users` via the `identity-platform`
export or the Node `listUsers` pager (`userRecord.toJSON()` is a handy flat
form). Keep the mapping key (`uid`) — it anchors the import.

## 4. Import into Pezhwan

Adapt the canonical script from [`migration/README.md`](./README.md). Key
differences:

- Set `User._id`-agnostic: preserve the `uid` in `metadata.originalId` and in
  `LinkedIdentity` when it was a federated login, or actually write the user
  with your own `_id` equal to the `uid` to keep downstream references stable.
- Convert `disabled` to `User.isActive = !disabled` and
  `emailVerified` → `emailVerified`.
- Map `customClaims` (e.g. `{ role: 'admin', plan: 'pro' }`) into
  `User.metadata`, and drive RBAC exclusively from Pezhwan `Role` +
  `UserRoleAssignment` — do not re-implement claim-authorization in app code.
- No password value exists; either send a forgot/reset email to every user at
  cutover or set a temporary password (hashed with `hashPassword`, Argon2id)
  and force a change (`PASSWORD_CHANGE_REQUIRED`).

## 5. Mapping

| Firebase concept | Pezhwan concept |
| --- | --- |
| `uid` | `User._id` (or `metadata.originalId`). |
| `email` / `phoneNumber` | `User.email` / `User.phone`. |
| `emailVerified` | `User.emailVerified`. |
| `disabled` | `User.isActive` (inverted). |
| `customClaims` | `User.metadata` + RBAC roles (prefer roles over claims). |
| `providerData` (Google, Apple, ...) | `LinkedIdentity` (`provider`, `subject`). |
| Firebase project | `Tenant` (`slug`). |
| ID token / session cookie | Pezhwan RS256 access token + rotating refresh family. |
| Password hash (scrypt/BCrypt) | Not transferable — reset/forgot or temporary password. |
| TOTP/SMS MFA factors | Re-enroll on Pezhwan (`User.mfaEnabled`). |

## 6. Rolling out

During the overlap, accept both Firebase ID tokens and Pezhwan access tokens in
your API gate, and route login through whichever backend owns the account.
Dual-write profile changes; lazily migrate any user who logs in through the old
path. Because passwords do not transfer, schedule reset emails in waves to
avoid a support spike at cutover.

## 7. Cutover & decommission

1. Switch token verification and `issuer` to Pezhwan discovery/JWKS.
2. Replace the Firebase web SDK bootstrap with the
   `@pezhwan/react`/`@pezhwan/angular`/`@pezhwan/vue` provider (or call
   `/v1/auth/*` directly).
3. Validate that every user who signed in during the window reports the same
   identity and roles; re-assert MFA enrollment rates.
4. Once the window passes, disable Firebase sign-in method(s), rotate/delete
   the service account, and archive the `auth.users` export per retention.