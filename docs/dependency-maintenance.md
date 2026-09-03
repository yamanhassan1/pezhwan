# Dependency branch maintenance policy

Dependabot dependency-update branches are temporary maintenance branches. Each
PR is reviewed, tested, and either merged or closed. After merge or closure,
the associated branch is deleted unless there is a documented reason to retain
it. Dependency branches are **not** permanent repository assets.

Dependency updates are not merged in bulk. Security-sensitive and major
updates are reviewed individually for compatibility with the SDK, lockfile,
Node version, build, typecheck, tests, and runtime integrations. A failed or
stale PR is not merged; it is either rebased and retested or closed with its
branch deleted.

## Branch lifecycle

```
DEPENDABOT PR CREATED
         │
         ▼
      REVIEW
         │
         ▼
        CI
         │
         ▼
   LOCAL TESTING
         │
         ▼
SECURITY / COMPATIBILITY CHECK
         │
    ┌────┴────┐
    ▼         ▼
  MERGE     CLOSE
    │         │
    ▼         ▼
DELETE    DELETE
BRANCH    BRANCH
```

The permanent branch is `main`. Every other branch is intentionally created and
expected to be short-lived: merged or closed, then deleted. A branch is retained
only when its PR documents a concrete reason (for example, a major update blocked
pending integration evidence).

## Current review status

### Merged and verified (branches deleted)

- **Argon2 0.45.1** — already applied directly to `main` (PR was closed as
  superseded by that direct upgrade). The argon2 0.45.1 type change
  (`Options` → `HashOptions`) is now on `main`; `npm ci`, build, typecheck, and
  all workspace tests pass. Argon2 is used for password hashing (Argon2id).
- **GitHub Actions** — `actions/checkout` v4→v7, `actions/setup-node` v4→v7,
  `actions/upload-artifact` v4→v7, `gitleaks/gitleaks-action` v2→v3. CI-only,
  supply-chain hardening; no runtime impact.
- **dotenv 17.4.2** — major (v16→v17). The breaking change is limited to a
  runtime informational log line (`quiet` default). Build, typecheck, and all
  workspace tests pass.
- **@types/node 26.4.0** — type check and all tests pass.
- **@types/react 19.2.18** — aligns types with the supported React 19 peer
  dependency; type check and React SDK tests pass.

### Held open and blocked (documented in each PR)

- **Mongoose 8.24.4 → 9.9.4** — major. Typecheck fails in the core package
  (`authorization.service.ts`, `oauth.service.ts`) because Mongoose 9 makes
  query `FilterQuery` stricter and removed `create()` generics. These touch
  PEZHWAN's tenant/application-isolation and RBAC persistence layer. Must not be
  merged until verified against **real MongoDB integration tests**.
- **ioredis 5.11.1 → 6.0.0** — major. Uses RESP3 by default (requires Redis
  6.2+) and changes reply shapes; Pezhwan does not pin the wire protocol. Blocks
  the rate-limiter/session/cache path. Must not be merged until verified against
  **real Redis integration tests**.
- **TypeScript 5.9.3 → 7.0.2** — major toolchain change (native Go port).
  Build fails on `baseUrl` removal (TS5102) across the workspace. Is a
  maintenance/performance upgrade, not a security fix; requires a coordinated
  tsconfig migration and full re-validation.

These three PRs stay **open** with a documented reason and their branches are
rebased onto current `main`. They are not merged until the integration evidence
exists; they are then either merged or closed and their branches deleted.

## Production hardening (reconciled to main)

The previously-preserved auth/OAuth tenant/application boundary hardening has
been rebased onto current `main`, verified (build, typecheck, and all workspace
tests pass), and merged directly into `main` (`bc8ab88`). It is now part of
`main` and the temporary working branch that held it has been deleted.

Work that is not yet ready for `main` is kept on a short-lived working branch
rather than as uncommitted changes and is reconciled onto `main` when reviewed
and verified.
