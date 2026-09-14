# Contributing to PEZHWAN

The canonical contribution guide lives at the repository root:
**[CONTRIBUTING.md](../../CONTRIBUTING.md)**.

This file is only a pointer so contributor onboarding is not duplicated here.

## Key points in brief

- **Setup:** Node.js 24+, npm workspaces; install with `npm install` and build
  with `npm run build` from the repo root.
- **Git hooks:** Husky-managed pre-commit hooks run lint and format checks.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`,
  `chore:`, ...); branch names follow the patterns in the root guide.
- **PR process:** open a PR against `main`; keep changes scoped, add tests, and
  make sure all workspace tests pass.
- **New packages / migrations / docs:** each has a dedicated section in the
  root guide.

## Further reading

- [GETTING-STARTED.md](./GETTING-STARTED.md) — environment setup and first run.
- [API reference](../api/README.md) — SDK and server endpoints.
