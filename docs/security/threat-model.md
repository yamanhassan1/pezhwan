# Threat model

The authoritative STRIDE threat model for Pezhwan is maintained at
[`docs/THREAT-MODEL.md`](../THREAT-MODEL.md). It maps each threat to
source-verified controls (file:line) and a control inventory (G1–G7). This page
is a condensed summary for quick review; refer to the full document before
changes to the security posture.

## Trust boundaries

- MongoDB and Redis are trusted infrastructure (network-isolated); clients never
  reach them directly.
- The system **fails closed**: any uncertainty about an identity resolves to
  "not authenticated."
- High-entropy secrets are never stored or logged in plaintext; passwords use
  Argon2id.
- TLS is required in production (terminated upstream or by the identity server).

## Primary threat surface

| Domain        | Primary threats                                                        |
| ------------- | ---------------------------------------------------------------------- |
| Credentials   | Credential stuffing, password/OTP brute force, re-use                  |
| Secrets       | DB leak of usable secrets, timing side channels, token replay          |
| OAuth/OIDC    | Authorization-code interception, mixed-mode downgrade, token confusion |
| MFA/TOTP      | TOTP brute force, backup-code theft, disable bypass                    |
| OTP           | Brute force, regen/cooldown abuse, account enumeration                 |
| Sessions      | Stolen/CORS-exposed tokens, stale tokens, storage-outage bypass        |
| Tenancy       | Cross-tenant data access, tenant injection via key/client              |
| JWKS          | Weak keys, algorithm confusion, stale keys, unknown `kid`              |
| Transport     | Request flooding, CSRF, oversized bodies, browser-side attacks         |
| Observability | Missing audit records, tampered audit trail                            |

## Control summary

- **Argon2id** password hashing (`timeCost 3`, `memoryCost 64 MiB`), 72-byte cap,
  5-failure/15-min account lockout.
- All high-entropy secrets stored **SHA-256 hashed**; constant-time compare.
- **PKCE (S256 required)** for all OAuth clients; atomic single-use codes.
- MFA gating before token issuance; durable per-user brute-force lockout.
- Refresh-token rotation with **reuse → family revocation**.
- Exact-origin CORS allowlist; CSRF double-submit; `100kb` body cap.
- Tenant scope embedded in every token, OTP, role, session, and query.
- Fail-closed account state; dependency failures surface as **503**.
- Audit `prevHash` SHA-256 chain (best-effort in HA).

## Residual risks (require deployment evidence)

- Live MongoDB/Redis integration and replica-set HA.
- Backup/restore and disaster-recovery drills under traffic.
- External OAuth/OIDC/SAML interoperability.
- Container and dependency scanning wired into CI.
- Operational alert testing and runbook drills.

See [`docs/THREAT-MODEL.md`](../THREAT-MODEL.md) for the complete per-threat
matrix, source references, and the G1–G7 control inventory.
