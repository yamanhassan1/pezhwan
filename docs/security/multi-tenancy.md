# Multi-tenancy security

Tenant and application context is derived from trusted authentication and
validated against the resource and OAuth client on every request. It is never
accepted solely from a client-supplied body, query parameter, or header.

All tenant-scoped queries include the tenant predicate. Unique identifiers do
not bypass that predicate. Cross-tenant reads, writes, OAuth exchanges,
administrative operations, exports, and audit queries are release-blocking
negative tests.

### Enforcement in the auth engine

Every user lookup, update, and lockout write in the authentication engine is
scoped to the runtime tenant context. Concretely:

- User queries use `findOne({ _id, tenantId })` instead of unscoped
  `findById`/`updateOne({ _id })` — covering login, lockout, password
  change/reset, MFA completion, refresh-token account resolution, and email
  verification.
- A custom `lookupUser` dependency always receives the runtime `tenantId`
  injected, so a custom resolver cannot cross tenant boundaries.
- MFA verification resolves and validates the tenant-owned account **before**
  evaluating the factor, so a TOTP code is never validated against a
  non-existent or disabled account.

### Session context validation

`refreshSession` validates the returned session's `tenantId` and
`applicationId` against the running engine context. A mismatch raises
`AuthenticationError` `SESSION_CONTEXT_INVALID`. Session refresh-token rotation
queries also conditionally include `tenantId`/`applicationId`, so an OAuth
refresh from tenant A cannot claim a session owned by tenant B and cross-tenant
replay detection is scoped.

### OAuth boundary

OAuth client lookups and authorization-code redemption require matching
tenant/application/client identifiers. `AuthorizeInput` requires `tenantId`
and `applicationId`; out-of-scope authorization or client-credentials requests
are rejected with `INVALID_SCOPE` rather than silently pruned.

Tenant changes are audited with actor, source, target, result, and correlation
ID. Support tooling uses time-limited, explicitly approved elevation.
