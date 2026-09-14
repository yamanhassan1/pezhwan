# PEZHWAN API Reference

This is the entry point for the PEZHWAN Identity Server HTTP API. The API is a
`@pezhwan/*` SDK-neutral REST surface; every official SDK
(`react`, `vue`, `angular`, `node`, `express`, `python`, `go`, `java`, `dotnet`,
`cli`) is a thin client over these endpoints.

## Documents

| Document                                             | Purpose                                                    |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| [`OPENAPI.yaml`](./OPENAPI.yaml)                     | Authoritative machine-readable spec (OpenAPI 3.0.3)        |
| [`graphql-schema.graphql`](./graphql-schema.graphql) | GraphQL SDL for the self-service endpoint `/v1/graphql`    |
| [`webhooks.md`](./webhooks.md)                       | Outbound webhook events, registration, signatures, retries |
| [`rate-limits.md`](./rate-limits.md)                 | Rate-limit budgets, headers, and tuning                    |
| [`errors.md`](./errors.md)                           | Error envelope, `PezhwanError` hierarchy, and error codes  |

The spec is versioned alongside the server (`info.version: 0.1.0`); `OPENAPI.yaml`
is the single source of truth for paths, schemas, and security schemes.

## Base URL

The reference server listens on `http://localhost:4011` (`PEZHWAN_PORT`). All
API routes are prefixed with `/v1`; discovery endpoints live at
`/.well-known/`.

| Area         | Base path                                                                                                                                                                                                                                                       | Notes                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Auth         | `/v1/auth/register`, `/v1/auth/login`, `/v1/auth/refresh`, `/v1/auth/otp/*`, `/v1/auth/password/*`, `/v1/auth/email/verify`                                                                                                                                     | CSRF-protected on state-changing calls                           |
| Sessions     | `/v1/sessions`, `/v1/sessions/:id/revoke`, `/v1/sessions/all/revoke`                                                                                                                                                                                            | Bearer required                                                  |
| MFA          | `/v1/mfa/setup \| enable \| verify \| disable \| login`                                                                                                                                                                                                         | Auth required for all routes                                     |
| Verification | `/v1/verify/password/*`, `/v1/verify/email/*`, `/v1/verify/magic/*`                                                                                                                                                                                             | Token-based flows                                                |
| OAuth        | `/v1/oauth/authorize`, `/v1/oauth/token`, `/v1/oauth/clients`                                                                                                                                                                                                   | OAuth 2.1 wire format (not the envelope)                         |
| User         | `/v1/users/me`                                                                                                                                                                                                                                                  | Authenticated profile (used by React SDK)                        |
| Admin        | `/v1/admin/stats`, `/v1/admin/tenants`, `/v1/admin/users`, `/v1/admin/roles`, `/v1/admin/clients`, `/v1/admin/sessions`, `/v1/admin/audit`, `/v1/admin/api-keys`, `/v1/admin/webhooks`, `/v1/admin/security/*`, `/v1/admin/settings`, `/v1/admin/subscriptions` | `ADMIN` role on the full mount, plus identity re-check per route |
| Provisioning | `/v1/scim`, `/v1/webhooks`, `/v1/teams`, `/v1/subscriptions`                                                                                                                                                                                                    | `ADMIN` role where noted                                         |
| GraphQL      | `/v1/graphql`                                                                                                                                                                                                                                                   | Self-service read API, Bearer required                           |
| Well-known   | `/.well-known/jwks.json`, `/.well-known/openid-configuration`                                                                                                                                                                                                   | Public discovery, read-only                                      |

## Conventions

### Envelope

Every endpoint except OAuth/OIDC and SCIM 2.0 returns a consistent envelope:

```json
{ "success": true, "data": { ... } }
```

Errors use the same shape with an `error` object instead of `data` (see
[`errors.md`](./errors.md)):

```json
{
  "success": false,
  "error": { "code": "AUTHENTICATION_FAILED", "message": "...", "requestId": "..." }
}
```

OAuth endpoints (`/v1/oauth/token`) follow RFC 6749 and return
`{ "error", "error_description" }` on failure; SCIM endpoints (`/v1/scim/*`)
use RFC 7643 resource/list/error envelopes.

### Authentication

Three credential types are accepted, on top of unauthenticated public routes:

- **Bearer access token** — JWT (RS256) from `/v1/auth/*` or `/v1/auth/refresh`,
  presented as `Authorization: Bearer <token>`. Machine tokens (`client_credentials`,
  API-key identities) are verified by signature + live key lookup.
- **API key** — server-to-server, presented as the `X-API-Key: <key>` header.
  Keys are minted by `POST /v1/admin/api-keys` (the un-hashed `rawKey` is shown
  once, prefixed `pzk_…`); the server stores only the SHA-256 hash.
- **CSRF token** — browser clients must echo the `pezhwan_csrf` double-submit
  cookie as the `X-CSRF-Token` header on state-changing requests under
  `/v1/auth`, `/v1/mfa`, and `/v1/verify`.

Identity is always derived from the verified token (`req.pezhwan`), never from
request-body fields.

### Request IDs and correlation

Every request is assigned a `requestId` (from the inbound `x-request-id` header
or generated) and echoed back in the `x-request-id` response header plus
`x-response-time`. Include it bug reports and check `error.requestId` on failures.

### Headers and hardening

Responses carry `strict-transport-security`, `content-security-policy`,
`x-content-type-options`, `referrer-policy`, `permissions-policy`, and
`x-frame-options` (see `packages/express/src/security.ts`). CORS uses an
exact-origin allowlist and never emits a wildcard with credentials.
