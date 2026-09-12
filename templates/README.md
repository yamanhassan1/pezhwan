# PEZHWAN Starter Templates

Five opinionated starter projects that show how a fresh application wires into
the PEZHWAN identity platform. Each template is a minimal, self-contained
scaffold in its own directory under `templates/`, focused on one framework so
you can copy it out and build on it.

```
templates/
├── react-spa/     Vite + React single-page app
├── nextjs/        Next.js App Router with NextAuth-compatible flow
├── vue/           Vue 3 + Vite
├── angular/       Angular (modules + guards/services)
└── express-api/   Express REST API with auth middleware
```
## Picking a template

| You are building…                                | Use              |
| ------------------------------------------------ | ---------------- |
| A browser SPA with a build step, minimal config  | `react-spa`      |
| A Next.js app (App Router, SSR, middleware)      | `nextjs`         |
| A Vue 3 application                              | `vue`            |
| A structured Angular enterprise application      | `angular`        |
| A Node/Express REST API with protected routes    | `express-api`    |

Browser templates authenticate against the identity server over `/v1/auth/*`
and protect routes client-side; the `express-api` template does the same
server-side with middleware.

## Template layout at a glance

The scaffold files below are the seams you fill in with your application code:

- **react-spa** — `src/App.tsx`, `src/main.tsx`, `vite.config.ts` (dev proxy
  for `/v1` to the identity server).
- **nextjs** — App Router: `src/app/api/auth/[...nextauth]/route.ts`,
  `src/app/login/page.tsx`, `dashboard/page.tsx`, `profile/page.tsx`, plus
  `src/lib/pezhwan.ts`, `src/components/AuthProvider.tsx`,
  `ProtectedRoute.tsx`, `Navbar.tsx`.
- **vue** — `src/App.vue`, `src/main.ts`, `src/plugins/pezhwan.ts` (Vue plugin
  that exposes the auth client), `index.html`.
- **angular** — `src/app/app.module.ts`, `src/app/auth/auth.guard.ts`,
  `src/app/auth/auth.service.ts`, `src/app/shared/pezhwan/pezhwan.module.ts`.
- **express-api** — `server.ts`, `routes/auth.ts`, `middleware/auth.ts`,
  `models/user.ts`, `tsconfig.json`.

## Common setup

1. Start the identity server from the repository root:

   ```bash
   npm install
   npm run seed   # bootstrap tenant, application, and ADMIN role
   npm run dev -w @pezhwan/identity-server
   ```

   The server is at `http://localhost:4011`.

2. Point the template at the server: browser templates use a Vite dev proxy or
   an `API_URL`/`VITE_API_URL` env variable, the API template `PEZHWAN_ISSUER`.
   See the template's config file for the exact wiring.

3. Sign in with a user that holds the role your template's guards require (the
   bootstrapped admin user is convenient), then build your app on top.

4. To use a template standalone, copy its directory out of the monorepo, drop
   any workspace references, and `npm install` as usual.

## Documentation and tutorials

- `docs/ARCHITECTURE.md`, `docs/OPENAPI.yaml` — architecture and HTTP surface
- `docs/tutorials/` — `simple-auth.md`, `mfa-setup.md`, `multi-tenant.md`,
  `oauth-setup.md`, `enterprise-sso.md`, `social-login.md`, `passkeys.md`
- `packages/react/` + `packages/express/` — browser provider/guards and server middleware

## Status

The templates are starter scaffolds: file layout, entry points, and integration
seams are in place, ready for your own UI and application logic. They are
reference material, not published framework packages.