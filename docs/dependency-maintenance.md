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

The permanent branch is `main`. The repository currently retains open
Dependabot branches only because each represents a unique, unreviewed
dependency update. They are proposals under review, not permanent repository
assets.
