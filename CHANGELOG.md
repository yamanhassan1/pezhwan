# Changelog

All notable changes to Pezhwan are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Enterprise security

- **SRP-6a password protocol** (`@pezhwan/crypto`): zero-knowledge password
  proofs per RFC 5054 using the standard 2048-bit group and SHA-256. Server
  and client helpers cover verifier generation, challenge/proof exchange, and
  shared session-key derivation — a password is never transmitted.
- **Timing-safe comparison utilities** (`@pezhwan/crypto`): constant-time
  string/buffer comparison, bearer/CSRF/HMAC validation, and entropy
  estimation for keys, tokens, and rate-limit primitives.
- **WebAuthn / FIDO2** (`@pezhwan/crypto` + core `WebAuthnService`): option
  generators and verifiers for registration and authentication, CBOR
  attestation parsing, COSE candidate signature verification (ES256/RS256),
  passkey (resident/discoverable) support, credential lifecycle
  (list, rename, delete, revoke), origin/rpId/challenge enforcement, and
  authenticator counter checks that detect cloned devices.
- **Certificate (mTLS) authentication** (`certificate.service.ts`): RFC 8705
  client-certificate support with chain verification, SAN/CN to principal
  mapping, and pluggable CRL/OCSP-style revocation checking that fails closed.
- **Account takeover protection** (`services/security`): a 0-100 risk engine
  (impossible travel, velocity, breach matches, Tor/proxy, IP failure
  reputation, bot signals), HaveIBeenPwned k-anonymity breached-password
  lookups with a local Mongo range cache, breach detection, bot detection,
  decoy/honeypot users, and CAPTCHA verification (hCaptcha, Cloudflare
  Turnstile, reCAPTCHA). Every login is scored and audited with transparent
  signal detail.
- **Compliance framework** (`services/compliance`): GDPR (data portability,
  right to erasure), HIPAA (PHI access audit, minimum-necessary reviews,
  BAA tracking), PCI DSS (tokenization, separation of duties), SOC 2 (change
  management, control evidence snapshots), and CCPA/CPRA (household
  right-to-know and right-to-delete) — all actions traced through the audit
  log.

#### Cryptography platform

- Post-quantum primitives: Kyber KEM, Dilithium and Falcon signatures, and an
  ECDH + Kyber hybrid key-establishment helper.
- Zero-knowledge building blocks for SNARK- and STARK-style verification with
  example circuit definitions.
- HSM integrations for AWS KMS, Azure Key Vault, GCP Cloud KMS, and PKCS#11,
  plus a software keystore fallback.
- AES-256-GCM authenticated envelope encryption and key-management utilities.
- Hardened random token and one-time-code generation using the node crypto CSPRNG.

#### Platform operations

- MongoDB multi-document transactions (`withTransaction`) with transient-error
  retry and graceful non-replica-set fallback, plus a three-node replica-set
  Docker topology (`pezhwan-rs`).
- Transactional email/SMS adapters (Mailgun, SendGrid, SES, Nodemailer;
  Vonage, Twilio, SNS) behind a unified OTP-delivery manager interface.
- A versioned migrations runner (`migrations/`) with a `_migrations` ledger
  and rollback support.
- MFA legacy-secret encryption migration: upgrades stored TOTP secrets to the
  versioned AES-256-GCM envelope, dry-run by default, batched apply,
  post-migration validation, and idempotent rollback. See
  `docs/operations/mfa-migration.md`.
- Docker topologies for development, test, and production (Mongo replica set,
  Redis/Sentinel, nginx, Prometheus, Grafana, Loki), Kubernetes/Helm charts,
  Terraform modules for AWS/Azure/GCP, and backup/restore/key-rotation
  scripts with drill automation.

#### SDKs, applications, and tooling

- SDKs: Node.js, Express, React, Vue, Angular, and a CLI; Python, Go, Java,
  and .NET client libraries.
- The admin console and developer portal applications, plus shared frontend
  components (login, MFA, passkeys, session manager in the React SDK).
- Starter templates (React SPA, Next.js, Vue, Angular, Express API) and eight
  demo applications (basic auth, MFA, passwordless, passkeys, social login,
  OAuth, multi-tenant, machine-to-machine).
- OIDC/OAuth extensions: SCIM 2.0 provisioning endpoints, SAML 2.0 federation
  scaffolding, token exchange, and per-provider social-login adapters.
- Repository tooling: ESLint/Prettier setup, lint-staged/commit hooks,
  secret scanning, dependency auditing, release scripts, and CI workflows
  (lint, build, test, CodeQL, dependency review, compliance scan).
- An in-process load suite (`tests/load/`, `npm run test:load`) benchmarking
  the sign-in primitives — argon2id password hashing, JWT sign/verify under
  key rotation, OTP/TOTP/HOTP, timing-safe bearer comparison, and SRP-6a
  ephemeral generation — with throughput floors for regression detection.
- **Multi-region active-active** (`services/infrastructure/region-manager.ts`):
  geo-aware nearest-region routing, latency-aware best-region selection via
  pluggable probes (cached 15 s), per-region connection context and health,
  and global session/identity invalidation over an injectable transport with
  idempotent, deduplicated delivery (`id`, `sourceRegion`, `issuedAt`
  stamping; `PRIMARY_CHANGED` fan-out on `switchPrimary`). Defaults to an
  in-process bus so single-node deployments degrade gracefully. See
  `docs/operations/multi-region.md`.
- Broad documentation: architecture, developer guides, migration guides,
  operations runbooks, deployment runbooks, security controls, and compliance
  references (50+ files).

### Security

- Reduced attack surface for secret handling: example credential values in
  documentation are placeholders only, and a pre-commit secret scan blocks
  hardcoded keys/passwords.
- WebAuthn stored credentials persist the parsed COSE public key (previously
  the credential id was stored in its place), so passkey authentication
  verifies signatures correctly.
- Certificate principal mapping prefers SAN (email/UPN/URI/DNS) over CN, and
  revocation checks fail closed when enabled.
- HIBP lookups never disclose full password hashes (first five SHA-1 hex
  characters only) and cache ranges locally to reduce outbound traffic.

### Changed

- The core package now re-exports infrastructure, auth, security, and
  compliance service groups from `services/index.ts`; new models
  (WebAuthn credential, risk event, breach record, decoy user) are exported
  from `models/index.ts`.
- MongoDB Compose layout moved from a single node to a three-node replica set
  to support multi-document transactions.
- Crypto package exports are centralized through `src/index.ts`.

### Fixed

- Type-level hardening across the workspace: stricter index signatures,
  `Uint8Array` interop with the Web Crypto API in post-quantum modules,
  optional-vendor HSM imports, and ambiguous duplicated-export resolution
  (`WebAuthnVerificationResult` vs ZK `VerificationResult`).
- `ChainSecretProvider.getOptionalSecret` returned `undefined` instead of
  throwing when no provider held a secret, honouring the `SecretProvider`
  interface contract for optional lookups (previously it delegated to
  `getSecret`, which threw `SecretNotFoundError`).

### Quality gates & CI

- **Root test suites** (`tests/`): unit (54), security (61), failure-mode
  (37, incl. redis/mongo/provider/clock-skew/network-partition), interop (22:
  17 pass, 5 documented skips for SAML), integration (60, live Mongo via
  mongodb-memory-server), and load (10 scripts, all performance floors met).
- **CI pipeline** (`.github/workflows/ci.yml`): build + typecheck + lint +
  format:check + workspace tests + license audit, plus a secret-scan job
  (gitleaks + `scripts/secret-scan.mjs --ci`) and a Docker Compose validation
  job, on Node 24. `security.yml` bumped to Node 24 to match the engine
  requirement for the new `node --test` TypeScript suites.
- **Final security audit** (`scripts/security-audit.mjs`): 21 automated
  checks covering secret scanning, untracked secret material, core security
  controls, threat-model/security documentation, TLS termination, CI wiring,
  and reproducible installs. `npm run test:root` chains the local suites.
- **Lint/format hygiene**: `eslint .` now clean (0 errors) and
  `prettier --check .` green after removing dead code and unused imports in
  `@pezhwan/crypto` (AES, WebAuthn, SRP, ZK, PQ, HSM adapters) and
  `@pezhwan/core` services.
- **TLS reverse proxy** (`infrastructure/docker/nginx`): functional
  nginx-based TLS termination config (443, HSTS, security headers, HTTP→HTTPS
  redirect) and Dockerfile, with runtime-mounted certificate bundle.

<!-- Template section for the next release:

## [0.2.0] - YYYY-MM-DD

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security
-->
