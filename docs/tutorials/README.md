# PEZHWAN Tutorials

Step-by-step, runnable guides for building real authentication flows on top of
PEZHWAN. Every tutorial uses the actual HTTP surface of the reference identity
server (`docs/OPENAPI.yaml`) and the real `@pezhwan/*` SDK signatures, so the
code below compiles and runs against the current tree.

## Before you start

These three documents give you the vocabulary the tutorials assume:

| Reading | Why you need it |
| --- | --- |
| [`../developer/GETTING-STARTED.md`](../developer/GETTING-STARTED.md) | Install, `.env`, build, seed, and boot the identity server. All tutorials start from a running server. |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | Package layers (`crypto` -> `oauth` -> `core` -> `node`/`express`/`react`) and how the runtime is constructed. |
| [`../OPENAPI.yaml`](../OPENAPI.yaml) | The exact request/response envelope and endpoint list this documentation references. |

Most tutorials can also be run through a self-contained demo in `demos/`. Each
demo is a standalone Express app backed by `@pezhwan/core` (no dependency on
the identity-server app) and documents the SDK-first path.

## The tutorials

| Tutorial | What you build | Reference | Runtime (~) |
| --- | --- | --- | --- |
| [simple-auth.md](./simple-auth.md) | Register, login, bearer auth, refresh, logout | `demos/basic-auth` | 15 min |
| [mfa-setup.md](./mfa-setup.md) | TOTP enrolment, MFA-gated logins, disable | `demos/mfa-demo` | 15 min |
| [oauth-setup.md](./oauth-setup.md) | OAuth 2.1 + PKCE client, token grants, OIDC | `demos/oauth-demo` | 20 min |
| [social-login.md](./social-login.md) | Google/GitHub/etc. adapters + identity linking | `demos/social-login` | 15 min |
| [multi-tenant.md](./multi-tenant.md) | Tenant/Application isolation, quotas, provisioning | `demos/multi-tenant` | 15 min |
| [passkeys.md](./passkeys.md) | WebAuthn passkey registration and authentication | `demos/passkeys` | 20 min |
| [enterprise-sso.md](./enterprise-sso.md) | SAML/OIDC federation, SCIM 2.0 provisioning | `@pezhwan/oauth` federation | 20 min |

## How to read a tutorial

The first three (simple-auth, mfa-setup, oauth-setup) are cumulative — do them
in order. simple-auth introduces the `{ success, data, error }` envelope, the
CSRF double-submit cookie, and the `useAuth` React hooks; later tutorials reuse
those foundations. social-login, multi-tenant, and enterprise-sso assume simple
authentication and can be read in any order. passkeys is self-contained.

Each tutorial ends with a verification section (curl or SDK assertions), a
troubleshooting table for the errors you are most likely to hit with
development defaults, and pointers to the exact source files that implement the
behavior so you can read further.

## Conventions used everywhere

- Base URL / issuer: `http://localhost:4011` (the `PEZHWAN_ISSUER` default).
- All JSON responses use the `{ success, data, error }` envelope, except the
  OAuth/OIDC endpoints (`/v1/oauth/token`, discovery) which follow the OAuth 2.1
  / OIDC wire format.
- State-changing requests from browser clients require the `pezhwan_csrf`
  cookie plus an `X-CSRF-Token` header (see simple-auth, step 3).
- Token lifetimes default to access 15 min, refresh 30 days, session 30 days,
  OTP 5 minutes (`packages/shared/src/constants.ts`).

## Where the code lives

| Concern | Location |
| --- | --- |
| Identity server (reference HTTP host) | `apps/identity-server/src/server.ts` |
| Environment validation | `apps/identity-server/src/config/env.ts` |
| Express middleware + routers | `packages/express/src/` (`routes.ts`, `routes.extra.ts`, `routes.oauth.ts`, `security.ts`) |
| React SDK | `packages/react/src/` (`provider.tsx`, `hooks/`, `components/`) |
| OAuth/OIDC + federation + SCIM | `packages/oauth/src/` |
| Runtime auth engine | `packages/core/src/services/` |
| Account + token defaults | `packages/shared/src/constants.ts` |