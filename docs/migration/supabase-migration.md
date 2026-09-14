# Migrating from Supabase Auth to PEZHWAN

## 1. Overview

Supabase Auth stores users in `auth.users` with linked `auth.identities`,
`raw_app_meta_data`/`raw_user_meta_data`, email/phone confirmation timestamps,
and optional TOTP MFA (`auth.mfa_factors`). A Supabase project maps to one
Pezhwan tenant; the goTrue JWT (HS256/RS256, `role`, `sub`) maps onto Pezhwan
access tokens, and `auth.identities.provider` maps onto `LinkedIdentity`.
Passwords (bcrypt) and MFA seeds do not transfer — reset/re-enroll applies.

## 2. Before you start

Inventory the project before writing any migration:

- **Users** — count, `id` (UUID), `email`, `phone`, `email_confirmed_at`,
  `phone_confirmed_at`, `banned_until`, `deleted_at`, and `created_at`.
- **Metadata** — `raw_app_meta_data` versus `raw_user_meta_data` split; most
  projects put `{ provider, providers, role }` in app metadata and profile
  fields in user metadata.
- **Identities** — which `auth.identities.provider` values exist
  (`email`, `google`, `github`, `apple`, SAML `sso`, ...) and how many users
  per provider; also record `identity_data`.
- **MFA** — `auth.mfa_factors` counts per factor type (TOTP, phone); the
  `enrolled_at`/`verified_at` columns tell you who must re-enroll.
- **Tokens/token types** — `auth.refresh_tokens`, session cookie usage, and
  any Row Level Security that keys off `auth.uid()` / `(select auth.uid())` —
  you must migrate those policies to Pezhwan's `sub` claim semantics.
- **Auth triggers/edge functions** — Postgres triggers on `auth.users` and
  `supabase.auth` calls that run before/after sign-up.

Bootstrap the destination Pezhwan tenant/application/`ADMIN` role
(`npm run seed`) first.

## 3. Export from Supabase

The service-role key can read the auth schema directly — a deterministic,
order-by-`id` paginated SELECT is the most reliable bulk path:

```sql
-- Streaming-export friendly: order by id so you can resume with WHERE id > last_id
SELECT id, email, phone, email_confirmed_at, phone_confirmed_at,
       banned_until, created_at, raw_app_meta_data, raw_user_meta_data,
       roles, is_sso_user
FROM auth.users
WHERE deleted_at IS NULL
ORDER BY id;
```

Then per user:

```sql
SELECT provider, provider_id, identity_data
FROM  auth.identities
WHERE user_id = :uid
ORDER BY created_at;

SELECT factor_type, status, created_at, updated_at
FROM  auth.mfa_factors
WHERE user_id = :uid;
```

Do **not** attempt to read `auth.users.encrypted_password` — the bcrypt hash is
useless to Pezhwan's Argon2id. If your deployment requires an API-only path,
`supabase-js` `auth.admin.listUsers()` returns the same fields minus the
password column.

## 4. Import into Pezhwan

Take the canonical script from [`migration/README.md`](./README.md) and adapt
the field wiring:

- `users.id` → keep as `User._id` **only** if your application references it
  (e.g. Postgres FKs on `auth.uid()`) — otherwise stash it in
  `metadata.supabaseId`.
- `email` → `User.email`; `email_confirmed_at` presence → `emailVerified`
  (same for phone/`phone_confirmed_at`).
- `banned_until` → `User.isActive = false` when set.
- `raw_user_meta_data` → `User.metadata`; `raw_app_meta_data` → derive roles
  (e.g. `app_metadata.role='admin'` becomes a Pezhwan `Role` +
  `UserRoleAssignment`) and keep the remainder in `metadata` too.
- `identities[].provider` → `LinkedIdentity` (`provider`, `subject`); keep
  `identity_data` for audit.
- No password value exists in the export. Use one of:
  - reset emails via `/v1/verify/password/forgot` for everyone (wave them), or
  - a temporary password, hashed with `hashPassword` (Argon2id), with
    forced change (`PASSWORD_CHANGE_REQUIRED`).
- MFA factors are re-enrolled — do not carry `status='verified'` forward as a
  claim; set `mfaEnabled` only after the user completes Pezhwan setup.

## 5. Mapping

| Supabase concept                                       | Pezhwan concept                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| Project                                                | `Tenant` (`slug`).                                                         |
| `auth.users.id` (UUID)                                 | `User._id` (if downstream refs) or `metadata.supabaseId`.                  |
| `email` / `phone`                                      | `User.email` / `User.phone`.                                               |
| `email_confirmed_at` / `phone_confirmed_at`            | `User.emailVerified` / `phoneVerified`.                                    |
| `banned_until` / `deleted_at`                          | `User.isActive` (false when set).                                          |
| `raw_user_meta_data`                                   | `User.metadata`.                                                           |
| `raw_app_meta_data.role` etc.                          | `Role` + `UserRoleAssignment`; rest → `metadata`.                          |
| `identities.provider` (`google`, `github`, `sso`, ...) | `LinkedIdentity` (`provider`, `subject`).                                  |
| goTrue JWT (`sub`, `role`, `app_metadata`)             | Pezhwan RS256 access token (identity-derived claims).                      |
| `auth.refresh_tokens` / session cookie                 | Pezhwan rotating refresh family + per-session revocation.                  |
| `auth.mfa_factors` (TOTP/phone)                        | Re-enroll on Pezhwan (`User.mfaEnabled`).                                  |
| `encrypted_password` (bcrypt)                          | Not transferable — reset/forgot or temporary password.                     |
| RLS `auth.uid()` policies                              | Replace with Pezhwan access-token `sub`/role checks in application policy. |

## 6. Rolling out

Dual-write new sign-ups and profile edits during the overlap, and mirror login
while your API gate accepts both goTrue JWTs and Pezhwan access tokens. Migrate
Postgres RLS: until cutover, keep `auth.uid()` working, then swap to validating
the Pezhwan `sub` claim via your edge-function/API middleware. Wave reset
emails so the highest-activity users convert first; monitor forgot/reset
completion before announcing.

## 7. Cutover & decommission

1. Switch token validation/discovery to Pezhwan (`/.well-known/jwks.json`,
   `openid-configuration`); remove goTrue JWT acceptance from the gate.
2. Replace `@supabase/supabase-js` auth + `supabase.auth` hooks with the
   `@pezhwan/react`/`@pezhwan/angular`/`@pezhwan/vue` provider (or direct
   `/v1/auth/*` calls).
3. Update Search for the RLS policy swap and confirm no `auth.uid()` references
   remain in `security policies`.
4. After the monitoring window, disable the Supabase auth methods (JWT header
   verification, `auth.users` write access), archive `auth.users` per retention,
   and rotate/revoke the service-role key.
