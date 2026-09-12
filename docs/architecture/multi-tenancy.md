# PEZHWAN Multi-Tenancy

PEZHWAN is multi-tenant by construction: a **tenant** is the isolation
boundary, an **application** is what a tenant registers and scopes. Tenant A's
users, roles, permissions, sessions, OAuth clients, and audit records must
never be visible to Tenant B.

## Models

`packages/core/src/models/`:

| Model           | Tenant relationship                                    |
| --------------- | ------------------------------------------------------ |
| `Tenant`        | `name`, unique `slug`, `isActive`, `config` — the root isolation unit (`tenant.model.ts`) |
| `Application`   | `tenantId` (indexed), per-tenant unique `{ tenantId, clientId }`, `clientSecretHash`, `redirectUris`, platform (`application.model.ts`) |
| `User`          | `tenantId` required; unique `{ tenantId, email }` and `{ tenantId, phone }` partial indexes (`user.model.ts`) |
| `Session`       | `tenantId` + `applicationId` on every session/family   |
| `Role`/`Permission` | tenant-scoped RBAC records                        |
| `OTP`           | keyed by tenant+application                            |
| `OAuthClient`   | `tenantId` + globally-unique `clientId`                |
| `ApiKey`        | `tenantId` + `applicationId` assigned at creation      |
| `TenantQuota`   | per-tenant `quotas` / `usage` (see below)              |

Tenant and application ids are **strings** per the identifier policy; the
server runtime is constructed with fixed `tenantId`/`applicationId` and never
accepts a caller-supplied tenant (THREAT-MODEL §7: "Tenant-injection via OAuth
client"; services are constructed with a fixed tenant).

## Tenant scope on lookups

Every authenticated operation is tenant-scoped to the identity's tenant:

- Auth lookups use `findOne({ _id, tenantId })` / `findOne({ tenantId, email })`
  instead of unscoped `findById` — login, lockout writes, password
  change/reset, MFA completion, refresh-token resolution, and email
  verification all embed the tenant predicate (`docs/security/multi-tenancy.md`).
- A custom `lookupUser` dependency always receives the runtime `tenantId`
  injected, so a custom resolver cannot cross tenant boundaries.
- `refreshSession` validates the returned session's `tenantId` and
  `applicationId` against the engine context; a mismatch raises
  `SESSION_CONTEXT_INVALID` (401).
- Session rotation queries conditionally include `tenantId`/`applicationId`, so
  an OAuth refresh from tenant A cannot claim a session owned by tenant B, and
  cross-tenant replay detection is scoped.

## Tenant-bound API keys and OAuth clients

- **API keys** are globally unique unguessable hashes (`pk_live_...`). Lookup
  is by hash, not filtered by tenant — but the found row *assigns* its own
  tenant; the caller cannot inject one (`apiKey.service.ts`). The API-key auth
  middleware attaches an `apikey:<id>` machine identity.
- **OAuth clients** use a globally-unique `clientId`; `client_credentials` and
  authorization-code lookups require matching tenant/application/client
  identifiers. Out-of-scope authorization is rejected with `INVALID_SCOPE`
  rather than silently pruned.

## `tenantId` in JWT claims

Access tokens carry `tenantId` (plus `applicationId`, roles, permissions,
`tokenVersion`, `kid`). Verification pins the audience and `kid`, and the
account-state middleware applies the tenant-scoped user lookup before any
identity is attached — a token from tenant A cannot authenticate identity B
even if the signature verifies (`token.service.ts`, `express/index.ts`).

## Isolation tests

| Suite                                        | What it proves                                            |
| -------------------------------------------- | --------------------------------------------------------- |
| `tests/integration/tenant-isolation.test.ts` | Cross-tenant reads, writes, lockouts, and OAuth exchanges fail |
| `tests/security/tenant-escape.test.ts`       | Tenant-injection via body/query/header does not escape    |
| `tests/security/privilege-escalation.test.ts`| Role/permission escalation across tenants is denied       |

These are release-blocking negative tests; see also
`docs/security/multi-tenancy.md` and `docs/security/multi-tenancy-security.md`.

## Per-tenant quotas

Usage-driven quotas are enforced per tenant (`TenantQuotaModel`, the
`quota`/`usage` services, `DEFAULT_QUOTA_LIMITS` in `pezhwan.ts`):

| Resource       | Default limit     |
| -------------- | ----------------- |
| users          | 1,000             |
| sessions       | 10,000            |
| api_keys       | 100               |
| oauth clients  | 50                |
| webhooks       | 20                |
| storage        | 5 GiB             |

The subscription router surfaces plan quotas; `GET /v1/subscriptions/entitlements`
reports quota + usage for a tenant.

## Tenant isolation in deployments

- Shard/partition MongoDB by `tenantId` (see [`scaling.md`](./scaling.md)) —
  safe because no cross-tenant joins exist.
- Multi-region `RegionManager` broadcasts tenant-scoped invalidation events
  (`revokeSession`, `broadcastEvent`) so lockouts and revocations land in every
  region (`docs/operations/multi-region.md`).