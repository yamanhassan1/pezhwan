# Session security

Refresh-token families are stored durably and are rotated atomically. A token
may be claimed for rotation only once. Reuse, an expired token, or a revoked
family revokes the complete family and requires re-authentication.

Session refresh-token rotation queries are scoped by `tenantId` and
`applicationId` when provided, so a refresh from one tenant/application cannot
claim a session owned by another. After rotation, the engine re-validates the
returned session context and raises `SESSION_CONTEXT_INVALID` on a
tenant/application mismatch.

Cookies are `HttpOnly`, `Secure`, and use an explicit `SameSite` policy in
production. Session limits, idle expiry, absolute expiry, logout, password
change, and administrator revocation are enforced server-side. Redis may
accelerate checks but MongoDB remains the source of truth.

The release test must exercise concurrent refreshes, replay after rotation,
cross-tenant refresh claims, logout, and recovery while Redis is unavailable.
