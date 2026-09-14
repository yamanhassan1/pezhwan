# @pezhwan/oauth

OAuth 2.1 / OpenID Connect toolkit for PEZHWAN: PKCE (RFC 7636),
authorization-code lifecycle, an OAuth engine, OIDC federation (discovery +
id_token verification), SAML SP helpers, SCIM 2.0 provisioning stores, and
drop-in adapters for external identity providers (Google, Apple, GitHub,
Microsoft, Facebook, and custom).

It is the package that powers social login and enterprise SSO either on the
server (with `@pezhwan/core`) or standalone — every piece is framework-free.

## Installation

```bash
npm install @pezhwan/oauth
```

## PKCE (RFC 7636)

Required for public clients under OAuth 2.1. S256 challenges are generated and
validated in constant time:

```ts
import { generateCodeVerifier, generateCodeChallenge } from '@pezhwan/oauth';

const verifier = generateCodeVerifier(32); // 43..128 char code_verifier
const challenge = generateCodeChallenge(verifier, 'S256');
```

## OIDC token verification

Verify an id_token from an external issuer against its JWKS, with issuer and
audience enforcement and a configurable clock-skew window:

```ts
import { decodeIdToken, jwkToPem, verifyIdToken } from '@pezhwan/oauth';

const { header, payload, signature } = decodeIdToken(rawIdToken);

// Fetch the full JWKS from the issuer's discovery endpoint and verify:
const verified = await verifyIdToken(rawIdToken, {
  issuer: 'https://accounts.google.com',
  audience: 'YOUR_CLIENT_ID',
  jwks: issuerJwks, // { keys: [...] }
  leewaySeconds: 60,
});
```

Helpers `buildDiscoveryMetadata(...)` and `buildJwks(...)` build serverside
OIDC discovery metadata and JWKS documents — useful when you're authoring the
identity provider, not just consuming it.

## Provider adapters

One adapter models one external IdP. Each implements `buildAuthorizationUrl`,
`exchange`, and `getProfile`.

```ts
import { GoogleProvider, AppleProvider, GitHubProvider, MicrosoftProvider } from '@pezhwan/oauth';

const google = new GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: 'https://app.example.com/oauth/callback',
});

// 1. Send the user here.
const url = google.buildAuthorizationUrl({
  clientId: process.env.GOOGLE_CLIENT_ID,
  redirectUri: 'https://app.example.com/oauth/callback',
  state,
  scope: 'openid email profile',
});

// 2. Exchange the callback's authorization code.
const { accessToken, idToken } = await google.exchange({
  clientId: process.env.GOOGLE_CLIENT_ID,
  redirectUri: 'https://app.example.com/oauth/callback',
  code: callbackCode,
});

// 3. Resolve a verified profile.
const profile = await google.getProfile(accessToken, idToken);
// { subject, email, emailVerified, name, picture, raw }
```

| Provider  | Class               | Notes                                                                                |
| --------- | ------------------- | ------------------------------------------------------------------------------------ |
| Google    | `GoogleProvider`    | OIDC `id_token` + userinfo fallback.                                                 |
| Apple     | `AppleProvider`     | Requires configured client id + team JWT credentials.                                |
| GitHub    | `GitHubProvider`    | OAuth2 user-access-token flow.                                                       |
| Microsoft | `MicrosoftProvider` | Microsoft/Azure AD accounts.                                                         |
| Facebook  | `FacebookProvider`  | OAuth2 + graph userinfo.                                                             |
| Custom    | `CustomProvider`    | Any provider conforming to `OAuthProviderAdapter`; add custom claims resolution.     |
| Base      | `BaseOAuthProvider` | Abstract base implementing the shared HTTP/id-token plumbing for your own providers. |

Combine providers into a registry that the auth engine consumes
provider-agnostically:

```ts
import { ProviderRegistry, createBuiltinRegistry, GoogleProvider, GitHubProvider } from '@pezhwan/oauth';

const registry = new ProviderRegistry([
  new GoogleProvider({ ... }),
  new GitHubProvider({ ... }),
]);

// Or the convenience factory, identical result:
const registry2 = createBuiltinRegistry([new GoogleProvider({ ... })]);

registry.has('google');        // true
registry.get('google');        // the adapter
registry.names();              // ['google', 'github']
```

> Every adapter is pure (no shared mutable state) and can be used directly or
> composed into a registry. New providers are added by implementing
> `OAuthProviderAdapter` — the auth engine never hard-codes a provider name.

## Authorization codes and token exchange

The package owns the one-time authorization-code lifecycle (issuance, single
use, expiry, and optional PKCE binding) and the OAuth authorization-code +
client-credentials engine:

```ts
import {
  AuthorizationCodeManager,
  MemoryAuthorizationCodeStore,
  TokenExchangeService,
} from '@pezhwan/oauth';

const codeStore = new MemoryAuthorizationCodeStore();
const codeManager = new AuthorizationCodeManager(codeStore);
await codeManager.issue({/* clientId, userId, redirectUri, codeChallenge */});
const code = await codeManager.redeem(/* presented code */);

// RFC 8693 token exchange — swap one token for another (delegation, authN).
const exchange = new TokenExchangeService({/* deps */});
const result = await exchange.exchange({/* grant + subject_token */});
```

Use these together with `@pezhwan/core`'s `OAuthService` (mounted as
`runtime.oauth`) for a full authorize → token → on-behalf-of flow; this package
provides the primitives both run on.

## SAML (enterprise SSO)

Server-side SAML SP helpers for sign-in requests and assertion parsing:

```ts
import { buildAuthnRequest, buildAuthnRequestUrl, parseSamlResponse } from '@pezhwan/oauth';

const { url, relayState } = buildAuthnRequestUrl({
  idpSsoUrl: 'https://idp.example.com/sso',
  spEntityId: 'https://app.example.com/saml',
  acsUrl: 'https://app.example.com/saml/acs',
});

const assertion = parseSamlResponse( /* raw SAML response */ , config);
// { subject, issuer, audience, conditions, attributes, ... }
```

`buildAuthnRequest` returns the unsigned AuthnRequest document; decode a
transmitted audience/RelayState with `decodeSaml`.

## SCIM 2.0

Provisioning-store types and helpers for cross-system user/group sync:

```ts
import {
  userSchemaDocument,
  USER_ATTRIBUTE_NAMES,
  SCHEMA_URI,
  ServiceProviderConfig /* from scim/service-provider */,
} from '@pezhwan/oauth';
```

Schemas, users, groups, and service-provider configuration (`scim/schemas.ts`,
`users.ts`, `groups.ts`, `service-provider.ts`) are all exported, and the
`ScimUser`/`ScimGroup`/`ScimListResponse` domain types come from
`@pezhwan/shared`. The actual SCIM HTTP surface is mounted by
`@pezhwan/express` (`/v1/scim`) and enforced by the ADMIN role.

## Federation

`federation/` bundles OAuth, OIDC, and SAML federation services
(`oauth-federation.ts`, `oidc-federation.ts`, `saml.service.ts`) — the pieces
used for enterprise SSO and cross-domain identity.

## Related docs

- [`docs/tutorials/oauth-setup.md`](../../docs/tutorials/oauth-setup.md) — end-to-end OAuth/OIDC with the identity server.
- [`docs/tutorials/social-login.md`](../../docs/tutorials/social-login.md) — social login with the provider registry.
- [`docs/tutorials/enterprise-sso.md`](../../docs/tutorials/enterprise-sso.md) — SAML + OIDC federation for enterprises.
- [`@pezhwan/express`](../express/README.md) — the `/v1/oauth` router that serves these flows.
