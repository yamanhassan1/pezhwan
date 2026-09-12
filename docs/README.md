# PEZHWAN Documentation

Documentation index for the Pezhwan (پېژوان) IAM SDK monorepo. Start here, then
drill into the area that matches what you are doing.

## Getting started

| Doc | Purpose |
| --- | ------- |
| [README](../README.md) | Project overview, quick start, SDK usage |
| [filestructure.md](./filestructure.md) | Complete repository layout and package dependency graph |
| [architecture/overview.md](./architecture/overview.md) | High-level architecture, layers, security posture |
| [OpenAPI 3.0.3 spec](./OPENAPI.yaml) | HTTP surface of the reference identity server |

## Architecture

- [ARCHITECTURE.md](./ARCHITECTURE.md) — concise architecture and design
  reference: the layered package model, functional surface, core flows, data
  model, security layers, operations.
- [architecture/overview.md](./architecture/overview.md) — short high-level
  overview with the layer cake and where to go next.
- [architecture/architecture.md](./architecture/architecture.md) — deep-dive:
  system context, package graph, auth/refresh sequences, data model, security
  layers, scaling, KPIs.
- [architecture/data-flow.md](./architecture/data-flow.md) — authentication
  data flows.
- [architecture/multi-tenancy.md](./architecture/multi-tenancy.md) —
  multi-tenancy design.
- [architecture/scaling.md](./architecture/scaling.md) — horizontal scaling.
- [architecture/deployment-patterns.md](./architecture/deployment-patterns.md)
  — common deployment patterns.
- [architecture/diagrams/](./architecture/diagrams/) — PlantUML diagrams
  (system-overview, auth-flow, deployment).

## Security

- [THREAT-MODEL.md](./THREAT-MODEL.md) — STRIDE threat model for the
  `@pezhwan/*` stack and reference identity server.
- [security/README.md](./security/README.md) — security controls and the
  evidence baseline required before a production deployment.
- [security-audit.md](./security-audit.md) — security review notes and
  remediation tracking.
- [security/](./security/) — key management, auth/session/oauth/multi-tenancy
  security, rate limiting, risk-based auth, secrets management, incident
  response, production hardening, and compliance notes (GDPR, HIPAA, PCI DSS,
  SOC 2, CCPA, ISO 27001, FedRAMP).

## Production readiness and operations

- [PRODUCTION_READINESS.md](../PRODUCTION_READINESS.md) — candid production
  readiness review with a gap-closure log (score 7.5/10 at time of writing).
- [operations/README.md](./operations/README.md) — operational guides:
  backup/restore, disaster recovery, monitoring, logging, multi-region, MFA
  migration, and performance tuning.
- [operations/PRODUCTION_READINESS.md](./operations/PRODUCTION_READINESS.md) —
  deployment evidence checklist.
- [operations/deployment/](./operations/deployment/) — Docker, Kubernetes,
  AWS, Azure, GCP, and on-premise deployment guides.
- [operations/runbooks/](./operations/runbooks/) — runbooks for key rotation,
  tenant/database failover, rate-limit tuning, incident response, security
  breach, zero-downtime deployment, and emergency rollback.

## Developer documentation

- [developer/README.md](./developer/README.md) — developer documentation index.
- [developer/GETTING-STARTED.md](./developer/GETTING-STARTED.md) — getting
  started for SDK users.
- [developer/CONTRIBUTING.md](./developer/CONTRIBUTING.md) — contribution
  guide (repo-local copy of the root guide).
- [developer/local-development.md](./developer/local-development.md) — local
  development setup.
- [developer/testing.md](./developer/testing.md) — how the test suites fit
  together.
- [developer/sdk-development.md](./developer/sdk-development.md) — how to build
  an SDK package.
- [developer/plugin-development.md](./developer/plugin-development.md) —
  plugin system.
- [developer/best-practices.md](./developer/best-practices.md) — coding
  practices.

## API reference

- [api/README.md](./api/README.md) — HTTP API documentation index.
- [api/OPENAPI.yaml](./api/OPENAPI.yaml) — OpenAPI 3.0.3 specification.
- [api/errors.md](./api/errors.md) — error code reference.
- [api/rate-limits.md](./api/rate-limits.md) — rate limiting reference.
- [api/webhooks.md](./api/webhooks.md) — webhook documentation.
- [api/graphql-schema.graphql](./api/graphql-schema.graphql) — GraphQL schema.

## Migrations

- [migration/README.md](./migration/README.md) — migration guide index.
- [migration/auth0-migration.md](./migration/auth0-migration.md),
  [firebase-migration.md](./migration/firebase-migration.md),
  [keycloak-migration.md](./migration/keycloak-migration.md),
  [okta-migration.md](./migration/okta-migration.md),
  [cognito-migration.md](./migration/cognito-migration.md),
  [supabase-migration.md](./migration/supabase-migration.md), and
  [custom-migration.md](./migration/custom-migration.md) — moving from an
  existing IdP to Pezhwan.

## Tutorials

- [tutorials/README.md](./tutorials/README.md) — tutorial index.
- [tutorials/simple-auth.md](./tutorials/simple-auth.md) — password auth.
- [tutorials/mfa-setup.md](./tutorials/mfa-setup.md) — MFA/TOTP setup.
- [tutorials/oauth-setup.md](./tutorials/oauth-setup.md) — OAuth/OIDC setup.
- [tutorials/social-login.md](./tutorials/social-login.md) — social login.
- [tutorials/passkeys.md](./tutorials/passkeys.md) — passkeys/WebAuthn.
- [tutorials/multi-tenant.md](./tutorials/multi-tenant.md) — multi-tenant apps.
- [tutorials/enterprise-sso.md](./tutorials/enterprise-sso.md) — enterprise SSO.

## Project records

- [PHASE-A.md](./PHASE-A.md) — Phase A build record and architecture.
- [PHASE-B.md](./PHASE-B.md) — Phase B milestone and engineering notes.
- [PHASE-C.md](./PHASE-C.md) — Phase C milestone and engineering notes.
- [dependency-maintenance.md](./dependency-maintenance.md) — dependency branch
  lifecycle and current update status.
- [../problems.md](../problems.md) — known problems and fixes (historical and
  current caveats).
- [PROMPT.md](./PROMPT.md) — monorepo construction notes.

## Contributing

Community and contribution documents live at the repository root:

- [CONTRIBUTING.md](../CONTRIBUTING.md) — setup, build/test commands, commit
  conventions, PR process.
- [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) — community standards.
- [SECURITY.md](../SECURITY.md) — security policy and vulnerability reporting.
- [SUPPORT.md](../SUPPORT.md) — where to get help and the version support
  matrix.