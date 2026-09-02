# Threat model

The primary threats are credential stuffing, password and OTP brute force,
session and refresh-token theft, token replay, XSS/CSRF/CORS abuse, OAuth
redirect and code attacks, tenant escape, BOLA/IDOR, privilege escalation,
API-key theft, insider misuse, and MongoDB/Redis compromise.

Controls include Argon2id, endpoint-specific rate limits, account and MFA
lockouts, secure cookies, CSRF and exact-origin checks, PKCE/state/nonce,
short-lived tokens, refresh-family replay detection, deny-by-default
authorization, tenant-scoped queries, hashed API keys and OTPs, redacted
structured logs, audit trails, encrypted TOTP secrets, and fail-closed
dependency behavior.

Residual risks requiring deployment evidence are live MongoDB/Redis
integration, backup restoration, HA behavior, external OAuth interoperability,
container scanning, and operational alert testing.
