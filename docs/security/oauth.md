# OAuth security

Authorization requests require an exact registered redirect URI, an
unpredictable state value, PKCE for public clients, and nonce validation for
OpenID Connect flows. Authorization codes are short-lived, single-use, and
bound to the client, redirect URI, code challenge, tenant, and application.

Client registration is authenticated and restricted to administrators. Client
secrets are shown once, stored hashed where applicable, and never returned in
logs or browser bundles. Token exchange validates client and tenant scope
before issuing tokens.

### Tenant/application scoped issuance

Every authorization request must declare its `tenantId` and `applicationId`
(`AuthorizeInput` requires both). Client lookup, authorization-code creation,
and code redemption are scoped by tenant, application, and client, so a client
registered in one tenant cannot be resolved or redeemed in another.

### Scope is a hard boundary

Requesting any scope outside the client's registered scope set **rejects** the
request with `ValidationError` `INVALID_SCOPE` — on both the authorization
endpoint and the client-credentials flow. Scopes are no longer silently pruned,
preventing scope escalation.

### Validate-before-consume code redemption

Authorization codes are read-only validated (including PKCE and redirect-URI
checks) **before** they are atomically consumed. A bad PKCE verifier or invalid
request no longer burns a valid code.

### No open redirect on error

An authorization error is returned as a JSON error response, never as a
redirect to an unvalidated `redirect_uri` (closing the open-redirect vector).

Negative tests cover redirect substitution, state/nonce mismatch, PKCE
downgrade, code replay, issuer confusion, cross-tenant client use, and
out-of-scope escalation.
