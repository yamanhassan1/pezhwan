# @pezhwan/core

Pezhwan core domain. Single source of truth for engines, models, services,
middleware, adapters, and plugins that make up the Pezhwan identity platform.

> Part of the Pezhwan monorepo. Builds via `npm run build` from the workspace
> root (`tsc -p tsconfig.json` → `dist/`). Workspace-internal consumers import
> the built package (`@pezhwan/core`), never the sources.

## Layout

| Path | Purpose |
| --- | --- |
| `src/auth/` | Boot + engine composites (`createPezhwan`, `auth.engine.ts`). |
| `src/models/` | Mongoose models for users, tenants, clients, sessions, audit, subscriptions, webhooks, ... |
| `src/services/` | Flat + namespaced domain services (auth, session, oauth, audit, authorization, security, compliance, events, observability, infrastructure, tenant, ecosystem, developer). |
| `src/middleware/` | Frame-agnostic ready-to-wire middleware (auth, CORS, CSRF, tenant, rate-limit, risk, trust-device, security headers, ...). |
| `src/adapters/` | External integrations: payment (Stripe/Paddle/Chargebee) and storage (S3/Azure Blob/GCS). |
| `src/config/` | Environment parsing and configuration validation. |
| `src/plugins/` | Hooks registry, plugin loader, and plugin lifecycle manager. |
| `src/__tests__/` | Fixtures + integration tests (DB-free; compose real services). |

## Design invariants

- User, tenant, and OAuth client secrets are NEVER stored raw — only SHA-256
  (or Argon2id for passwords).
- Access tokens are minimal RS256 JWTs; refresh tokens are opaque, hashed, and
  rotated. Validation always re-checks account state (fail closed).
- Tenant isolation is explicit: every tenant-scoped query flows through a
  `tenantId`; middleware never trusts the client for tenant selection.
- Authorization is delegated to the RBAC `AuthorizationService` / optional
  ABAC/expression policy engines; roles/permissions are never derived from the
  client.
- Events are append-only via the event store; projections replay streams,
  never mutate the source of truth.

## Testing

Core tests are DB-free by design (see `src/__tests__/integration/` for the
patterns — in-memory trust stores, pre-seeded caches, injected backends).
Run from this package:

```sh
npm test
```

The test script discovers `*.test.ts` in `src/` and `test/` directly, plus the
compiled `dist/` copies, so the same suite runs twice — both must pass.