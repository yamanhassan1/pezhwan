# Calling the PEZHWAN API

This document describes how to consume the Pezhwan HTTP surface directly. The
SDK packages (`@pezhwan/react`, `@pezhwan/angular`, `@pezhwan/vue`, and the
Python/Go/Java/.NET clients) wrap this same contract, so everything here also
applies to them.

## Base URL

The reference identity server serves on `http://localhost:4011` by default
(`PEZHWAN_PORT`). All API routes are prefixed `/v1`; discovery metadata is
served from `/.well-known`.

## Response envelope

Every non-OAuth endpoint returns the same envelope:

```json
{ "success": true, "data": { ... } }
```

On failure:

```json
{
  "success": false,
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "Authentication failed",
    "requestId": "…"
  }
}
```

Fields: `code` is a stable, machine-readable string; `message` is
developer-facing (never a stack trace, never a secret); `requestId` ties the
response to the server log lines (see [`debugging.md`](./debugging.md)).
**OAuth/OIDC endpoints** (`/v1/oauth/*`, `/.well-known/*`) follow the OAuth 2.1
/ OIDC wire format instead of the envelope. Full request/response schemas are in
[`docs/api/OPENAPI.yaml`](../../docs/api/OPENAPI.yaml).

## Authentication

Two credential styles, sent in their own headers:

| Style        | Header                          | Obtained from                                                            | Used by                                                                                                      |
| ------------ | ------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Access token | `Authorization: Bearer <token>` | `POST /v1/auth/login` / `register` / `refresh` (RS256 JWT, ~15 min TTL)  | Interactive callers; refresh the token via `/v1/auth/refresh`.                                               |
| API key      | `X-API-Key: <key>`              | Admin API `POST /v1/admin/api-keys` (single-use `rawKey`, `pzk_…` value) | Service-to-service (`/v1/services/ping`); matched via its SHA-256 hash, only the hash is stored server-side. |

> API keys travel in the `X-API-Key` header, not as `Bearer` tokens. The
> `@pezhwan/express` middleware that enforces them reads `x-api-key`
> specifically (`packages/express/src/apikey.ts`); a key sent as
> `Authorization: Bearer` is treated as an access token and will not
> authenticate an API-key endpoint.

Bearer-scoped conventions:

- `GET /v1/users/me` requires a valid access token.
- `/v1/sessions/*` requires a valid access token.
- `/v1/admin/*` requires a valid access token **and** the `ADMIN` role.
- `/v1/scim`, `/v1/webhooks`, `/v1/teams` require the `ADMIN` role.

## CSRF for state-changing calls

Auth, session, MFA, verification, and admin mutations are protected with a
double-submit CSRF cookie (`pezhwan_csrf`). Obtain the cookie + token once and
echo them back:

```bash
curl -s -c cookies.txt http://localhost:4011/v1/auth/csrf
# {"success":true,"csrfToken":"<token>"}
CSRF="<token>"
```

Then include `-b cookies.txt` and `-H "X-CSRF-Token: $CSRF"` on every
non-GET call. Safe methods (GET/HEAD/OPTIONS) pass unguarded.

## Example: register, login, refresh, list sessions

```bash
BASE=http://localhost:4011
curl -s -c cookies.txt $BASE/v1/auth/csrf > /dev/null
CSRF=$(curl -s -b cookies.txt $BASE/v1/auth/csrf |
       node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).csrfToken))")

# Register → 201 { success, data: { user, accessToken, refreshToken } }
curl -s -b cookies.txt -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"demo@pezhwan.dev","password":"Str0ng!Pass#2026"}' \
  $BASE/v1/auth/register

# Login → tokens, or { mfaRequired: true, userId } when TOTP is enabled
curl -s -b cookies.txt -H 'Content-Type: application/json' -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"demo@pezhwan.dev","password":"Str0ng!Pass#2026"}' \
  $BASE/v1/auth/login

# Refresh → new { accessToken, refreshToken } (old refresh token is consumed)
curl -s -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken>"}' \
  $BASE/v1/auth/refresh

# List sessions for the caller (Bearer required)
curl -s -H "Authorization: Bearer <accessToken>" $BASE/v1/sessions

# Revoke the current session
curl -s -X POST -H "Authorization: Bearer <accessToken>" \
  -H "X-CSRF-Token: $CSRF" -b cookies.txt $BASE/v1/auth/logout
```

## Endpoints overview

| Group        | Endpoints                                                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth         | `POST /v1/auth/register`, `login`, `logout`, `refresh`, `otp/send`, `otp/verify`, `otp/login`, `password/change`, `password/forgot`, `password/reset`, `email/verify`, `GET /v1/auth/csrf`              |
| Sessions     | `GET /v1/sessions`, `POST /v1/sessions/all/revoke`, `POST /v1/sessions/:id/revoke`                                                                                                                      |
| MFA          | `POST /v1/mfa/setup`, `enable`, `verify`, `disable`, `login`                                                                                                                                            |
| Verification | `POST /v1/verify/password/forgot`, `verify/password/reset/confirm`, `verify/email/verify-token`, `verify/magic/send`, `verify/magic/redeem`                                                             |
| OAuth / OIDC | `POST /v1/oauth/authorize`, `POST /v1/oauth/token`, `POST /v1/oauth/clients`, `GET /.well-known/jwks.json`, `GET /.well-known/openid-configuration`                                                     |
| Profile      | `GET /v1/users/me`                                                                                                                                                                                      |
| Admin        | `GET/POST /v1/admin/stats`, `tenants`, `users`, `roles`, `permissions`, `clients`, `sessions`, `audit`, `api-keys`, `webhooks`, `security/*`, `settings`, `subscriptions`, `POST /v1/admin/roles/assign | remove`, `POST /v1/admin/authorization/can` |
| Services     | `GET /v1/services/ping` (API-key gated)                                                                                                                                                                 |
| Health       | `GET /health/live`, `GET /health/ready`                                                                                                                                                                 |

## Pagination and permissions conventions

- List endpoints paginate with `?limit=N&offset=N` (default `limit=50`,
  maximum `500`) and return `total`, `limit`, and `offset` alongside the rows.
- Admin user lists accept `?search=` (email/phone substring) and
  `?tenantId=`; session lists accept `?status=` and `?tenant=`; audit lists
  accept `?eventType=`, `?severity=`, `?userId=`, `?tenantId=`.
- Roles and permissions are tenant+application scoped and **never** inferred
  from the client — an identity's roles come from its verified access token.
- Response rows strip internal fields (`passwordHash`, `mfaSecret`,
  `clientSecretHash`, raw key material); secret values are returned exactly
  once at creation time.

## Common error codes

See [`docs/api/errors.md`](../api/errors.md) and
`packages/shared/src/errors.ts` for the full taxonomy; the most frequent ones
are listed in [`debugging.md`](./debugging.md#common-error-codes).
