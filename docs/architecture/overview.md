# PEZHWAN Architecture Overview

PEZHWAN ("Pezhwan" = "identity" in Pashto) is a **universal Identity & Access
Management (IAM) SDK** built as a modular npm-workspaces monorepo. One identity,
every application.

## High-level architecture

A strict layer cake — each layer only depends on the ones below it:

```
APPLICATIONS   identity-server · admin-console · developer-portal
SDK LAYER      react · angular · vue · node · express · python · go · java · dotnet · cli
CORE LAYER     core  (services · models · middleware · adapters · plugins)
SUPPORT LAYER  shared · crypto · oauth · infrastructure (docker/k8s/terraform)
```

- **`@pezhwan/shared`** — framework-independent contracts: identity types,
  error hierarchy, constants, domain/audit events, validators. Zero runtime deps.
- **`@pezhwan/crypto`** — cryptographic primitives: Argon2id, asymmetric JWT +
  keystore, TOTP/OTP, AES-GCM, WebAuthn, plus post-quantum, zero-knowledge, and
  HSM sub-modules.
- **`@pezhwan/oauth`** — OAuth 2.1 / OIDC provider adapters, PKCE, federation
  (SAML, OIDC, OAuth) and SCIM 2.0 provisioning.
- **`@pezhwan/core`** — the auth engine. `createPezhwan(config)` wires 22 service
  singletons (auth, session, mfa, oauth, authorization, audit, rate limit,
  quotas, usage, webhooks, …), 23 Mongoose models, 13 middleware helpers, and
  pluggable email/SMS/payment/storage adapters.
- **Framework SDKs** — facade over the core (`node`, `express`) or REST client
  over the identity server (`react`, `angular`, `vue`, `python`, `go`, `java`,
  `dotnet`, `cli`).
- **Applications** — the reference `identity-server`, plus the `admin-console`
  and `developer-portal` React apps.

## Key runtime concept

`createPezhwan(config)` returns a `PezhwanRuntime` object graph: KeyStore →
cache → TokenService → SessionService → AccountStateService → Authorization →
Audit → MFA/OTP → OAuth/API-key/rate-limit → AuthEngine. Every framework adapter
builds on this single runtime.

## Security posture (summary)

- Argon2id passwords, asymmetric RS256 JWTs + JWKS + key rotation.
- 15-minute access tokens; rotating, one-time-use refresh tokens with reuse →
  family revocation.
- Fail-closed account state (dependency failures surface as 503, not 401).
- Exact-origin CORS, CSRF double-submit, security headers, 100 kb body cap.
- Tenant + application scoping on every token, session, role, and query.

## Where to go next

| Document | Purpose |
| -------- | ------- |
| [`architecture.md`](./architecture.md) | Full deep-dive: system context, package graph, auth/refresh sequences, data model, security layers, scaling, KPIs |
| [`../../docs/ARCHITECTURE.md`](../ARCHITECTURE.md) | Concise architecture & design reference |
| [`data-flow.md`](./data-flow.md) | Authentication data flows |
| [`../../../docs/THREAT-MODEL.md`](../THREAT-MODEL.md) | STRIDE threat model |
| [`multi-tenancy.md`](./multi-tenancy.md) | Multi-tenancy design |
| [`scaling.md`](./scaling.md) | Horizontal scaling guide |
| [`deployment-patterns.md`](./deployment-patterns.md) | Deployment patterns |
| [`diagrams/`](./diagrams/) | PlantUML diagrams (system-overview, auth-flow, deployment) |