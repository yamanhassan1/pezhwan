# Multi-tenancy security

Tenant and application context is derived from trusted authentication and
validated against the resource and OAuth client on every request. It is never
accepted solely from a client-supplied body, query parameter, or header.

All tenant-scoped queries include the tenant predicate. Unique identifiers do
not bypass that predicate. Cross-tenant reads, writes, OAuth exchanges,
administrative operations, exports, and audit queries are release-blocking
negative tests.

Tenant changes are audited with actor, source, target, result, and correlation
ID. Support tooling uses time-limited, explicitly approved elevation.
