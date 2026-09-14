# Multi-tenant applications

Run multiple isolated customers (tenants) on one PEZHWAN deployment. Each user,
session, OTP, and OAuth client is scoped to a `tenantId` + `applicationId`; a
token minted by one tenant is cryptographically bound to that context and is
rejected by any other. The `demos/multi-tenant/` demo boots two fully isolated
runtimes (tenant A and tenant B) and proves cross-tenant token rejection.

## Prerequisites

- The simple-auth tutorial (register/login shape).
- MongoDB; the demo reuses `demos/multi-tenant/keys-a` and `keys-b` for
  per-tenant signing keys.

## 1. Tenant and Application concepts

- **Tenant** (`TenantModel`) is the isolation boundary: `name`, `slug`,
  `isActive`, `config` (e.g. `plan`). Managed by `TenantService` and the admin
  API (`/v1/admin/tenants`).
- **Application** (`ApplicationModel`) is a client of a tenant, keyed by
  `tenantId` + `applicationId`. Every auth operation names an application.
- **Runtime** one per tenant. `createPezhwan({ tenantId, applicationId, .... })`
  bakes the boundary into every service it wires:

```ts
const runtimeA = createPezhwan({ tenantId: 'dev-tenant', applicationId: 'dev-app', ... });
const runtimeB = createPezhwan({ tenantId: 'tenant-b', applicationId: 'app-b', ... });
```

## 2. Tenant scope inside tokens

Access tokens carry the full context in their claims and nothing else. The
token service signs `sub / tenantId / applicationId / sessionId` plus
`roles`/`permissions` (`packages/core/src/services/token.service.ts`), and the
express middleware verifies those claims **and** the account state on every
request. Cross-tenant reuse fails closed.

Run the demo and watch the IDs:

```bash
cd demos/multi-tenant && npm start   # http://localhost:5181
```

Register + login against both tenants:

```
POST /api/tenants/a/register  { email, password }
POST /api/tenants/b/register  { email, password }
```

Each response carries tokens whose claims name its tenant/application in
`req.pezhwan` (`userId`, `tenantId`, `applicationId`, `sessionId`, `authMethod`).

## 3. Cross-tenant rejection

The demo mounts tenant-A middleware on the tenant-B routes (and vice-versa) to
demonstrate isolation. Presenting a tenant-A token to a tenant-B route yields
`401`:

```json
{
  "success": false,
  "error": {
    "code": "CROSS_TENANT_REJECTED",
    "message": "Token rejected by opposite tenant runtime"
  }
}
```

The same enforcement exists in normal operation: refresh a tenant-A token while
the session's tenant/application context changed, and refresh returns
`SESSION_CONTEXT_INVALID` (surfaced by the React SDK's silent-refresh path,
`packages/react/src/index.tsx`).

## 4. Per-tenant isolation of OTP and sessions

Boundaries apply to the stateful parts too:

- **Sessions** carry `tenantId`; `sessions.listActive(userId, applicationId)`
  and `revokeAll(userId, applicationId, tenantId)` are scoped filters
  (`packages/core/src/services/session.service.ts`).
- **OTP codes** are upserted per
  `(tenantId, applicationId, purpose, channel, target)` — one live code per
  context (`packages/core/src/services/otp.service.ts`).
- **Verification tokens** verify that the redemption tenant matches the issuing
  tenant (`verificationToken.service.ts`: `Token tenant mismatch → INVALID_TOKEN`).
- **OAuth clients** are registered and looked up with both `tenantId` and
  `applicationId`.

## 5. Per-tenant quotas

`QuotaService` (`packages/core/src/services/tenant/quota.service.ts`) enforces
resource limits with atomically incremented counters in
`TenantQuotaModel`. Resources: `users`, `sessions`, `api_keys`, `oath_clients`,
`webhooks`, `storage_bytes`.

```ts
const quota = new QuotaService({
  limits: { users: 1000, sessions: 100, api_keys: 10, oath_clients: 5 },
});
await quota.check(tenantId, 'users'); // throws RateLimitError when exhausted
await quota.increment(tenantId, 'users'); // returns the new usage count
const usage = await quota.usage(tenantId); // per-resource counters
```

`UsageService` (`services/ecosystem/usage.service.ts`) wraps the same counters
for per-tenant consumption summaries.

## 6. Provision tenants (admin API)

The admin surface (`apps/identity-server/src/admin.ts`, mounted at `/v1/admin`
behind `requireRole('ADMIN')`) provisions tenants without touching the SDK:

```bash
# List
curl -s -H "Authorization: Bearer $ADMIN_ACCESS" http://localhost:4011/v1/admin/tenants

# Create
curl -s -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_ACCESS" \
  -d '{"name":"Acme Corp","slug":"acme","plan":"pro","isActive":true}' \
  http://localhost:4011/v1/admin/tenants
# { "success": true, "data": { "id": "...", "slug": "acme", "plan": "pro", ... } }
```

`GET /v1/admin/tenants/:id`, `PATCH /v1/admin/tenants/:id` (name, plan, config,
activation) round out provisioning. The same data is reachable SDK-side through
`TenantService.create/get/getBySlug/list/update/remove`.
`ensureBootstrap` (`apps/identity-server/src/admin.ts`) performs the idempotent
`Tenant` + `Application` + `ADMIN` role bootstrap on every boot.

The React `useTenant` hook only selects/persists a tenant for the current
browser session (`pezhwan.tenant`); the server-side boundary is always enforced
by the runtime — never rely on the client for isolation.

## Troubleshooting

| Problem                              | Cause / fix                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `401` presenting tenant-A token to B | By design — each runtime validates against its own key store + claims.                               |
| `SESSION_CONTEXT_INVALID` on refresh | Session's tenant/application no longer matches the request context — relogin.                        |
| Users "invisible" across tenants     | User lookups are `tenantId`-scoped (`UserModel.findOne({ _id, tenantId })`).                         |
| `11000 duplicate key` on register    | Stale non-partial indexes; drop `tenantId_1_email_1` / `tenantId_1_phone_1` (see `demos/README.md`). |
| Quota 429 on create                  | `TenantQuotaModel.usage[resource]` reached the configured `limits`.                                  |

## Further reading

- Tenant + quota + organization services: `packages/core/src/services/tenant/`
- Token claims: `packages/core/src/services/token.service.ts`
- Admin provisioning API: `apps/identity-server/src/admin.ts`
- Working demo (two isolated runtimes): `demos/multi-tenant/`
