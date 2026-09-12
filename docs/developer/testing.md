# Testing

Pezhwan uses the Node.js built-in test runner (`node --test`, `node:test`) with
`node:assert/strict` — no Jest/Mocha dependency. Suites live at the repo root
under `tests/`, plus per-package `*.test.ts` files inside each workspace.

## Test runner

```bash
node --test tests/unit/*.test.ts
```

Tests are plain TypeScript files executed directly (Node 20+ type-strips them).
They import the **built** packages (`@pezhwan/core`, `@pezhwan/shared`,
`@pezhwan/crypto`), so **run `npm run build` before a test run** whenever you
have changed package sources — the root test scripts do this for the
integration and load suites.

## Suites and commands (root `package.json`)

| Command | Suite | Covers |
| --- | --- | --- |
| `npm run test:unit` | `tests/unit/` | Pure logic with no DB: auth primitives, password policy, RBAC, OAuth, SAML, SCIM, audit, rate-limit, crypto, backstop invariants. |
| `npm run test:security-suite` | `tests/security/` | Attack simulations: brute force, CORS, CSRF, injection, token attacks, session theft, tenant escape, privilege escalation. |
| `npm run test:failure` | `tests/failure/` | Degraded infrastructure: Mongo/Redis failure, clock skew, disk full, HSM failure, key corruption, provider failure. |
| `npm run test:interop` | `tests/interop/` | Third-party interop: Google/GitHub/Microsoft OAuth, Okta/Azure SAML, Okta/Azure SCIM. |
| `npm run test:integration` | `tests/integration/` | Real routers against `mongodb-memory-server`: auth flow, refresh rotation, sessions, MFA, OAuth, SAML, SCIM, ABAC, event sourcing, webhooks, admin API. |
| `npm run test:load` | `tests/load/*.load.js` | Plain JS throughput scripts: auth, register, refresh, sessions, OTP, TOTP, key rotation, mixed, audit. |
| `npm run test:security` | — | `scripts/secret-scan.mjs --ci` — secret scan only. |
| `npm run test:coverage` | all suites | Runs unit + security + failure + interop + integration with `--experimental-test-coverage`. |
| `npm run test` | — | `npm run build` then every workspace's own `test` script. |
| `npm run test:root` | — | `unit` + `security-suite` + `failure` + `interop` (fast, no DB). |

Individual workspace packages also expose `npm test` (`node --test`), which
discovers `*.test.ts` in `src/` and `test/` plus their compiled `dist/`
copies — `@pezhwan/core`, for example, intentionally runs the same suite twice
(source and compiled) and both must pass.

## Writing a test

A unit test (from `tests/unit/auth.test.ts`):

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPezhwan } from '@pezhwan/core';

const runtime = createPezhwan({
  tenantId: 'tenant-a',
  applicationId: 'app-a',
  issuer: 'https://issuer.pezhwan.test',
  audience: 'https://api.pezhwan.test',
  otpDelivery: {},
});

test('register rejects a non-compliant password', async () => {
  await assert.rejects(
    runtime.auth.register({ email: 'a@b.dev', password: 'weak' }),
    (err) => (err as { code?: string }).code === 'VALIDATION_FAILED',
  );
});
```

An integration test boots a transient MongoDB and drives the real routers:

```ts
import { before, after, beforeEach, test } from 'node:test';
import {
  startMongoReplSet,
  cleanMongo,
  stopMongo,
  rejectsCode,
} from './helpers/index.ts';

before(() => startMongoReplSet());
beforeEach(() => cleanMongo());
after(() => stopMongo());
```

## Test helpers

`tests/integration/helpers/`:

| Helper | Purpose |
| --- | --- |
| `mongo.ts` | `startMongo()` (single `mongodb-memory-server`), `startMongoReplSet()` (single-node replica set for transaction tests, e.g. atomic refresh rotation), `cleanMongo()` (wipes collections between cases), `stopMongo()`. One in-memory server per test file. |
| `assertions.ts` | `rejectsCode(promise, code)` — asserts a promise rejected with a `PezhwanError` carrying the exact error code; `rejectsAnyPezhwanError(promise)` for code-agnostic checks. |

`tests/fixtures/` holds non-code fixtures (for example the SAML response XML
used by interop tests).

## Coverage

```bash
npm run test:coverage
```

Uses Node's built-in `--experimental-test-coverage`. The suites assert security
invariants directly (no wildcard CORS, CSRF rejection, fail-closed auth, no
secret logging), so coverage numbers are a signal rather than a gate —
prioritise keeping the backstop suites green.

## CI

- `.github/workflows/ci.yml` — on every push/PR: build, typecheck, lint,
  `format:check`, workspace tests (`npm test`), and licence audit, plus secret
  scanning (`scripts/secret-scan.mjs --ci` and Gitleaks).
- `.github/workflows/security.yml` — secret scan + Gitleaks, `npm audit`
  (fail on high/critical), typecheck + `npm test`, and the integration suite
  (`npm run test:integration`) against a live `mongodb-memory-server`,
  generating and uploading an SBOM.
- A nightly schedule drives the long suites (see `.github/workflows/nightly.yml`).
- Locally you can replicate the fast gate with:
  ```bash
  npm run setup          # pre-commit secret scan
  npm run test:root      # fast, DB-free suites
  npm test               # + workspace package suites
  npm run test:integration
  ```