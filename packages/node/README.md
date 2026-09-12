# @pezhwan/node

Node.js SDK facade over @pezhwan/core for non-HTTP Node services.

## Usage

```ts
import { Pezhwan, PezhwanClient, createRuntimeClient } from '@pezhwan/node';

const runtime = Pezhwan({
  tenantId: 't1',
  applicationId: 'a1',
  issuer: 'https://id.pezhwan.test',
  audience: 'pezhwan.clients',
  otpDelivery: { sendEmail: async () => {} },
});

runtime.tokens.signAccessToken({ userId, tenantId, applicationId, sessionId, roles, permissions, authMethod });
```

Error classes (AuthenticationError, TokenError, SessionError, PezhwanError, ...)
are re-exported for convenience.
