# Authentication security

Passwords are processed with the configured memory-hard password hasher.
Authentication responses do not reveal whether an account exists. Login,
password reset, MFA, and recovery endpoints use rate limits and audit events.

Access tokens are short-lived asymmetric JWTs and are checked for issuer,
audience, expiry, algorithm, and `kid`. Refresh tokens are opaque, stored as
hashes, single-use, and rotated on every successful refresh.

MFA enrollment and recovery require a recent authenticated session. Recovery
codes are single-use and are displayed only at enrollment. Operators verify
lockout, reset, and compromised-credential procedures during the release
security test.
