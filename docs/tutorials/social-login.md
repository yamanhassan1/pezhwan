# Social login

Let users sign in with Google, GitHub, Microsoft, Apple, Facebook, or any
OIDC/OAuth provider, then link those external identities to a Pezhwan user. This
tutorial covers the provider adapters in `@pezhwan/oauth`, the identity
resolution/linking built on `FederatedIdentityService`, and a simulated Google
IdP flow you can run locally (`demos/social-login/`).

## Prerequisites

- A running runtime / identity server, and a user who can reach a callback URL.
- OAuth credentials (client id/secret) from the provider you target
  (`demos/social-login` uses a simulated IdP so no external account is needed).

## 1. Provider adapters

`packages/oauth/src/providers/` implements the `OAuthProviderAdapter` interface
(authorization-URL builder + authorization-code exchange + normalized profile):

| Provider | Adapter | Notes |
| --- | --- | --- |
| Google | `GoogleProvider` | OIDC via Google's discovery; id_token carries the profile. |
| GitHub | `GitHubProvider` | OAuth2, no id_token; profile from `GET /user` (+ `user:email` scope). |
| Microsoft (Entra) | `MicrosoftProvider` | OIDC; `tenant` option (`common` or a tenanted endpoint). |
| Apple | `AppleProvider` | OIDC; requires client_secret anyway. |
| Facebook | `FacebookProvider` | OAuth2 via `BaseOAuthProvider`; Graph API userinfo. |
| Custom | `CustomProvider` | Point at any RFC 6749 endpoints; `profileResolver` or id_token claim mapping. |

Each returns a normalized `ProviderProfile`:
`{ subject, email?, emailVerified?, name?, picture?, raw }`.

## 2. Configure credentials

Construct adapters with your provider credentials:

```ts
import { GoogleProvider, GitHubProvider, MicrosoftProvider } from '@pezhwan/oauth';

const google = new GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  redirectUri: 'http://localhost:5179/social/callback',
});
```

Microsoft's adds a `tenant` option; Apple works with `clientId`/`clientSecret`
and uses `scope` "name email". Refer to each `*.ts` file for the exact options
object.

## 3. Build a registry

Bundle adapters into a `ProviderRegistry`; `createBuiltinRegistry` is a
convenience wrapper:

```ts
import { createBuiltinRegistry, ProviderRegistry } from '@pezhwan/oauth';

const registry: ProviderRegistry = createBuiltinRegistry([google, github, microsoft]);
```

The `OAuthFederationService` (`packages/oauth/src/federation/oauth-federation.ts`)
uses a registry plus three hooks you supply — `findUserByIdentity`,
`createUserFromProfile`, and `linkIdentity` — to turn a provider callback into a
local identity:

```ts
const federation = new OAuthFederationService({
  registry,
  findUserByIdentity: async (provider, subject) =>
    await feds.findByProvider(TENANT_ID, provider, subject),   // UserDoc | null
  createUserFromProfile: async (profile) => { /* UserModel.create(...) */ },
  linkIdentity: async (userId, provider, subject, profile) => { /* link  */ },
});
```

## 4. Resolve-or-link with FederatedIdentityService

`FederatedIdentityService` (`packages/core/src/services/oauth/federated.service.ts`)
owns the identity model and is what `demos/social-login/server.ts` uses:

```ts
import { FederatedIdentityService } from '@pezhwan/core';

const feds = new FederatedIdentityService();

// Existing subscriber → existing user; otherwise auto-provision on the email.
const resolved = await feds.resolve({
  tenantId: TENANT_ID,
  provider: 'google',
  subject: profile.subject, // provider's immutable sub/id
  profile,                 // { provider, subject, email, name, picture }
  autoProvision: true,     // false → throw IDENTITY_UNLINKED
});
if (!resolved.user) throw new Error('IDENTITY_UNLINKED');
```

Resolution order: a matching local user (by `tenantId` + `identities.provider` +
`identities.subject`) wins; otherwise a pre-authorized `userId` link; otherwise
auto-provision from the verified provider email (that user is created with
`emailVerified: true`). With `autoProvision: false` an unmapped subject fails
with `IDENTITY_UNLINKED` so the app can show an "ask your admin" screen.

## 5. Link and unlink identities

An already-authenticated user can attach a provider subject to their account:

```ts
await feds.link(userId, 'google', subject);        // $addToSet identities
await feds.unlink(userId, 'google', subject);      // $pull identities
```

The demo exposes these as authenticated endpoints
(`POST /api/link`, `POST /api/unlink`), and `/api/me` reports the linked
subject from `user.identities`. Linking is how a password user later gets
one-click sign-in with the same provider.

## 6. The browser flow (useSSO)

`@pezhwan/react` only navigates to the authorize endpoint; your backend
callback completes the exchange — see `$pezhwan/react`'s `useSSO`:

```tsx
import { SSOLogin } from '@pezhwan/react';
// <SSOLogin provider="google" redirectUri="http://localhost:5179/social/callback" />
```

Walk the whole simulated round trip in the demo: it redirects to
`/mock-idp/authorize` (a stand-in for Google), renders a consent screen, then
`/mock-idp/consent` calls `FederatedIdentityService.resolve`, mints tokens with
`runtime.sessions.create()` + `runtime.tokens.signAccessToken({ ..., authMethod: 'oidc' })`
and returns to `/social/callback` where the page stores the session.

## 7. Getting the profile

Once minted, the identity available on requests is the PEZHWAN context
(`req.pezhwan` from `createAuthenticate`), not the raw provider profile. The
provider profile lives in `user.identities`:

```ts
const user = await UserModel.findById(req.pezhwan!.userId).select('email identities');
const googleId = user.identities.find((i) => i.provider === 'google'); // { provider, subject }
```

## Troubleshooting

| Problem | Cause / fix |
| --- | --- |
| `IDENTITY_UNLINKED` on resolve | No local user for the subject and `autoProvision` is falsy or the profile lacks an email. |
| Profile missing email | Provider scope lacks `email`/`user:email`; refresh consent (GitHub needs `user:email`). |
| `OAuth token exchange failed (400)` | Redirect URI doesn't match the one registered in the provider console. |
| Duplicate users on sign-in | Emails are matched per tenant+provider+subject; don't auto-provision on an unverified email. |
| `CROSS_TENANT` oddities | `resolve` is scoped by `tenantId` — always pass the tenant context explicitly. |

## Further reading

- Adapters barrel: `packages/oauth/src/providers/index.ts`
- Federation services: `packages/oauth/src/federation/oauth-federation.ts`,
  `packages/oauth/src/federation/oidc-federation.ts`
- Identity linking: `packages/core/src/services/oauth/federated.service.ts`
- Working demo (simulated IdP): `demos/social-login/`