# Contributing to PEZHWAN

Thank you for your interest in Pezhwan (پېژوان), a universal Identity & Access
Management (IAM) SDK. This guide explains how to set up a working development
environment, how the monorepo is organized, and the standards every contribution
must meet.

Please also read:

- [Code of Conduct](./CODE_OF_CONDUCT.md) — how we treat each other
- [README.md](./README.md) — project overview and quick start
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — architecture and package
  relationships
- [docs/filestructure.md](./docs/filestructure.md) — full repository layout

## Table of contents

- [Prerequisites](#prerequisites)
- [Initial setup](#initial-setup)
- [Monorepo layout](#monorepo-layout)
- [Building and validating](#building-and-validating)
- [Testing](#testing)
- [Git hooks](#git-hooks)
- [Commit message conventions](#commit-message-conventions)
- [Branch naming](#branch-naming)
- [Opening a pull request](#opening-a-pull-request)
- [Adding a new package](#adding-a-new-package)
- [Adding a database migration](#adding-a-database-migration)
- [Adding documentation](#adding-documentation)
- [Security scanning](#security-scanning)
- [Dependency policy](#dependency-policy)
- [Code style](#code-style)

## Prerequisites

- Node.js **>= 20** (the workspace `engines` field enforces this)
- npm (npm workspaces are used throughout)
- git

MongoDB and Redis are only required for integration and load tests. For most
development the test suites use in-process MongoDB (`mongodb-memory-server`), and
the runtime degrades Redis to an in-memory cache when Redis is absent.

## Initial setup

```bash
# 1. Install all workspace dependencies
npm install

# 2. Install git hooks and finish bootstrap
npm run setup

# 3. Copy the environment template (never commit .env)
cp .env.example .env

# 4. Edit .env and fill in required values (issuer, tenant, application)
# 5. Build all packages
npm run build
```

`npm run setup` runs `scripts/install-hooks.mjs`, which installs the
pre-commit secret-scan hook into your local `.git/hooks`.

To start the reference identity server after building:

```bash
npm run dev -w @pezhwan/identity-server
```

It listens on `http://localhost:4011` by default.

## Monorepo layout

The repository is a set of npm workspaces (`packages/*` and `apps/*`) with a
strict, one-way dependency layering. Lower layers never know about higher ones.

| Area                    | Contents                                                        |
| ----------------------- | --------------------------------------------------------------- |
| `packages/shared`       | Types, constants, error classes, validators (zero runtime deps) |
| `packages/crypto`       | Argon2id, JWT + JWKS, key rotation, OTP/TOTP, encryption        |
| `packages/oauth`        | OAuth 2.1 / OIDC flows, PKCE, federation, SCIM                  |
| `packages/core`         | Auth engine, domain models, services (sessions, RBAC, MFA, ...) |
| `packages/node`         | Node.js SDK facade over core                                    |
| `packages/express`      | Express middleware, routers, security helpers                   |
| `packages/react`        | React provider, hooks, route guards                             |
| `packages/angular`      | Angular SDK (module, service, guard, interceptor)               |
| `packages/vue`          | Vue SDK (plugin, composables, components)                       |
| `packages/python        | go                                                              | java | dotnet | cli` | Language SDKs and CLI tool |
| `apps/identity-server`  | Reference identity server                                       |
| `apps/admin-console`    | React admin UI                                                  |
| `apps/developer-portal` | React developer portal                                          |
| `infrastructure/`       | Docker, Kubernetes/Helm, Terraform, scripts                     |
| `tests/`                | Cross-cutting unit, security, failure, interop, integration     |
| `migrations/`           | Numbered database migrations                                    |
| `scripts/`              | Secret scan, seed, backup/restore drills, release tooling       |
| `docs/`                 | Documentation (see `docs/README.md`)                            |
| `demos/`, `templates/`  | Demo applications and app templates                             |

## Building and validating

| Command                 | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `npm run build`         | Builds all packages in dependency order                   |
| `npm run typecheck`     | Type-checks every workspace (`--workspaces --if-present`) |
| `npm run lint`          | Runs ESLint on the repository                             |
| `npm run lint:fix`      | Runs ESLint and applies fixes                             |
| `npm run format:check`  | Checks formatting with Prettier                           |
| `npm run format`        | Writes Prettier formatting                                |
| `npm run license:check` | Fails on copyleft licenses in the dependency tree         |
| `npm run sbom`          | Generates a CycloneDX software bill of materials          |

Run `npm run build` and `npm run typecheck` before opening a PR. CI runs build,
typecheck, lint, format check, workspace tests, license check, and the secret
scanner (see `.github/workflows/ci.yml`).

## Testing

The repository keeps its test suites under `tests/`. Each test suite has a
dedicated root script:

| Command                       | Suite                                               |
| ----------------------------- | --------------------------------------------------- |
| `npm run test:unit`           | Unit tests (`tests/unit/*.test.ts`)                 |
| `npm run test:security-suite` | Security tests (`tests/security/*.test.ts`)         |
| `npm run test:failure`        | Failure-injection tests (`tests/failure/*.test.ts`) |
| `npm run test:interop`        | Interoperability tests (`tests/interop/*.test.ts`)  |
| `npm run test:root`           | Unit + security + failure + interop in sequence     |
| `npm run test:integration`    | Integration tests (requires build + MongoDB/Redis)  |
| `npm run test:load`           | Load tests (requires a running server)              |
| `npm run test:coverage`       | Combined suites with coverage report                |

`npm test` builds the workspace and runs every package's own test script.

## Git hooks

Hooks live in `.husky/` and are installed by `npm run setup`:

| Hook         | Purpose                                                     |
| ------------ | ----------------------------------------------------------- |
| `pre-commit` | Runs the secret scanner (`scripts/secret-scan.mjs`); blocks |
|              | commits that stage obvious secrets                          |
| `pre-push`   | Runs the test suite before pushing                          |
| `commit-msg` | Validates the commit message                                |

Commit messages are validated against commitlint using the rules declared in
`.commitlintrc.json` at the repository root. If a message does not conform, the
commit is rejected with a message explaining the violation.

## Commit message conventions

Pezhwan uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

| Type       | Use for                                    |
| ---------- | ------------------------------------------ |
| `feat`     | A new user-facing capability               |
| `fix`      | A bug fix                                  |
| `docs`     | Documentation only                         |
| `test`     | Adding or correcting tests                 |
| `refactor` | Code change with no behavioral change      |
| `perf`     | Performance improvement                    |
| `chore`    | Tooling, dependencies, and maintenance     |
| `ci`       | Continuous integration changes             |
| `style`    | Formatting, whitespace, missing semicolons |
| `build`    | Build system or dependency changes         |

Use a scope when it is useful: `feat(core): ...`, `fix(express): ...`,
`chore(ci): ...`. Examples from this repository:

```
feat(core): multi-region active-active routing and global session
fix(core): make ChainSecretProvider.getOptionalSecret honour its contract
docs: document delivered security phase and keep a changelog
```

## Branch naming

`main` is the permanent branch. All other branches must be short-lived and are
created from `main`:

```
feat/<short-slug>
fix/<short-slug>
docs/<short-slug>
chore/<short-slug>
```

Dependabot dependency branches use the form
`dependabot/npm_and_yarn/<package>-<version>` and are deleted after their PR is
merged or closed (see [Dependency policy](#dependency-policy)).

## Opening a pull request

1. Create a branch from `main` (see naming above).
2. Make your changes, keeping commits small and individually meaningful.
3. Run the local gates: `npm run build`, `npm run typecheck`, `npm run lint`,
   `npm run format:check`, and the relevant test suites.
4. Open a PR against `main` and fill out the
   [pull request template](.github/PULL_REQUEST_TEMPLATE.md).
5. Reviewers are assigned according to `.github/CODEOWNERS`.

CI runs the full quality gate on every push and PR: build, typecheck, lint,
format check, workspace tests, license audit, secret scanning (Pezhwan scanner
and Gitleaks), and Docker Compose validation.

## Adding a new package

To add an SDK package under `packages/`:

1. Create `packages/<name>/` with a `package.json` (name scoped as
   `@pezhwan/<name>`), a `tsconfig.json` that extends `tsconfig.base.json`, and a
   `src/` directory.
2. Because `packages/*` is an npm workspace glob, npm picks the package up
   automatically — no workspace list edit is required.
3. Add the build step to the `build` script in the root `package.json`, which
   lists each workspace build explicitly.
4. Wire the build/typecheck/test scripts in the new package's `package.json`
   using `npm run ... --workspaces --if-present`.
5. Document the package in the layout tables of `README.md`,
   `docs/filestructure.md`, and `docs/ARCHITECTURE.md`, plus any relevant
   section in `docs/developer/`.

## Adding a database migration

Migrations live in `migrations/` and follow the pattern
`NNN-kebab-case-name.ts` (for example `001-initial-schema.ts`,
`010-add-risk-events.ts`).

- `migrations/migration-runner.ts` discovers numbered files, applies them in
  numeric order, and records each in the `_migrations` collection so a migration
  runs exactly once.
- A migration exports an async `up()` function or performs its work as a module
  side effect at import time.
- Destructive or irreversible changes ship a manual rollback script in
  `migrations/rollback/` with the `-rollback.ts` suffix.

Migrate by building first and then running the runner:

```bash
node dist/migrations/migration-runner.js up
node dist/migrations/migration-runner.js status
```

See `migrations/README.md` for full conventions and the special handling of the
MFA legacy-secret encryption migration.

## Adding documentation

Documentation lives in `docs/`. Directory landing pages:

- `docs/README.md` — documentation index (update it when you add a doc area)
- `docs/architecture/` — architecture and data flow
- `docs/security/` — security controls and hardening
- `docs/operations/` — operational guides and runbooks
- `docs/developer/` — local development and SDK guidance
- `docs/api/` — HTTP API reference
- `docs/migration/` — migration guides from other IdPs
- `docs/tutorials/` — step-by-step tutorials

Use relative links between documents, keep prose to roughly 80 columns, and
follow the same professional tone as the rest of the documentation.

## Security scanning

Security is a first-class concern for Pezhwan.

- `npm run test:security` runs `scripts/secret-scan.mjs --ci` across the
  repository and fails on obvious secrets. The same scanner runs in the
  pre-commit hook.
- `npm run test:security-suite` runs the attack-oriented suite under
  `tests/security/` (token attacks, CSRF, CORS, rate-limit attacks, injection).
- CI adds a Gitleaks scan and CodeQL analysis on top.

Never commit real credentials, signing keys, or `.env` files. Report discovered
vulnerabilities through `SECURITY.md`, never as a public issue.

## Dependency policy

Dependency updates are handled through Dependabot PRs and are reviewed
individually — never bulk-merged. Security-sensitive and major updates must
pass the build, typecheck, tests, and integration checks for the path they
touch before they are merged. Blocked-modern majors (for example Mongoose,
ioredis, TypeScript) are tracked with a documented reason.

Full policy and current status: [docs/dependency-maintenance.md](./docs/dependency-maintenance.md).

## Code style

- TypeScript is compiled against a strict shared base
  (`tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, ES2022 target).
- The repository is ESM (`"type": "module"` at the root).
- Formatting is enforced by Prettier (`.prettierrc`: single quotes, semicolons,
  trailing commas, 2-space indent, 100-column print width).
- Linting is enforced by ESLint (flat config `eslint.config.mjs`).

`npm run format` and `npm run lint:fix` can correct most issues automatically;
run `npm run format:check` and `npm run lint` to verify before pushing.

## License

By contributing you agree that your contributions are provided under the terms
of the repository license. See `LICENSE`.
