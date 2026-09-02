# OAuth security

Authorization requests require an exact registered redirect URI, an
unpredictable state value, PKCE for public clients, and nonce validation for
OpenID Connect flows. Authorization codes are short-lived, single-use, and
bound to the client, redirect URI, code challenge, tenant, and application.

Client registration is authenticated and restricted to administrators. Client
secrets are shown once, stored hashed where applicable, and never returned in
logs or browser bundles. Token exchange validates client and tenant scope
before issuing tokens.

Negative tests cover redirect substitution, state/nonce mismatch, PKCE
downgrade, code replay, issuer confusion, and cross-tenant client use.
