# @pezhwan/oauth

OAuth 2.1 / OpenID Connect toolkit: PKCE, authorization-code lifecycle, an
OAuth engine, OIDC federation (discovery + id_token verification), SAML SP
helpers, SCIM 2.0 provisioning stores, and external identity providers.

## Structure

- `src/adapter.ts` / `src/registry.ts` — provider contract + registry (real)
- `src/pkce.ts` — RFC 7636 verifier/challenge
- `src/authorization-code.ts` — one-time code store + manager
- `src/oauth.service.ts` — authorization-code + client-credentials engine
- `src/oidc.service.ts` — discovery, JWKS, id_token verification
- `src/token-exchange.ts` — RFC 8693 token exchange
- `src/federation/` — OAuth / OIDC / SAML federation services
- `src/providers/` — Google, Apple, GitHub, Microsoft, Facebook, custom
- `src/scim/` — SCIM 2.0 schemas, users, groups, service-provider config
