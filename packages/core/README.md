# @pezhwan/core

The heart of the PEZHWAN identity platform. `@pezhwan/core` is a framework-free
engine — secure token minting and verification, sessions with refresh-token
rotation, password hashing, OTP, MFA/TOTP, OAuth 2.1 enrollment, RBAC/ABAC
authorization, tenant isolation, audit logging, and rate limiting — exposed as
a single runtime you construct once and reuse everywhere.

Framework adapters such as [`@pezhwan/express`](../express/README.md) and
[`@pezhwan/node`](../node/README.md) are thin layers over this package. If you
need identity in a custom HTTP stack, a worker, or a test harness, `@pezhwan/core`
is the package to import.

## Installation

```bash
npm install @pezhwan/core @pezhwan/shared @pezhwan/crypto
```

## Constructing the runtime

`createPezhwan(config)` builds and wires the entire stack in one call. It
validates your configuration eagerly — a missing required option throws at
startup, not halfway through a request.

```ts
import { createPezhwan } from '@pezhwan/core';

const runtime = createPezhwan({
  // Required
  tenantId: 'dev-tenant',
  applicationId: 'dev-app',
  issuer: 'https://id.example.com',
  audience: 'pezhwan.clients',
  otpDelivery: {
    sendEmail: async (to, code) => {
      /* deliver the code */
    },
  },

  // Optional
  jwtAlgorithm: 'RS256',
  accessTokenTtlMs: 15 * 60 * 1000,
  mfaEncryptionKey: process.env.PEZHWAN_MFA_KEY, // 32-byte key to encrypt TOTP secrets at rest
  maxActiveSessions: 10,
  rateLimits: {
    login: { windowMs: 15 * 60 * 1000, max: 10 },
  },
});
```

### `PezhwanConfig` reference

| Field                              | Required | Purpose                                                                                                                                  |
| ---------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `tenantId`, `applicationId`        | ✓        | The tenant/application this runtime is scoped to. Tenant isolation is explicit — every tenant-scoped query flows through `tenantId`.     |
| `issuer`, `audience`               | ✓        | Token issuer and audience (`iss` / `aud` claims). Verifiers check these, so they must match your deployment.                             |
| `otpDelivery`                      | ✓        | `sendEmail` / `sendSms` callbacks that deliver one-time codes. OTP is always available, so supply these up front.                        |
| `mongoose`                         | –        | An existing mongoose connection to share (for HA deployments where all replicas must use the same connections).                          |
| `redis`                            | –        | A Redis-like client for caching/rate-limit counters. When absent the runtime uses an in-memory fallback.                                 |
| `accessTokenTtlMs`, `jwtAlgorithm` | –        | Token lifetime and signing algorithm (`RS256`                                                                                            | `RS384` | `RS512` and friends). |
| `passwordPolicy`                   | –        | Override the default password policy (minimum 12 chars, 3 character classes).                                                            |
| `mfaEncryptionKey`                 | –        | 32-byte key used to encrypt TOTP secrets at rest. **Required when MFA is enabled** — the MFA service refuses to store plaintext secrets. |
| `otp`                              | –        | Code length, TTL, max attempts, resend cooldown, attempts window.                                                                        |
| `lookupUser`                       | –        | Custom user lookup function (defaults to the built-in `UserModel`).                                                                      |
| `rateLimits`                       | –        | Per-budget rules for `login`, `register`, `otp`, `refresh`, `api`, `mfa`. Unspecified budgets keep the documented defaults.              |
| `quota`                            | –        | Per-resource tenant quota limits.                                                                                                        |
| `debug`                            | –        | Enable verbose internal logging.                                                                                                         |

## The runtime surface

`createPezhwan` returns a `PezhwanRuntime` — your single handle to every
subsystem:

```ts
runtime.auth; // AuthEngine        — register/login/logout/refresh/OTP/password
runtime.sessions; // SessionService    — refresh-token families, rotation, reuse detection
runtime.authorization; // AuthorizationService — RBAC + ABAC/expression policies
runtime.mfa; // MfaService        — TOTP enrolment, enable/disable, step-up verify
runtime.oauth; // OAuthService      — authorization-code + client-credentials
runtime.apiKeys; // ApiKeyService     — issue + verify API keys
runtime.tokens; // TokenService      — sign/verify access & refresh tokens
runtime.accountState; // AccountStateService — fail-closed identity validation
runtime.audit; // AuditService      — append-only audit log
runtime.rateLimiter; // RateLimitService  — per-budget limits
runtime.verificationTokens; // VerificationTokenService — email verify / password reset
runtime.webhooks; // WebhookService    — signed delivery to your endpoints
runtime.quota; // QuotaService      — tenant quota enforcement
runtime.organizations; // OrganizationService
runtime.teams; // TeamService
runtime.subscriptions; // SubscriptionService
runtime.billing; // BillingService
runtime.usage; // UsageService
runtime.metrics; // MetricsRegistry
runtime.trace; // { requestId } — request correlation
runtime.logger; // PezhwanLogger
runtime.store; // CryptoKeyStore — the live signing key store (runtime.store.jwks())
runtime.cache; // RedisCache (in-memory fallback)
runtime.keyPersistence; // KeyStorePersistAdapter — persist/load signing keys
```

A typical server-side call chain:

```ts
// Signing keys are auto-generated on first boot.
const jwks = runtime.store.jwks();

// Registration enforces the password policy and returns a token-bearing user.
const { user, tokens } = await runtime.auth.register({
  email: 'ada@example.com',
  password: 'Str0ng!Pass#2026',
});

// Verify an incoming access token and re-check account state (fail closed).
const identity = runtime.tokens.verifyAccessToken(rawToken);

// Enforce a permission.
await runtime.authorization.requirePermission(identity.userId, 'ride:create');
```

## Engines and services

Beyond the runtime object, the package exports the concrete service classes so
you can wire them into your own architecture — dependency-inject a `TokenService`
into a custom gateway, or compose services in a test harness.

Facade services (importable and listed in the runtime above) include:
`RedisCache`, `TokenService`, `SessionService`, `PasswordService`,
`OtpService` (+ `OtpDeliveryAdapters`), `RateLimitService` (+ `RateLimitRule`,
`RateLimitType`, `RateLimitResult`), `AuditService` (+ `AuditSink`),
`AuthorizationService`, `AccountStateService`, `ApiKeyService`, `KeyStore`,
`MfaService`, `OAuthService`, `VerificationTokenService`, `PezhwanLogger`,
`MetricsService`, and `RegionManager`.

Namespaced service families:

| Area                      | Highlights                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `services/auth/`          | `AuthEngine`, `LoginResult`, `UserCreateInput`, `OtpVerification`                                                                                                                              |
| `services/security/`      | `RiskService` (+ core's own `RiskAssessment`, `RiskVerdict`), `Captcha`, `HibpService` (HIBP breach checks), `BotDetector`, `BreachDetectorService`, `DecoyService` (decoy-account trap users) |
| `services/compliance/`    | `GdprService`, `HipaaService`, `PciDssService`, `Soc2Service`, `CcpaService`                                                                                                                   |
| `services/oauth/`         | `OidcService`, `FederatedIdentityService`, `OAuthClientService`, `UserInfoClaims`                                                                                                              |
| `services/session/`       | `TrustService` (`TrustLevel`, `TrustAssessment`), `DeviceService`                                                                                                                              |
| `services/tenant/`        | `TenantService`, `OrganizationService`, `QuotaService`                                                                                                                                         |
| `services/events/`        | `EventBus`, `EventStore`, `Projector` (event-sourced projections), `JobQueue`, `WebhookService`, `ReplayService`                                                                               |
| `services/developer/`     | `DeveloperPluginManagerService`, `DeveloperPortalService`, `ApiUsageService`                                                                                                                   |
| `services/ecosystem/`     | `UsageService`, `SubscriptionService`, `BillingService`                                                                                                                                        |
| `services/observability/` | `TracingService`, `HealthService` (`RuntimeHealthStatus`), `QuotaService`                                                                                                                      |

> Note: `RiskAssessment` here (score/verdict based) intentionally supersedes the
> shared-package type. Import risk assessment from `@pezhwan/core`, not
> `@pezhwan/shared`.

## Models

Mongoose models for MongoDB persistence, all exported from the package root:

`UserModel`, `TenantModel`, `ApplicationModel`, `RoleModel`, `PermissionModel`,
`UserRoleAssignmentModel`, `SessionModel`, `OtpModel`, `AuditLogModel`,
`ApiKeyModel`, `OAuthClientModel`, `AuthorizationCodeModel`,
`VerificationTokenModel`, `BackupCodeModel`, `RateLimitCounterModel`,
`WebAuthnCredentialModel`, `RiskEventModel`, `BreachRecordModel`,
`DecoyUserModel`, `WebhookModel`, `WebhookDeliveryModel`, `SubscriptionModel`,
`TeamModel`, `OrganizationModel`, `TrustedDeviceModel`, plus `IDENTIFIER_POLICY`
(the tenant/application identifier constraints).

Most applications never touch these directly — the services use them internally
via the connection you pass in. They are exported for teams that need custom
queries, migrations, or reporting on the same collections.

## Middleware

Frame-agnostic middleware helpers for HTTP layers (consumed by
`@pezhwan/express` and usable with any Connect-style framework):

- `requestContext` (`RequestContext`, `RequestContextData`)
- `auth`, `tenant` (`TenantResolution`, `TenantMiddleware`),
  `trust-device` (`TrustDecision`, `TrustDeviceMiddleware`), `mfa`, `risk`
- `rate-limit`, `csrf`, `cors`, `security-headers`, `bot`, `compliance`

## Adapters

- `otp-provider`, `otp-delivery-manager`, `email/*`, `sms/*` — pluggable OTP
  transport; wire your provider and pass it through `otpDelivery`.

## Secret provision

`EnvSecretProvider`, `FileSecretProvider`, and `ChainSecretProvider` implement
the `SecretProvider` interface for loading secrets (signing-key material, MFA
keys) from environment, files, or a fallback chain without scattering
`process.env` reads through your code.

## Design invariants

These are not aspirational — they are enforced by the implementation:

- **Secrets are never stored raw.** Passwords are Argon2id-hashed; secrets and
  tokens are SHA-256 hashed. Only hashes and derivation metadata persist.
- **Access tokens are minimal RS256 JWTs.** Refresh tokens are opaque, hashed,
  and rotated; every validation re-checks live account state (fail closed).
- **Tenant isolation is explicit.** Tenant-scoped queries always carry
  `tenantId`; middleware never trusts the client for tenant selection.
- **Authorization is server-derived.** Roles/permissions come from the verified
  token and the `AuthorizationService` — never from `req.body` or other client
  input.
- **Events are append-only.** Projections replay event streams; nothing mutates
  the source of truth.
- **Fail closed on dependency outage.** "Cannot check" resolves to "reject",
  and the dependency failure is surfaced (503) rather than silently collapsing
  to a misleading 401.

## Testing

Core tests are DB-free by design — they compose real services with in-memory
trust stores, pre-seeded caches, and injected backends. Run the package suite:

```sh
cd packages/core
npm test
```

The test script discovers `*.test.ts` in `src/` and `test/`, plus the compiled
`dist/` copies, so the same suite runs twice — both must pass.

## Related docs

- [`@pezhwan/node`](../node/README.md) — the non-HTTP facade over this runtime.
- [`@pezhwan/express`](../express/README.md) — middleware + routers that turn this runtime into a full HTTP identity API.
- [`docs/architecture/overview.md`](../../docs/architecture/overview.md) — how the layers fit together.
- [`docs/security/`](../../docs/security/) — the security model this engine enforces.
