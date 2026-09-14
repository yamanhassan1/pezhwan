# PEZHWAN Developer Documentation

This directory is the entry point for developers working **on** the Pezhwan
codebase — writing code, adding SDK packages, running tests, and debugging the
identity stack. If you are integrating Pezhwan into your own application, start
with the package READMEs under `packages/*/` and the tutorials under
`docs/tutorials/` instead.

## Quick start

- [`GETTING-STARTED.md`](./GETTING-STARTED.md) — zero-to-running: clone,
  configure, build, and boot the identity server for the first time.
- [`local-development.md`](./local-development.md) — the everyday dev loop:
  workspace build order, watch mode, Docker infrastructure, and demos.

## Within this directory

| Document                                           | Purpose                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| [`GETTING-STARTED.md`](./GETTING-STARTED.md)       | Install, configure, and run Pezhwan locally.                          |
| [`local-development.md`](./local-development.md)   | Dev loop, build order, infrastructure, and common pitfalls.           |
| [`testing.md`](./testing.md)                       | Test runner, suites, exact commands, coverage, and CI.                |
| [`debugging.md`](./debugging.md)                   | Logging, request IDs, debugger configs, and common error codes.       |
| [`plugin-development.md`](./plugin-development.md) | The plugin system: hooks, loader, manager, and manifests.             |
| [`sdk-development.md`](./sdk-development.md)       | How to add or extend an SDK package in the monorepo.                  |
| [`api-client.md`](./api-client.md)                 | Calling the Pezhwan HTTP API: envelope, auth, endpoints, curl.        |
| [`best-practices.md`](./best-practices.md)         | Security, multi-tenancy, session hygiene, and observability guidance. |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md)             | Contribution workflow and quality gates.                              |

## Related documentation

- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — package graph, runtime object
  graph, core flows, and the security model.
- [`docs/architecture/`](../architecture/) — deep-dives: overview, data flow,
  multi-tenancy, scaling, and deployment patterns.
- [`docs/api/`](../api/) — HTTP contract details: `errors.md`, `rate-limits.md`,
  `webhooks.md`, and the source-of-truth `OPENAPI.yaml`.
- [`docs/security/`](../security/) — threat model, authentication/session/OAuth
  security, production hardening, and compliance.
- [`docs/operations/`](../operations/) — runbooks: backup/restore, monitoring,
  logging, disaster recovery, MFA migration.
- [`docs/tutorials/`](../tutorials/) — task-oriented integration guides
  (simple auth, MFA setup, OAuth, SSO, passkeys).
- [`docs/migration/`](../migration/) — migration guides from other identity
  providers into Pezhwan.
- [Root `README.md`](../../README.md) — quick start and SDK usage examples.
- [`tests/README.md`](../../tests/README.md) — test suite index and harness
  contracts.
- [`migrations/README.md`](../../migrations/README.md) — database migration
  conventions and the migration runner.
- [`.env.example`](../../.env.example) — the safe environment template.

## Conventions that apply everywhere

- Package code is TypeScript (ESM, `Node16` resolution), built with `tsc` from
  `tsconfig.base.json` into `packages/*/dist/`. Consume the built output, never
  the sources.
- All environment variables are validated in
  `apps/identity-server/src/config/env.ts` (Zod). Never read `process.env`
  directly anywhere else.
- Passwords, tokens, OTP codes, and client secrets are never logged; the
  structured logger redacts them.
- Every successful HTTP response uses the `{ success: true, data }` envelope;
  failures use `{ success: false, error: { code, message, requestId } }`.
