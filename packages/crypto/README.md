# @pezhwan/crypto

Cryptographic primitives used across Pezhwan: Argon2id password hashing,
RS256/ES256/EdDSA JWT sign/verify with JWKS, AES-256-GCM encryption,
OTP/TOTP (RFC 6238), and key-store lifecycle management.

## Modules

- `password`    — Argon2id `hashPassword` / `verifyPassword`
- `jwt`         — RS256 signing/verification, key generation, JWKS
- `keystore`    — AES `CryptoKeyStore` (active/retired/destroyed lifecycle)
- `encryption`  — AES-256-GCM with envelopes and key derivation
- `otp` / `totp` — one-time passwords and TOTP (RFC 6238)
- `random`      — secure random bytes/tokens and constant-time compare
- `hsm` / `pq` / `zk` / `webauthn` / `srp` — advanced primitives

Secrets are handled here and never above the crypto layer.
