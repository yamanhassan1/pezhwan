# SDK Package Development

This guide explains the conventions for adding a new SDK package or extending
an existing one in the Pezhwan monorepo. Follow the pattern exactly — consumers
and the build pipeline depend on it.

## Workspace conventions

- Every SDK lives under `packages/<name>` and is declared in the root
  `package.json` `workspaces` field (`"packages/*", "apps/*"`).
- npm workspaces hoist dependencies to the root `node_modules`; `npm install`
  at the root installs every package in one pass.
- Package names: in-repo TypeScript packages use the `@pezhwan/*` scope
  (`@pezhwan/core`, `@pezhwan/react`, ...). Zero-dependency client packages
  that are not compiled in the workspace (Python, Go, Java, .NET) live in the
  same `packages/` directory as `pezhwan`/`Pezhwan` named projects and are
  documented by their own READMEs.

## `package.json` pattern

Use `@pezhwan/node` as the canonical template:

```jsonc
{
  "name": "@pezhwan/node",
  "version": "0.1.0",
  "description": "Pezhwan Node.js SDK — ...",
  "private": true,                     // private until the package is published
  "type": "module",                    // ESM everywhere
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "node --test"
  },
  "engines": { "node": ">=20" },
  "dependencies": { "@pezhwan/shared": "*" }
}
```

Rules:

- `"type": "module"` and the `exports` map with `types` + `import` conditions.
- **Internal workspaces are pinned with `"*"`** — `"@pezhwan/core": "*"` —
  so the workspace resolver always uses the local source-built `dist/`. Never
  use semver ranges for in-repo dependencies.
- Framework packages declare `peerDependencies` for the host framework
  (`express` in `@pezhwan/express`; `react`/`react-dom` in `@pezhwan/react`;
  `vue` in `@pezhwan/vue`) and keep the Pezhwan deps in `dependencies`.
- A package that provides a CLI adds `"bin": { "pezhwan": "./bin/pezhwan" }`.

## `tsconfig.json`

Every TypeScript package extends the shared base and emits to `./dist`:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

`tsconfig.base.json` sets `module: "Node16"`, `strict: true`, declaration +
source maps, `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`
(that is why sources import `./x.ts` and emit `./x.js`), and
`noUncheckedIndexedAccess`.

## Depending on another internal package

Import the **package name**, never a relative path:

```ts
import { createPezhwan } from '@pezhwan/core';
import { AuthenticationError } from '@pezhwan/shared';
```

The compiler resolves these to `node_modules/@pezhwan/core/dist/index.d.ts`
(hoisted by workspaces). The dependency must therefore be **built first** —
see the build order in `local-development.md`
(`shared → crypto → oauth → core → node → express → react → …`).

## Where tests live

- Package-level tests live under `packages/<name>/src/__tests__/` or
  `packages/<name>/test/` and run with the package's `npm test`
  (`node --test`). `@pezhwan/core` demonstrates the dual-source-and-compiled
  pattern: the same suite runs from `src/` and `dist/`, and both must pass.
- Cross-cutting root suites (unit/security/failure/interop/integration/load)
  live under `tests/` and are documented in [`testing.md`](./testing.md).
- Frontend SDK packages use the same `node --test` script but keep DOM
  coupling out of the unit tests; browser behaviour is covered by the demos and
  root interop suite.

## README requirement

Every package must ship a README describing, at minimum: install command,
minimal quick-start (using the package name, not relative paths), the exported
surface, and any peer-dependency setup. Match the style of the existing package
READMEs. `npm run license:check` and CI rely on the package metadata being
complete (`name`, `version`, `license`, `description`).

## Publishing notes

- All packages currently set `"private": true`; publishing is a deliberate,
  per-package decision coordinated through `scripts/release.mjs`. When you take
  a package public: remove `private`, keep the `exports` map and `files:
  ["dist"]`, build before packing, and verify `npm pack --dry-run` ships only
  `dist/` + README + LICENSE.
- For non-TypeScript clients (Python/Go/Java/.NET), the publishing channel is
  the platform registry (PyPI, Go modules, Maven, NuGet); keep them
  zero-dependency so the published artifact matches the repo layout exactly.
- After bumping a package version, update dependent packages' `"*"` internal
  pins are already handled by the workspace resolver — no range edits needed.