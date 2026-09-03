# Authentication security

Passwords are processed with the configured memory-hard password hasher.
Authentication responses do not reveal whether an account exists. Login,
password reset, MFA, and recovery endpoints use rate limits and audit events.

Access tokens are short-lived asymmetric JWTs and are checked for issuer,
audience, expiry, algorithm, and `kid`. Refresh tokens are opaque, stored as
hashes, single-use, and rotated on every successful refresh.

### Tenant-bound authentication

Every authentication-engine user query and write is scoped to the runtime
`tenantId`. Account existence is never checked outside the tenant boundary:
MFA verification, lockout, password change/reset, and refresh-token account
resolution all operate within the tenant context. A custom `lookupUser`
dependency always receives the injected `tenantId`.

Refresh completes only when the returned session's `tenantId` and
`applicationId` match the running engine context; a mismatch raises
`SESSION_CONTEXT_INVALID` (an indicator of a cross-tenant session forgery
attempt).

MFA enrollment and recovery require a recent authenticated session. Recovery
codes are single-use and are displayed only at enrollment. Operators verify
lockout, reset, and compromised-credential procedures during the release
security test.
