# PEZHWAN SDK — 9.9/10 PRODUCTION-GRADE HARDENING

Act as a Principal Security Architect, IAM/OAuth/OIDC Engineer,
DevSecOps Engineer, Distributed Systems Engineer, and Production
Reliability Engineer.

Your mission is to transform the existing PEZHWAN SDK from its current
6.5/10 production-readiness state into a genuinely production-grade
identity and access management platform targeting a minimum internal
readiness score of 9.9/10.

DO NOT achieve this score by changing the rating or hiding problems.

The 9.9/10 score must be earned by implementing, testing, documenting,
and validating the required security, reliability, scalability,
operational, and developer-experience controls.

============================================================
0. CURRENT PEZHWAN ARCHITECTURE
============================================================

PEZHWAN is a layered monorepo:

@pezhwan/shared
@pezhwan/crypto
@pezhwan/core
@pezhwan/oauth
@pezhwan/express
@pezhwan/node
@pezhwan/react
@pezhwan/identity-server

Current architecture already includes:

- Argon2id password hashing
- RS256 / ES256 / EdDSA support
- JWT + JWKS
- key rotation
- short-lived access tokens
- rotating refresh-token families
- refresh-token reuse detection
- RBAC
- tenant/application authorization
- MFA/TOTP
- backup codes
- OTP
- email/phone verification
- rate limiting
- account lockout
- audit logging
- structured logging
- metrics
- CORS allowlisting
- CSRF protection
- security headers
- OAuth/OIDC
- PKCE
- API keys
- fail-closed authentication

Do not blindly rewrite these systems.

Inspect the entire repository first.

Verify every existing security claim against actual source code,
configuration, tests, runtime behavior, MongoDB behavior, Redis behavior,
and HTTP behavior.

The existing architecture is documented as a layered monorepo with
security responsibilities separated between crypto, core, OAuth,
Express, React, Node, and identity-server packages.

============================================================
1. TARGET
============================================================

Target:

SECURITY:              10/10
AUTHENTICATION:        10/10
AUTHORIZATION:         10/10
CRYPTOGRAPHY:          10/10
SECRETS:               10/10
SESSION SECURITY:      10/10
OAUTH/OIDC:            10/10
MULTI-TENANCY:         10/10
ABUSE PROTECTION:      10/10
DATABASE SECURITY:     10/10
REDIS SECURITY:        10/10
OBSERVABILITY:         10/10
RELIABILITY:           10/10
SCALABILITY:           10/10
TESTING:               10/10
CI/CD:                 10/10
DOCUMENTATION:         10/10
DX:                    10/10

Overall minimum target:

9.9/10

Do not declare success until every category has evidence.

============================================================
2. NON-NEGOTIABLE SECURITY RULES
============================================================

NEVER:

- hardcode secrets
- hardcode passwords
- hardcode JWT secrets
- hardcode private keys
- hardcode OAuth client secrets
- hardcode API keys
- commit production credentials
- expose private keys to frontend
- expose secrets through VITE_* variables
- store authentication secrets in localStorage by default
- use wildcard CORS with credentials
- disable CSRF to make tests/demo work
- disable TLS verification
- silently fall back to insecure authentication
- use predictable development secrets in production
- log passwords/tokens/OTP/API keys
- return stack traces in production
- trust client-supplied roles/permissions/tenant IDs
- trust unsigned JWT claims
- accept arbitrary JWT algorithms
- silently ignore authorization failures
- silently grant access when Redis/database/security dependencies fail

Security must fail closed.

============================================================
3. COMPLETE SECRET MANAGEMENT
============================================================

Perform a repository-wide secret audit.

Search for:

- passwords
- tokens
- JWTs
- API keys
- private keys
- certificates
- MongoDB credentials
- Redis credentials
- SMTP credentials
- OAuth secrets
- cloud credentials
- service-account files
- .pem
- .key
- .p12
- .pfx
- credentials.json
- service-account.json
- embedded connection strings
- base64 encoded credentials
- hardcoded encryption keys

Create:

docs/security/secrets-management.md

Implement a centralized configuration system.

Example:

packages/core/src/config/

env.ts
schema.ts
secret-provider.ts

The application must NEVER scatter process.env throughout business logic.

Use:

config.database.url
config.redis.url
config.auth.signingKey
config.auth.issuer
config.oauth.clientSecret

etc.

============================================================
4. SECRET PROVIDER ABSTRACTION
============================================================

Create a provider abstraction:

SecretProvider

Example:

interface SecretProvider {
  getSecret(name: string): Promise<string>;
  getOptionalSecret(name: string): Promise<string | undefined>;
}

Development:

Environment variables.

Production:

Allow integration with:

- AWS Secrets Manager
- Google Secret Manager
- Azure Key Vault
- HashiCorp Vault
- Kubernetes Secrets
- Docker Secrets
- KMS/HSM-backed systems

Do not tightly couple the core SDK to one provider.

The SDK must allow applications to supply their own secret provider.

============================================================
5. .ENV SECURITY
============================================================

Commit ONLY:

.env.example

Never commit:

.env
.env.local
.env.production
.env.development.local
real credentials

.env.example must contain placeholders only.

Example:

NODE_ENV=development
PORT=4011

DATABASE_URL=mongodb://localhost:27017/pezhwan_dev
REDIS_URL=redis://localhost:6379

JWT_ISSUER=https://localhost:4011
JWT_AUDIENCE=pezhwan.clients

JWT_ACCESS_PRIVATE_KEY_FILE=
JWT_REFRESH_PRIVATE_KEY_FILE=

OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret

SMTP_HOST=your-smtp-host
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password

No real secrets.

============================================================
6. GIT HISTORY SECURITY
============================================================

Check whether sensitive information has ever been committed.

If found:

DO NOT merely add it to .gitignore.

Treat it as compromised.

For every exposed secret:

1. Identify the secret category.
2. Remove it from source code.
3. Rotate/revoke it.
4. Remove it from Git history where appropriate.
5. Re-scan the repository.
6. Verify the old credential no longer works.

Use secret scanning tools such as:

Gitleaks
TruffleHog
GitHub Secret Scanning

CI must fail when real credentials are detected.

============================================================
7. CRYPTOGRAPHIC KEY MANAGEMENT
============================================================

The current architecture supports asymmetric JWT signing and JWKS.

Harden this significantly.

Requirements:

- asymmetric signing only for production
- explicit algorithm allowlist
- kid on every signed token
- JWKS endpoint
- key rotation
- overlapping old/new verification keys
- key activation timestamps
- key retirement timestamps
- key status
- emergency key revocation
- secure private-key storage
- no private key in frontend
- no private key committed to Git
- no private key baked into Docker images

Implement a key lifecycle:

GENERATED
   ↓
STAGED
   ↓
ACTIVE
   ↓
VERIFY-ONLY
   ↓
RETIRED
   ↓
REVOKED

Support emergency rotation.

Document key rotation procedures.

============================================================
8. JWT HARDENING
============================================================

Verify all JWTs for:

- signature
- algorithm
- kid
- issuer
- audience
- subject
- expiration
- not-before
- issued-at where required
- token type
- required claims

Reject:

- alg=none
- unexpected algorithms
- missing issuer
- wrong audience
- expired tokens
- malformed tokens
- unknown signing keys
- invalid key IDs
- token-type confusion
- access token used as refresh token
- refresh token used as access token

Use separate validation policies for:

ACCESS_TOKEN
REFRESH_TOKEN
EMAIL_VERIFICATION
PASSWORD_RESET
OAUTH_AUTHORIZATION_CODE
API_KEY

============================================================
9. ACCESS TOKEN DESIGN
============================================================

Keep access tokens short-lived.

Default:

15 minutes

Make TTL configurable within safe boundaries.

Never allow users to configure unlimited lifetimes.

For high-risk environments allow shorter TTL.

Validate account state when required.

Never trust roles/permissions supplied by request bodies.

Identity must come from the verified security context.

============================================================
10. REFRESH TOKEN SECURITY
============================================================

Keep rotating refresh-token families.

Strengthen them with:

- single-use rotation
- reuse detection
- family revocation
- session binding
- device metadata
- IP/risk metadata where appropriate
- token hash storage only
- absolute session lifetime
- inactivity timeout
- explicit logout revocation
- password-change revocation
- account-disable revocation
- suspicious replay detection

Handle concurrent refresh requests safely.

IMPORTANT:

Test race conditions.

Two simultaneous requests using the same refresh token
must NOT accidentally create two valid child sessions.

Use an atomic database operation / transaction / concurrency-control
strategy.

============================================================
11. SESSION SECURITY
============================================================

Every session should support:

- session ID
- user ID
- tenant ID
- application ID
- createdAt
- lastActiveAt
- expiresAt
- revokedAt
- revokeReason
- device information
- refresh family ID
- parent/child relationship
- security metadata

Implement:

- revoke session
- revoke all sessions
- revoke other sessions
- password-change invalidation
- account-disable invalidation
- suspicious-session detection

Session limits must be configurable.

============================================================
12. BROWSER SECURITY
============================================================

Default browser integrations toward secure cookie/session architecture.

Cookies:

HttpOnly
Secure
SameSite=Lax or Strict where possible
SameSite=None ONLY when genuinely cross-site
Secure REQUIRED with SameSite=None

Narrow:

Domain
Path

Do not expose refresh tokens to JavaScript unless an explicit
advanced integration requires it and the risk is documented.

Do not encourage localStorage for sensitive long-lived credentials.

============================================================
13. CSRF
============================================================

Strengthen CSRF protection.

State-changing cookie-authenticated requests require CSRF protection.

Implement:

- secure CSRF token generation
- token validation
- SameSite defense
- Origin validation
- Referer validation where appropriate
- safe-method handling
- constant-time comparison where applicable

Never disable CSRF globally.

OAuth authorization requests must use:

state
nonce
PKCE S256

============================================================
14. CORS
============================================================

CORS must use exact origin allowlists.

Never:

Access-Control-Allow-Origin: *

when credentials are enabled.

Validate configuration at startup.

Reject unknown origins.

Do not dynamically trust arbitrary Origin headers.

Support:

development
staging
production

as separate configuration environments.

============================================================
15. OAUTH 2.1 / OIDC
============================================================

Perform a dedicated OAuth/OIDC security audit.

Implement/verify:

Authorization Code
PKCE S256
state
nonce
exact redirect URI matching
authorization-code one-time use
short authorization-code TTL
issuer validation
audience validation
JWKS validation
token-type validation
client authentication appropriate to client type
secure refresh handling
discovery metadata

Reject:

implicit flow
wildcard redirect URIs
open redirectors
unvalidated redirect URIs
code reuse
PKCE downgrade
missing state
missing nonce where required
issuer confusion
audience confusion

Create interoperability tests with real OAuth/OIDC providers
where practical.

============================================================
16. PASSWORD SECURITY
============================================================

Use Argon2id.

Implement:

- strong password policy
- password strength validation
- breached-password protection where appropriate
- password history if required by deployment
- secure reset flow
- reset-token hashing
- reset-token expiration
- one-time use
- tokenVersion invalidation
- session revocation after password reset

Never log passwords.

============================================================
17. MFA
============================================================

Harden TOTP and backup codes.

Requirements:

- secure secret generation
- encrypted-at-rest TOTP secrets
- backup codes hashed
- backup codes single-use
- MFA enrollment verification
- MFA recovery controls
- MFA disable requires recent authentication
- risk-sensitive reauthentication
- rate limits
- audit events

Never log:

OTP
TOTP secret
backup codes

============================================================
18. OTP SECURITY
============================================================

OTP codes must be:

- cryptographically random
- short-lived
- hashed before persistence
- single-use
- attempt-limited
- resend-limited
- rate-limited

Protect against:

- brute force
- OTP bombing
- account enumeration
- resend abuse
- provider cost abuse

Use Redis for counters where appropriate.

Never store plaintext OTPs.

Never log OTPs.

============================================================
19. ACCOUNT ENUMERATION
============================================================

Authentication, registration, password reset, OTP, and verification
flows must not reveal whether an account exists.

Use:

- uniform responses
- uniform error messages
- timing-resistant behavior
- decoy processing where appropriate

Test both:

existing account
unknown account

and compare externally observable behavior.

============================================================
20. API KEY SECURITY
============================================================

API keys must:

- have a public prefix
- store only hashes
- be shown only once
- support scopes
- support expiration
- support rotation
- support revocation
- support per-key rate limits
- support audit events

Never log the complete API key.

============================================================
21. AUTHORIZATION
============================================================

Authorization must be:

DENY BY DEFAULT.

Implement:

- RBAC
- permissions
- tenant boundaries
- application boundaries
- resource ownership checks
- server-side authorization
- policy enforcement

Prevent:

BOLA
IDOR
privilege escalation
tenant escape
role injection
permission injection

Never trust:

req.body.userId
req.body.tenantId
req.body.role
req.body.permissions

unless explicitly validated against the authenticated security context.

============================================================
22. MULTI-TENANT ISOLATION
============================================================

This is a critical production requirement.

Every tenant-owned resource must be tenant-scoped.

Audit EVERY query.

Example:

BAD:

UserModel.findOne({ _id: userId })

GOOD:

UserModel.findOne({
  _id: userId,
  tenantId: authenticatedTenantId
})

Do not allow tenant IDs from the client to override the authenticated
tenant context.

Implement:

- tenant isolation
- application isolation
- compound indexes
- tenant-aware repositories
- tenant-aware authorization
- tenant-aware audit logs
- tenant-specific quotas
- tenant-specific rate limits

Add automated cross-tenant attack tests.

A test must prove:

Tenant A CANNOT access Tenant B data.

============================================================
23. FIX THE ID TYPE MISMATCH
============================================================

The current architecture has a known critical persistence problem:

tenantId/applicationId are represented as strings in configuration/domain
models while Mongoose persistence expects ObjectIds.

Do not leave this unresolved.

Choose ONE canonical architecture.

Prefer one of:

OPTION A:

UUID/string identifiers everywhere.

OR:

OPTION B:

Mongo ObjectId internally + separate public opaque identifiers.

Document the decision.

Update:

models
types
JWT claims
indexes
repositories
services
configuration
tests
migrations

Ensure:

register
login
session creation
OTP
roles
API keys
audit
OAuth
applications
tenants

all persist successfully against REAL MongoDB.

Do not rely only on in-memory mocks.

============================================================
24. DATABASE SECURITY
============================================================

MongoDB must be production hardened.

Implement/verify:

- strict schemas
- strict validation
- indexes
- unique indexes
- tenant-scoped compound indexes
- TTL indexes
- query timeouts
- connection timeouts
- pool configuration
- safe retry behavior
- transaction strategy
- backup strategy
- restore testing

Prevent:

operator injection
$where abuse
regex abuse
unbounded queries
unbounded pagination
mass assignment

Use validated query objects.

============================================================
25. REDIS ARCHITECTURE
============================================================

Redis must be treated as distributed infrastructure.

Use centralized connection lifecycle management.

Separate connections where Redis Pub/Sub semantics require it.

Implement:

- connection retry policy
- TLS where applicable
- authentication/ACL
- key namespaces
- TTLs
- bounded memory usage
- failure detection
- metrics

Redis failure must NEVER accidentally grant authorization.

Distinguish:

security-critical state
performance cache

Clearly document which is source of truth.

============================================================
26. RATE LIMITING
============================================================

Implement distributed Redis-backed rate limiting.

Do NOT use one global fixed number.

Create endpoint-specific policies.

Example starting policies:

LOGIN:
5 attempts/minute/IP
5 attempts/minute/account

OTP SEND:
3 requests/10 minutes/account
1 resend/30 seconds

PASSWORD RESET:
3 requests/15 minutes/account/IP

REGISTER:
5/hour/IP/device

REFRESH:
30/minute/session

API:
configurable per user/application/API key

These are starting values, not universal constants.

Make them configurable.

Return:

HTTP 429
Retry-After

Use multiple dimensions:

IP
account
device/session
API key
tenant

where appropriate.

============================================================
27. CONCURRENCY CONTROLS
============================================================

Rate limiting alone is insufficient.

Add concurrency controls for expensive operations:

- login
- password hashing
- OTP sending
- password reset
- refresh
- expensive API operations

Prevent resource exhaustion.

============================================================
28. WEBSOCKET / REAL-TIME SECURITY
============================================================

If Socket.IO/WebSockets are supported:

Authenticate handshake.

Validate:

- access token
- origin
- session
- account state

Bind socket to authenticated identity.

Implement:

- per-user connection caps
- heartbeat
- payload limits
- schema validation
- event-level authorization
- event rate limits
- disconnect on revocation
- Redis adapter for multi-instance deployments

Never trust:

socket event userId
socket event tenantId
socket event role

Use authenticated socket context.

============================================================
29. SECURITY HEADERS
============================================================

Use secure headers.

Verify:

CSP
HSTS
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
frame-ancestors
X-Frame-Options where appropriate

Disable:

X-Powered-By

Production TLS must be enforced.

============================================================
30. LOGGING
============================================================

Implement structured logging.

Every request should have:

requestId
correlationId

Never log:

passwords
tokens
cookies
Authorization headers
OTP
API keys
OAuth secrets
private keys
database credentials

Implement recursive redaction.

Example:

Authorization: [REDACTED]
accessToken: [REDACTED]
refreshToken: [REDACTED]
password: [REDACTED]

============================================================
31. AUDIT LOGGING
============================================================

Audit security-sensitive events.

Examples:

LOGIN_SUCCESS
LOGIN_FAILURE
ACCOUNT_LOCKED
PASSWORD_CHANGED
PASSWORD_RESET
MFA_ENABLED
MFA_DISABLED
SESSION_CREATED
SESSION_REVOKED
REFRESH_REUSE_DETECTED
API_KEY_CREATED
API_KEY_REVOKED
ROLE_CHANGED
PERMISSION_CHANGED
TENANT_ACCESS_DENIED
OAUTH_CLIENT_CREATED
OAUTH_AUTHORIZATION
SECURITY_CONFIGURATION_CHANGED

Maintain:

requestId
actor
tenant
application
timestamp
event
result
source
metadata

Do not store secrets inside audit records.

Keep the tamper-evident prevHash chain.

============================================================
32. OBSERVABILITY
============================================================

Implement production metrics for:

authentication success/failure
authorization failures
401
403
429
OTP sends
OTP failures
refresh reuse
session revocations
account lockouts
OAuth failures
database latency
Redis latency
cache hit rate
JWKS requests
key rotations
request latency
error rates

Add health endpoints:

/health/live
/health/ready

Readiness must verify critical dependencies.

Do not expose secrets through health endpoints.

============================================================
33. ALERTING
============================================================

Create recommended alerts for:

- abnormal login failures
- credential stuffing
- OTP abuse
- refresh-token replay
- unusual tenant activity
- high 401/403 rates
- high 429 rates
- Redis failure
- Mongo failure
- key rotation failures
- JWKS failures
- elevated latency
- authentication error spikes

Document thresholds as configurable.

============================================================
34. DISASTER RECOVERY
============================================================

Document:

Mongo backups
Mongo restore
Redis recovery
signing-key recovery
secret recovery
configuration recovery

Define:

RPO
RTO

Create a restore drill.

Production readiness is NOT complete until backups can actually
be restored.

============================================================
35. HIGH AVAILABILITY
============================================================

The Identity Server must support:

multiple instances
load balancer
shared MongoDB
shared Redis
persistent signing keys
JWKS consistency

No critical state should exist only in process memory.

Audit every singleton/global variable.

Any cache must have bounded size and TTL.

============================================================
36. CACHE SAFETY
============================================================

Audit all in-memory caches.

Every cache must have:

TTL
maximum size
eviction policy

Prevent:

unbounded memory growth
memory leaks
stale authorization state

Security-sensitive cache entries must have conservative TTLs.

============================================================
37. REAL INTEGRATION TESTING
============================================================

Current in-memory tests are insufficient.

Add integration testing against:

REAL MongoDB
REAL Redis

Use Testcontainers or equivalent isolated infrastructure.

Test:

registration
login
refresh
refresh reuse
logout
MFA
OTP
password reset
OAuth
RBAC
multi-tenancy
rate limiting
session revocation
key rotation

============================================================
38. SECURITY TEST SUITE
============================================================

Create dedicated security tests for:

CORS bypass
CSRF bypass
JWT algorithm confusion
JWT audience confusion
JWT issuer confusion
expired token
revoked session
refresh replay
race-condition refresh
tenant escape
IDOR
BOLA
role injection
permission injection
account enumeration
OTP brute force
API key leakage
secret leakage
log leakage
open redirect
OAuth state failure
OAuth nonce failure
PKCE downgrade
redirect URI bypass

============================================================
39. LOAD TESTING
============================================================

Perform load testing.

Measure:

login throughput
token verification
refresh throughput
database performance
Redis performance
rate-limit performance
concurrent sessions

Identify bottlenecks.

Do not optimize prematurely.

Document:

baseline
target
maximum tested load
failure behavior

============================================================
40. FAILURE-INJECTION TESTING
============================================================

Simulate:

Mongo unavailable
Redis unavailable
Redis timeout
JWKS unavailable
key store unavailable
network timeout
database latency
duplicate registration
concurrent refresh
provider failure

Verify that:

authentication fails safely
authorization fails safely
no security bypass occurs
services recover cleanly

============================================================
41. CI/CD
============================================================

CI must execute:

lint
typecheck
unit tests
integration tests
security tests
build
secret scanning
dependency scanning
SBOM generation

Production deployment must not proceed if security-critical checks fail.

============================================================
42. DEPENDENCY SECURITY
============================================================

Implement:

npm audit
Dependabot/Renovate
lockfile enforcement
dependency review
license review where required
SBOM generation

Remove unnecessary dependencies.

Keep the crypto dependency surface minimal.

============================================================
43. SDK SECURITY DESIGN
============================================================

Keep:

@pezhwan/core

framework independent.

Keep framework-specific functionality in:

@pezhwan/node
@pezhwan/express
@pezhwan/react

Do not introduce browser globals into core.

Do not introduce Express dependencies into core.

Do not force one database provider into every SDK consumer.

Use interfaces/adapters for:

database
cache
secret provider
key store
audit sink
email
SMS
metrics
logging

============================================================
44. SECURE DEFAULTS
============================================================

The SDK must be secure by default.

Unsafe options should require explicit opt-in.

Example:

allowInsecureDevelopmentMode: true

should never silently activate in production.

If NODE_ENV=production:

secure defaults are mandatory.

============================================================
45. CONFIGURATION VALIDATION
============================================================

At startup validate:

issuer
audience
database
Redis
key configuration
cookie configuration
CORS
OAuth
rate limits
tenant configuration

Invalid production configuration must stop startup.

Never silently fall back to insecure defaults.

============================================================
46. ERROR HANDLING
============================================================

Create a consistent error model.

Examples:

400 VALIDATION_ERROR
401 AUTHENTICATION_REQUIRED
403 FORBIDDEN
409 CONFLICT
422 INVALID_INPUT
429 RATE_LIMITED
500 INTERNAL_SERVER_ERROR
503 SERVICE_UNAVAILABLE

Production responses must not reveal:

stack traces
Mongo errors
Redis credentials
filesystem paths
private keys
configuration values

============================================================
47. SECURITY DOCUMENTATION
============================================================

Create/update:

docs/security/
    threat-model.md
    secrets-management.md
    key-management.md
    authentication-security.md
    authorization-security.md
    session-security.md
    oauth-security.md
    multi-tenancy-security.md
    rate-limiting.md
    incident-response.md
    disaster-recovery.md
    production-hardening.md

============================================================
48. THREAT MODEL
============================================================

Create a real threat model covering:

credential stuffing
password attacks
session theft
refresh-token theft
token replay
XSS
CSRF
CORS abuse
OAuth attacks
tenant escape
privilege escalation
BOLA/IDOR
API key theft
OTP abuse
insider threats
database compromise
Redis compromise
secret leakage
supply-chain compromise
DoS
credential enumeration

For every threat document:

attack
impact
mitigation
test
residual risk

============================================================
49. INCIDENT RESPONSE
============================================================

Create a production incident response runbook.

Include procedures for:

JWT signing-key compromise
OAuth client-secret compromise
API-key compromise
database credential compromise
Redis credential compromise
session theft
refresh-token replay
mass account compromise
tenant isolation incident

Every incident must have:

containment
revocation
rotation
investigation
recovery
postmortem

============================================================
50. DEVELOPER EXPERIENCE
============================================================

A new developer should be able to:

git clone
npm install
copy .env.example
generate local secrets
start MongoDB
start Redis
build
run tests
start identity server

without receiving production credentials.

Provide:

npm run setup
npm run security:scan
npm run test:integration
npm run test:security
npm run test:e2e

where appropriate.

============================================================
51. FRONTEND SECURITY
============================================================

Audit @pezhwan/react.

Ensure:

private secrets never reach browser bundles.

Only public values may use:

VITE_*

Never expose:

JWT private keys
OAuth client secrets
database credentials
Redis credentials
server encryption keys

Document exactly which browser configuration is safe.

============================================================
52. PRODUCTION DEPLOYMENT
============================================================

Create a production deployment reference.

Architecture:

                    ┌──────────────┐
                    │ Load Balancer│
                    └──────┬───────┘
                           │
              ┌────────────┴────────────┐
              │                         │
       Identity Server 1        Identity Server 2
              │                         │
              └────────────┬────────────┘
                           │
                 ┌─────────┴─────────┐
                 │                   │
              MongoDB              Redis
                 │
          Backup / Recovery

Secrets should come from:

Secret Manager / KMS / Vault

Signing keys should be securely persisted and rotated.

============================================================
53. MIGRATIONS
============================================================

For every database schema change:

- migration
- backward compatibility
- index migration
- rollback strategy
- deployment order
- test migration
- production migration procedure

Do not silently alter production data.

============================================================
54. PERFORMANCE
============================================================

Measure before optimizing.

Optimize:

database indexes
Redis access
JWT verification
JWKS caching
session lookups
authorization checks
rate-limit operations

Avoid:

unbounded queries
unbounded caches
N+1 queries
unnecessary DB calls

Do not sacrifice security for performance.

============================================================
55. BACKWARD COMPATIBILITY
============================================================

Do not unnecessarily break existing consumers.

If a breaking change is required:

- document it
- provide migration
- update examples
- update tests
- update changelog
- use semantic versioning

============================================================
56. CODE QUALITY
============================================================

Use:

strict TypeScript
no implicit any
no unnecessary any
clear interfaces
small services
dependency inversion
testable components

Do not create a giant security service.

Keep security responsibilities modular.

============================================================
57. FINAL VALIDATION
============================================================

After implementation:

1. Build everything.
2. Run unit tests.
3. Run Mongo integration tests.
4. Run Redis integration tests.
5. Run security tests.
6. Run OAuth tests.
7. Run E2E tests.
8. Run load tests.
9. Run failure-injection tests.
10. Run secret scanner.
11. Run dependency scanner.
12. Inspect generated frontend bundles.
13. Search repository for secrets.
14. Review Git history.
15. Verify production configuration fails closed.
16. Verify tenant isolation.
17. Verify refresh-token race protection.
18. Verify key rotation.
19. Verify disaster recovery procedure.

============================================================
58. 9.9/10 SCORECARD
============================================================

Create a final scorecard:

Security Model             /10
Cryptography               /10
Secret Management          /10
Authentication             /10
Authorization              /10
Sessions                   /10
OAuth/OIDC                 /10
MFA/OTP                    /10
Multi-Tenancy              /10
Database Security          /10
Redis Security             /10
Rate Limiting              /10
Abuse Prevention           /10
Browser Security           /10
API Security               /10
WebSocket Security         /10
Observability              /10
Reliability                /10
Scalability                /10
Disaster Recovery          /10
Testing                    /10
CI/CD                      /10
Supply Chain               /10
Documentation              /10
Developer Experience       /10

Calculate the actual weighted overall score.

Do NOT assign 9.9 merely because the requested target is 9.9.

If something remains below production standard, report it honestly.

============================================================
59. DEFINITION OF DONE
============================================================

PEZHWAN is considered 9.9/10 production-ready ONLY when:

[ ] No real secrets exist in source code
[ ] No real secrets exist in Git history without remediation
[ ] Secret scanning passes
[ ] Production uses secure secret injection
[ ] Signing keys have lifecycle management
[ ] JWT validation is hardened
[ ] Refresh replay is detected
[ ] Refresh race conditions are handled
[ ] Sessions can be revoked
[ ] MFA is hardened
[ ] OTP abuse is controlled
[ ] CORS is strict
[ ] CSRF is enforced
[ ] OAuth/OIDC is hardened
[ ] Tenant isolation is tested
[ ] ID type mismatch is fixed
[ ] Mongo integration tests pass
[ ] Redis integration tests pass
[ ] Rate limiting is distributed
[ ] WebSocket authentication is secure
[ ] Logs are redacted
[ ] Audit trail is tamper-evident
[ ] Metrics exist
[ ] Alerts are documented
[ ] Health checks exist
[ ] Backups exist
[ ] Restore has been tested
[ ] HA behavior is validated
[ ] Failure injection passes
[ ] Load testing is performed
[ ] Dependency scanning passes
[ ] CI security gates exist
[ ] Production configuration fails closed
[ ] Threat model exists
[ ] Incident response exists
[ ] Security documentation exists
[ ] Developer setup is reproducible
[ ] SDK remains modular
[ ] No security control was weakened to pass tests

============================================================
60. FINAL REPORT FORMAT
============================================================

Return the final report in this exact structure:

# PEZHWAN Production Readiness Report

## Executive Summary

## Before vs After

Before:
6.5/10

After:
ACTUAL SCORE/10

## Architecture Changes

## Security Improvements

## Secret Management

## Key Management

## Authentication

## Authorization

## Session Security

## OAuth/OIDC

## MFA/OTP

## Multi-Tenant Isolation

## MongoDB

## Redis

## Rate Limiting

## WebSocket Security

## Observability

## Reliability

## Disaster Recovery

## Testing

## CI/CD

## Supply Chain Security

## Documentation

## Developer Experience

## Files Changed

List every important file changed.

## Database Migrations

List exact migrations and commands.

## Environment Variables

List variable NAMES only.

NEVER print actual secret values.

## Commands

Show exact setup/test/security commands.

## Security Tests

Show test count and results.

## Remaining Risks

Be honest.

## Final Scorecard

Provide category scores.

## Production Go/No-Go

Choose exactly one:

GO
GO WITH CONDITIONS
NO-GO

If the score is below 9.9:

NO-GO

Do not manipulate the score to reach 9.9.

The goal is not to make PEZHWAN look production-ready.

The goal is to make PEZHWAN actually production-ready.