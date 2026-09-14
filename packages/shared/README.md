# @pezhwan/shared

The foundation package of the PEZHWAN SDK. It holds the framework-independent
types, error classes, constants, event catalogs, and validation utilities that
every other Pezhwan package (`@pezhwan/core`, `@pezhwan/express`,
`@pezhwan/react`, …) builds on. It has no runtime dependencies beyond the
standard library, so anything can import it safely.

If you are writing a plugin, a custom service, or your own SDK wrapper, this is
the package to import shared vocabulary (domain types, error codes, policies)
from.

## Installation

```bash
npm install @pezhwan/shared
```

## What's inside

| Area      | Source directory   | Contents                                                                                                                     |
| --------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Types     | `src/types/`       | Domain types and interfaces for auth, sessions, OAuth, SAML, SCIM, webhooks, tenant, risk, compliance, WebAuthn, and more.   |
| Constants | `src/constants.ts` | Defaults (TTLs, rate limits, lockout, OTP, cookies, JWT), password/API-key/backup-code policies, and the error-code catalog. |
| Errors    | `src/errors/`      | A hierarchy of typed error classes, all carrying `code`, `status`, and optional `requestId`/`details`.                       |
| Events    | `src/events/`      | The audit + domain event catalogs and builders.                                                                              |
| Utils     | `src/utils/`       | Regexes, validators (`isEmail`, `isStrongPassword`, …) and small helpers (`redactEmail`, `maskSecret`, …).                   |

## Usage

Import from the package root — every part of the surface is available from
`@pezhwan/shared` directly:

```ts
import {
  AuthenticationError,
  DEFAULT_TTL,
  PASSWORD_POLICY,
  isStrongPassword,
  redactEmail,
  createDomainEvent,
  DOMAIN_EVENT,
  type TokenClaims,
  type SessionStatus,
} from '@pezhwan/shared';
```

> Prefer the root import. The package `exports` map intentionally exposes only
> `"."`, so deep imports such as `@pezhwan/shared/src/utils/validators` will
> not resolve in a published build. Everything you need is already re-exported
> at the root.

## Types

Domain types cover the full identity surface. Highlights:

```ts
import type {
  TokenClaims, // iss, aud, sub, userId, tenantId, roles, permissions, ...
  Session, // session document shape, status, device, expiry
  OAuthClient, // registered public/confidential client
  AuthorizationCode, // one-time code + code challenge (PKCE)
  IdentityContext, // parsed from a verified access token
  AuditLogEntry, // append-only audit row
  WebhookEvent, // signed webhook payload
  ScimUser, // SCIM 2.0 user resource
  SamlAssertion, // parsed SAML assertion
  WebAuthnCredential, // passkey credential record
  ComplianceReport, // GDPR/HIPAA/PCI/SOC2/CCPA evidence
  RiskAssessment, // risk evaluation result
} from '@pezhwan/shared';
```

## Error classes

A single hierarchy rooted at `PezhwanError`. Every class pairs a stable
machine-readable `code` with an HTTP `status`, so upper layers can map errors
to responses (or UX) without string matching:

| Error                                                                                                             | Typical `status` | Meaning                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------- |
| `AuthenticationError`                                                                                             | 401              | Credentials invalid, token missing/expired, account locked.             |
| `AuthorizationError`                                                                                              | 403              | Identity is valid but lacks the required role/permission.               |
| `ValidationError`                                                                                                 | 400              | Input failed validation.                                                |
| `RateLimitError`                                                                                                  | 429              | A rate-limit budget was exhausted.                                      |
| `TokenError`                                                                                                      | 401              | Malformed/forged/unknown-key token.                                     |
| `SessionError`                                                                                                    | 401              | Session state is inconsistent (e.g. reuse detected).                    |
| `ConfigurationError`                                                                                              | 500              | Runtime misconfigured.                                                  |
| `NotFoundError`                                                                                                   | 404              | Resource does not exist.                                                |
| `ProviderError`, `SecurityDependencyError`, `SecurityEventError`, `ComplianceError`, `RiskError`, `SecurityError` | varied           | Provider failures, security-dependency outages, and other edge classes. |

`ERROR_CODES` (and the `ErrorCode` type) enumerate the stable strings used by
the whole SDK and the reference identity server.

## Constants and policies

```ts
import { DEFAULT_TTL, DEFAULT_RATE_LIMITS, PASSWORD_POLICY, API_KEY_POLICY } from '@pezhwan/shared';

DEFAULT_TTL; // access/refresh/session/otp/... TTLs in ms
DEFAULT_RATE_LIMITS; // login/register/otp/refresh/api budgets
PASSWORD_POLICY; // min 12 chars, max 128, requires 3+ classes
API_KEY_POLICY; // pzk_ prefix, 32-byte payload, max 100 keys
```

Helper constants for common idioms (`DEFAULT_COOKIE`, `DEFAULT_JWT`,
`OTP_PURPOSE`, `OTP_CHANNEL`, `LOCKOUT_POLICY`, `DEVICE_POLICY`,
`BACKUP_CODE_POLICY`) are exported too.

## Events

```ts
import { DOMAIN_EVENT, createDomainEvent, AUDIT_EVENT_SEVERITY } from '@pezhwan/shared';

const event = createDomainEvent(DOMAIN_EVENT.USER_REGISTERED, {
  tenantId: 'dev-tenant',
  userId: '...',
});

// Some severity classifiers are pre-built (SeverityClassifiedAuditEvent).
```

`DOMAIN_EVENT` catalogs the domain events the platform can emit, and the
`AUDIT_EVENT` map / `AuditEventType` describe audit events — both feed the
event store and the webhook subsystem.

## Utilities

```ts
import {
  isEmail,
  isPhone,
  isStrongPassword,
  evaluatePasswordStrength,
  slugify,
  redactEmail,
  redactPhone,
  maskSecret,
  randomToken,
  sha256Hex,
} from '@pezhwan/shared';

isStrongPassword('Str0ng!Pass#2026'); // true
evaluatePasswordStrength('abc123'); // { score, errors: [...] }
redactEmail('ada@example.com'); // 'a**@example.com'
maskSecret('pk_live_abcdef1234567890'); // 'pkl…890'
```

Validation helpers (`isEmail`, `isPhone`, `isUuid`, `isSlug`, `isBase64Url`,
`isStrongPassword`, `evaluatePasswordStrength`) implement the exact same rules
the identity server enforces, so client-side checks never disagree with the
server.

## Related docs

- [`@pezhwan/core`](../core/README.md) — the runtime engine built on these primitives.
- [`docs/api/errors.md`](../../docs/api/errors.md) — the full server error taxonomy, which mirrors `ErrorCode`.
- [`docs/developer/api-client.md`](../../docs/developer/api-client.md) — the HTTP envelope contract these errors travel in.
