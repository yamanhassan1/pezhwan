# @pezhwan/shared

Framework-independent types, constants, error classes, events, and validation
utilities shared by every Pezhwan package (@pezhwan/core, @pezhwan/express,
@pezhwan/react, and friends).

## Modules

- `src/types`    — domain type barrels (auth, session, oauth, saml, scim, ...)
- `src/constants`— defaults, policies, audit events, error codes
- `src/errors`   — error class barrels plus compliance/risk/security errors
- `src/events`   — audit + domain event catalogs and builders
- `src/utils`    — regex, validators, and crypto/sanitization helpers

## Usage

```ts
import { DEFAULT_TTL, PezhwanError } from '@pezhwan/shared';
import { isStrongPassword } from '@pezhwan/shared/src/utils/validators';
```
