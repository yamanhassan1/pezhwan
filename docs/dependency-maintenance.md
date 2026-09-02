# Dependency branch maintenance policy

Dependabot dependency-update branches are temporary maintenance branches. Each
pull request must be reviewed, tested, and either merged or closed. After
merge or closure, the associated branch should be deleted unless there is a
documented reason to retain it.

Dependency updates are not merged in bulk. Security-sensitive and major
updates are reviewed individually for compatibility with the SDK, lockfile,
Node version, build, typecheck, tests, and runtime integrations. A failed or
stale pull request is not merged; it is either rebased and retested or closed
with its branch deleted.

## Current review status

- Argon2 0.45.1 is compatible after importing its named `Options` type.
  Main-checkout validation passed: `npm ci`, build, typecheck, crypto tests
  (8/8), and core tests (28/28). The existing Dependabot PR remains stale and
  should be recreated or rebased before merging.
- dotenv 17 passed local build, typecheck, and workspace tests, but its
  Dependabot PR is also based on stale main and must be refreshed.
- Mongoose 9 and ioredis 6 remain blocked pending real MongoDB and Redis
  integration evidence.
- TypeScript, type-definition, and GitHub Actions updates remain lower
  priority and must be refreshed against current main before review.

The permanent branch is `main`. The repository currently retains open
Dependabot branches only because each represents a unique, unreviewed
dependency update. They are proposals under review, not permanent repository
assets.
