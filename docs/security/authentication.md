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

## Passwordless and certificate-based factors

### FIDO2 / WebAuthn and passkeys

Registration and authentication may be delivered through FIDO2 (implemented in
`services/auth/webauthn.service.ts` on top of the `@pezhwan/crypto` verifier).
Every ceremony is bound to a single-use, short-lived challenge and enforced
against the exact `rpId` and `origin` allowlist. Stored credentials keep the
COSE-encoded public key and a monotonic signing counter; a counter that moves
backwards is treated as a cloned authenticator and refused. See the
[passkeys tutorial](../tutorials/passkeys.md) for the full flow.

### SRP-6a (zero-knowledge password proofs)

For high-assurance machine-to-machine and high-value user flows, Pezhwan ships
an SRP-6a implementation (RFC 5054, 2048-bit group, SHA-256) in
`@pezhwan/crypto`. The verifier — never the password — is stored; the password
is exchanged as a zero-knowledge proof, so it is never transmitted to the
server, even over a trusted channel. Server-side helpers cover verifier
generation, challenge handling, and proof validation.

### mTLS client certificates

`services/auth/certificate.service.ts` implements RFC 8705 certificate-bound
authentication for OAuth clients and machine identities. The service validates
the certificate chain, checks validity windows, maps SAN (and CN) to a
principal, and supports pluggable CRL/OCSP-style revocation checkers that fail
closed when enabled. TLS termination remains the reverse proxy's job; Pezhwan
validates the proxied certificate chain and thumbprint.

## Adaptive sign-in

Login attempts are scored by the risk engine (`services/security/risk.service.ts`)
and can be allowed, challenged to MFA, or blocked based on impossible travel,
breach matches, anonymity networks, velocity, and bot behaviour. All factors
and signals are recorded with the verdict for audit. See
[risk-based authentication](./risk-based-authentication.md).
