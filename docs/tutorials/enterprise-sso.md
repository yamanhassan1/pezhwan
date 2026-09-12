# Enterprise SSO and provisioning

Connect PEZHWAN to an enterprise identity provider (Okta, Azure AD / Entra ID,
ADFS) and provision directory users in both directions. This tutorial covers the
SAML 2.0 service-provider helpers, OIDC federation, SCIM 2.0 provisioning, and
the security checks that make the SSO trust safe. The primitives live in
`packages/oauth/src/federation/` and `packages/express/src/routes/scim.routes.ts`.

## Prerequisites

- A running identity server and a PEZHWAN user with the `ADMIN` role (SCIM is
  ADMIN-gated).
- Provider metadata for whatever you connect to: Okta's SAML app metadata, or
  Azure AD's OIDC `.well-known/openid-configuration` + a registered app.

## 1. SAML 2.0 service-provider helpers

`packages/oauth/src/federation/saml.service.ts` builds AuthnRequests and parses
assertions without an XML dependency. Configuration is the `SamlConfig` shape
(`packages/shared/src/types/saml.types.ts`):

```ts
import { buildAuthnRequestUrl, parseSamlResponse, decodeSaml } from '@pezhwan/oauth';
import type { SamlConfig } from '@pezhwan/shared';

const config: SamlConfig = {
  entityId: 'urn:pezhwan:sp',                     // our SP audience
  acsUrl: 'https://auth.example.com/saml/acs',
  idpSsoUrl: 'https://okta.example.com/app/.../sso/saml',
  idpEntityId: 'http://www.okta.com/exk...',      // checked against <Issuer>
  binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
  nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  attributeMapping: { email: 'emailAddress' },    // IdP attr name → user fields
};
```

Start the flow with an HTTP-Redirect `SAMLRequest` (deflate + base64url):

```ts
const { url, relayState } = buildAuthnRequestUrl(config, { relayState: 'session-hint' });
// GET url  → user authenticates at the IdP → POST (or GET) to acsUrl with SAMLResponse
```

On the ACS route, decode and validate before doing anything:

```ts
const raw = decodeSaml(req.body.SAMLResponse);
const assertion = parseSamlResponse(raw, config);
// parseSamlResponse throws on:
//   - audience mismatch  ("SAML assertion audience mismatch")
//   - issuer mismatch    ("SAML assertion issuer mismatch")
//   - missing subject    ("SAML assertion missing subject")
// returns { subject, nameIdFormat, attributes, issuer, audience }
```

`parseSamlResponse` enforces that the assertion `Audience` contains your
`entityId` and, when `idpEntityId` is configured, that the `Issuer` matches.
Then resolve the subject against a local user via `FederatedIdentityService`
(see the [social-login tutorial](./social-login.md)).

## 2. OIDC federation (Okta / Azure AD)

`OidcFederationService` (`packages/oauth/src/federation/oidc-federation.ts`)
handles discovery, the authorization-code exchange, and **verified** id_token
claims:

```ts
import { OidcFederationService } from '@pezhwan/oauth';

const oidc = new OidcFederationService();
const discovery = await oidc.discover('https://login.microsoftonline.com/<tenant>/v2.0');

const url = oidc.buildAuthorizationUrl(discovery, {
  clientId: AZURE_CLIENT_ID,
  redirectUri: 'https://auth.example.com/oidc/callback',
  state: randomState,
  nonce: randomNonce,                 // bound to the session, checked below
});

// callback → { code, state }
const { tokenSet, claims, profile } = await oidc.handleCallback({
  discovery, clientId: AZURE_CLIENT_ID, clientSecret: AZURE_CLIENT_SECRET,
  redirectUri: 'https://auth.example.com/oidc/callback',
  code, nonce,
});
```

`handleCallback` exchanges the code, then calls `verifyIdToken` with the
discovered JWKS — enforcing signature, `iss`, `aud`, expiry, and `nonce`
(`packages/oauth/src/oidc.service.ts`). `claims.sub` is the provider subject
you store under the user's `identities`; `profile` is the normalized
`SsoProfile`.

### Coupling to runtime sessions

Regardless of transport, the SSO result is materialized as a PEZHWAN session,
so downstream middleware is uniform:

```ts
const sessions = await runtime.sessions.create({
  userId, tenantId, applicationId,
});
const accessToken = runtime.tokens.signAccessToken({
  userId, tenantId, applicationId,
  sessionId: sessions.sessionId, roles: [], permissions: [],
  authMethod: 'oidc',               // or 'password' / 'oauth'
});
```

`authMethod` is replayed into `req.pezhwan.authMethod` (and the audit trail), so
"signed in via Okta" stays distinguishable from "via password".

## 3. SCIM 2.0 provisioning

PEZHWAN mounts a SCIM 2.0 surface at `/v1/scim` behind `createAuthenticate` +
`requireAuth` + `requireRole('ADMIN')`. Sydney-style responses follow RFC 7643
(resource / list / error envelopes — not the `{ success, data }` wrapper):

| Endpoint | Purpose |
| --- | --- |
| `GET/POST /v1/scim/Users` | List (with `filter`, `startIndex`, `count`) / create |
| `GET/PUT/PATCH/DELETE /v1/scim/Users/:id` | Read / replace / partial-update / delete |
| `GET/POST /v1/scim/Groups` | List / create groups |
| `GET/PUT/PATCH/DELETE /v1/scim/Groups/:id` | Group membership management |
| `GET /v1/scim/ServiceProviderConfig` | Capabilities document (`serviceProviderConfig()`) |
| `GET /v1/scim/Schemas` | The User schema document (`userSchemaDocument()`) |
| `GET /v1/scim/` | Registered resource types (User, Group) |

Example — create a user:

```bash
curl -s -X POST http://localhost:4011/v1/scim/Users \
  -H "Authorization: Bearer $ADMIN_ACCESS" \
  -H "Content-Type: application/json" \
  -d '{
    "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
    "userName": "ada",
    "name": { "familyName": "Lovelace", "givenName": "Ada" },
    "emails": [{ "value": "ada@example.com", "primary": true }],
    "active": true
  }'
# 201 → the resource with an "id" and "meta"; userName is required (USERNAME_REQUIRED)
```

The reference router stores resources in memory per runtime
(`MemoryScimUserStore`, `MemoryScimGroupStore`); swap in
`UserModel`-backed stores for production persistence. To point Okta or Azure AD
at it, register the `/v1/scim/` root (resource types) as your SCIM base URL,
authenticate with a bearer token, and use the standard `filter` (`userName eq
"ada"`) and paging parameters.

## 4. Session SSO behavior

- SSO sign-in mints the same rotating refresh-token session as any other
  method — logout revokes it (`POST /v1/auth/logout`), the session list at
  `/v1/sessions` shows it with its device info.
- Sessions carry the tenant boundary, so an SSO assertion for tenant A cannot
  falsify a tenant-B session.
- IdP-initiated or SP-initiated, always bind `state`/`nonce` to the local
  session and verify after the round trip — the federation helpers check
  `nonce` on the id_token and you control `state` on the SAML `RelayState`.

## 5. Security considerations

| Concern | PEZHWAN behavior / checklist |
| --- | --- |
| Assertion validation | `parseSamlResponse` verifies subject present + audience = SP `entityId`; configured `idpEntityId` is checked against `<Issuer>`. |
| Clock validity | SAML `NotOnOrAfter`/`NotBefore` live on the parsed assertion — reject expired assertions. |
| id_token verification | `verifyIdToken`: signature against discovered JWKS, `iss`, `aud`, `exp` (60 s leeway), `nonce`. |
| Audience | id_token `aud` must contain your `client_id`; SAML `Audience` must contain SP `entityId`. |
| Redirect hygiene | The OAuth authorize router never redirects to an unvalidated `redirect_uri` (`routes.oauth.ts`). |
| Admin gate | SCIM + client registration are `ADMIN`-role enforced server-side. |
| Secrets | Client secrets and SP signing keys come from env/secrets — never from client input. |

## Troubleshooting

| Problem | Cause / fix |
| --- | --- |
| `SAML assertion audience mismatch` | Your SP `entityId` isn't in the IdP's assertion `Audience` — align the two. |
| `SAML assertion issuer mismatch` | `idpEntityId` in code differs from the IdP's `<Issuer>`. |
| `id_token issuer mismatch` / `audience mismatch` | Discovery issuer/client_id drift between app registration and code. |
| Observation: code works in Okta but not Azure AD | Different claim sets; use `attributeMapping`/`fieldMapping` per provider. |
| SCIM returns 401/403 | Caller is not an `ADMIN`; authenticate with an ADMIN bearer token. |
| SCIM 404 on `PATCH` | Memory store persists per runtime — restart resets it; replace with a durable store. |

## Further reading

- SAML helpers + validation: `packages/oauth/src/federation/saml.service.ts`,
  `packages/shared/src/types/saml.types.ts`
- OIDC federation: `packages/oauth/src/federation/oidc-federation.ts`,
  `packages/oauth/src/oidc.service.ts`
- SCIM router: `packages/express/src/routes/scim.routes.ts`,
  `packages/oauth/src/scim/`
- Session/token materialization: `packages/core/src/services/session.service.ts`,
  `packages/core/src/services/token.service.ts`
- Specs: [SAML 2.0](https://www.oasis-open.org/standards#samlv2.0),
  [OpenID Connect](https://openid.net/connect/),
  [RFC 7643 SCIM](https://www.rfc-editor.org/rfc/rfc7643)