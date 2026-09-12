# Multi-factor authentication with TOTP

Add time-based one-time passwords (RFC 6238, as used by Google Authenticator,
1Password, Authy) as a second factor. After enrolment, a successful password
login no longer returns tokens — it returns an MFA challenge that the client
completes with a 6-digit code. A complete runnable example lives in
`demos/mfa-demo/`.

## Prerequisites

- The simple-auth tutorial completed: a running identity server and a registered
  user (or run `demos/mfa-demo`).
- An authenticator app capable of scanning `otpauth://` URIs.
- Where you embed the SDK directly, a `PezhwanRuntime` created with an MFA
  encryption key (see below).

## 1. Configure the encryption key

TOTP secrets are stored **encrypted at rest** (AES-256-GCM). The runtime reads
the key from `PEZHWAN_MFA_ENCRYPTION_KEY` (`apps/identity-server/src/config/env.ts`).
The value must decode to exactly 32 bytes — base64 of 32 random bytes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

- Development: optional; the demos fall back to a hard-coded dev key.
- **Production: required** — startup fails fast with
  `PEZHWAN_MFA_ENCRYPTION_KEY is required in production` and
  `MfaService` throws `INVALID_MFA_ENCRYPTION_KEY` for a wrong-length key.

When embedding the SDK, pass it to `createPezhwan`:

```ts
const runtime = createPezhwan({
  tenantId: 'dev-tenant',
  applicationId: 'dev-app',
  issuer: 'http://localhost:4011',
  audience: 'pezhwan.clients',
  mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY,
  // otpDelivery: { sendEmail: ... },
});
```

## 2. Begin setup

`POST /v1/mfa/setup` (authenticated) provisions a secret and returns the
per-user enrolment material:

```bash
curl -s -b cookies.txt -X POST \
  -H "X-CSRF-Token: $CSRF" \
  -H "Authorization: Bearer $ACCESS" \
  http://localhost:4011/v1/mfa/setup
```

```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "otpauthUri": "otpauth://totp/Pezhwan:ada@example.com?secret=...&issuer=Pezhwan",
    "backupCodes": ["a1b2c3d4e5", "...", "..."]
  }
}
```

These values come straight from `runtime.mfa.beginSetup(userId)`, which returns
`{ secret, otpauthUri, backupCodes }` (`packages/core/src/services/mfa.service.ts`).
Store the backup codes securely — the plaintext secret is returned only once.

## 3. Scan with an authenticator app

Render the `otpauthUri` as a QR code (any QR encoder) and scan it with the
authenticator. The app now derives a fresh 6-digit code every 30 seconds. The
`secret` is useful for programmatic tokens or manual entry.

## 4. Confirm and enable

`POST /v1/mfa/enable` proves the user actually holds the secret by checking one
code — that check is what activates the factor:

```bash
curl -s -b cookies.txt -X POST \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Authorization: Bearer $ACCESS" \
  -d '{"code":"123456"}' \
  http://localhost:4011/v1/mfa/enable
# { "success": true, "data": { "message": "MFA enabled" } }
```

A wrong code fails with `400 INVALID_TOTP` — keep the current code within the
30-second window (the library allows one step of clock skew).

## 5. Log in now returns a challenge

With MFA enabled, `POST /v1/auth/login` with valid credentials no longer issues
tokens. It returns:

```json
{ "success": true, "data": { "mfaRequired": true, "userId": "<userId>" } }
```

The same gate applies to `POST /v1/auth/otp/login` (passwordless OTP).

## 6. Complete the challenged login

Send the user id plus a fresh code to `POST /v1/mfa/login`:

```bash
curl -s -b cookies.txt -X POST \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"userId":"<userId>","code":"123456"}' \
  http://localhost:4011/v1/mfa/login
# { "success": true, "data": { "user": {...}, "accessToken": "...", "refreshToken": "..." } }
```

Embedded SDKs call `runtime.auth.verifyMfaLogin({ userId, applicationId, code })`
instead — see `demos/mfa-demo/server.ts` (`/api/mfa/complete-login`). In the
reference server, `/v1/mfa/*` is mounted behind `requireAuth()`, so the HTTP
route assumes an already-authenticated challenge context; the SDK path is
preferred for the browser.

## 7. Verify and disable

Step-up verification (already authenticated) checks a live code or backup code:

```bash
curl -s -b cookies.txt -X POST \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Authorization: Bearer $ACCESS" \
  -d '{"code":"123456"}' \
  http://localhost:4011/v1/mfa/verify
# { "success": true, "data": { "verified": true } }
```

Disabling also requires the current code:

```bash
curl -s -b cookies.txt -X POST \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -H "Authorization: Bearer $ACCESS" \
  -d '{"code":"123456"}' \
  http://localhost:4011/v1/mfa/disable
# { "success": true, "data": { "message": "MFA disabled" } }
```

`runtime.mfa.enable`, `verifyMfa`, `disable` and `isEnabled(userId)` back these
routes; `isEnabled` is what gates `/v1/auth/login`.

## React: useMFA and MFASetup

`@pezhwan/react` ships a `useMFA` hook and a ready-made `<MFASetup/>` component:

```tsx
import { useMFA, MFASetup } from '@pezhwan/react';

function Security() {
  const { beginSetup, enable, verify, completeMfaLogin, disable } = useMFA();
  // beginSetup() → { secret, otpauthUri, backupCodes }
  // enable('123456') → void
  // completeMfaLogin(userId, '123456') → { user?, accessToken?, refreshToken? }
  return <MFASetup onEnabled={() => alert('Two-factor enabled')} />;
}
```

The hook calls `POST /v1/mfa/setup`, `/enable`, `/verify`, `/disable` and
`/login` (`packages/react/src/hooks/useMFA.ts`). `<MFASetup/>` runs the full
enrol ceremony — fetch setup, render the URI + backup codes, confirm with a code.

## Troubleshooting

| Problem | Cause / fix |
| --- | --- |
| `INVALID_MFA_ENCRYPTION_KEY` | Key is not exactly 32 bytes when base64-decoded. Regenerate with `randomBytes(32)`. |
| Startup fails in production | `PEZHWAN_MFA_ENCRYPTION_KEY` missing — required by `assertProductionSafety`. |
| `INVALID_TOTP` on enable | Code from a previous 30s window; use the current one, keep the window open. |
| `MFA_ALREADY_ENABLED` | Enable was called after enrolment completed once already. |
| `MFA_NOT_ENABLED` on disable/verify | Factor was never enabled (`disable`/`verify` require an active factor). |
| TOTP resets after server restart | Key changed between restarts (or demos with different hard-coded keys) — secrets can't decrypt, so enrolment is required again. Persist the key. |
| Login returns `mfaRequired` but `POST /v1/mfa/login` needs auth | Reference-server route is auth-gated — call `runtime.auth.verifyMfaLogin()` in an embedded app (`demos/mfa-demo`). |
| Backup code rejected | Codes are single-use; each can complete one challenge before rotating out. |

## Further reading

- Endpoints: `docs/OPENAPI.yaml` (MFA tag)
- Router + runtime wiring: `packages/express/src/routes.extra.ts`,
  `apps/identity-server/src/server.ts`
- Secret cryptography and codes: `packages/core/src/services/mfa.service.ts`,
  `packages/crypto/src/` (TOTP helpers)
- React pieces: `packages/react/src/hooks/useMFA.ts`,
  `packages/react/src/components/MFASetup.tsx`, `MFALogin.tsx`
- Working demo: `demos/mfa-demo/`
- RFC: [RFC 6238 — TOTP](https://www.rfc-editor.org/rfc/rfc6238)