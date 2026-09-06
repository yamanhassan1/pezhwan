# Passkeys and FIDO2 authentication

Passkeys replace passwords with **phishing-resistant** sign-in backed by a
public/private keypair that never leaves the user's device. The user confirms
the sign-in with their face, fingerprint, or device PIN — and because the
credential is scoped to your site's origin (`rpId`), a look-alike website can't
replay it. Pezhwan supports both:

- **Passkeys** — discoverable (resident) credentials that sync across the
  user's devices and work without any server-side account lookup first.
- **Security keys** — roaming authenticators such as YubiKey or SoloKey.

This guide walks through wiring them into your service. A complete runnable
example lives in `demos/passkeys/`.

## How it fits together

Pezhwan splits WebAuthn into two layers:

| Layer               | Location                            | Responsibility                                                                                                                  |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Verifier primitives | `@pezhwan/crypto` `webauthn.ts`     | Option generation, CBOR attestation parsing, COSE signature verification (ES256/RS256), counter checks. Pure and unit-testable. |
| Enterprise service  | `services/auth/webauthn.service.ts` | Challenge store, origin/rpId policy, credential persistence and lifecycle, audit events, cloned-authenticator detection.        |

Your server calls the service; your browser calls
`navigator.credentials.create()` / `.get()` with the returned options.

## 1. Configure the service

```ts
import { WebAuthnService } from '@pezhwan/core';

const webauthn = new WebAuthnService({
  rpName: 'Pezhwan Demo',
  rpId: 'localhost', // must match the page origin you serve
  origins: ['http://localhost:5173'],
  requireUserVerification: true, // face/Touch ID/pin
  requireResidentKey: false, // set true to require passkeys
  attestation: 'none',
});
```

Notes on the important fields:

- `rpId` is the **relying-party id**. For `https://auth.example.com` this is
  `auth.example.com`. It is hashed and compared inside the authenticator data,
  so it must exactly match your deployment.
- `origins` is the allowlist checked against `clientDataJSON.origin`. Keep it
  exactly as the browser reports it (scheme + host + port).
- Set `requireResidentKey: true` and `requireUserVerification: true` for a
  passkey-first flow.

## 2. Register a passkey

Registration is a two-step ceremony: mint a challenge, then verify the
attestation the browser produces.

```ts
// Step A — begin (returns browser-ready options + the challenge to expect)
const { options, expectedChallenge } = await webauthn.beginRegistration(
  userId,
  'ada@example.com',
  'Ada Lovelace',
  await webauthn.listCredentialIds(userId), // exclude already-registered keys
);

// send `options` to the browser → navigator.credentials.create(options)
// the browser returns a PublicKeyCredential (registrationResult)

// Step B — complete (validates challenge, origin, rpId, attestation,
// then persists the COSE public key + counter)
const summary = await webauthn.completeRegistration(
  registrationResult,
  expectedChallenge,
  origin, // e.g. 'http://localhost:5173'
);
```

That's it. The credential is now stored in the `WebAuthnCredential` model keyed
to the user, and can be listed under `manage-devices` style UI via
`listCredentials(userId)`.

## 3. Authenticate with a passkey

The same two-step shape, mirrored for sign-in.

```ts
const { options, expectedChallenge } = await webauthn.beginAuthentication(
  userId, // required for non-resident flows
  await webauthn.listCredentialIds(userId), // optional allowlist
);

// browser → navigator.credentials.get(options) → authenticationResult

const ok = await webauthn.completeAuthentication(authenticationResult, expectedChallenge, origin);
```

Behind the scenes the verifier:

1. Re-checks the challenge and origin from `clientDataJSON`.
2. Confirms the `rpIdHash` matches and the user-presence flag is set.
3. Verifies the authenticator's signature against the **stored COSE public
   key**.
4. Compares the **signing counter** against the stored value. A counter that
   goes backward is treated as a possible cloned authenticator and the login
   is refused.

## 4. Manage credentials

The service exposes the lifecycle operations a typical "devices" screen needs:

```ts
await webauthn.listCredentials(userId); // id, nickname, last used, transports
await webauthn.renameCredential(userId, credentialId, 'Work laptop');
await webauthn.deleteCredential(userId, credentialId);
await webauthn.revokeCredential(userId, credentialId); // soft-disable, keeps history
await webauthn.hasCredentials(userId); // quick check for the login screen
```

## 5. Client side (React)

The React SDK ships ready-made pieces if you don't want to hand-roll the
`navigator.credentials` calls:

```tsx
import { useWebAuthn, WebAuthnLogin } from '@pezhwan/react';

function Login() {
  const { register, authenticate } = useWebAuthn({ baseUrl: 'http://localhost:3000' });
  // or drop in <WebAuthnLogin /> and let it render the ceremony UI.
}
```

Every other SDK (Vue, Angular, node, CLI, and the framework languages) exposes
the same begin/complete contract, so the server flow above applies unchanged.

## Security checklist

- Serve over **HTTPS** (or a `localhost` origin in development) — WebAuthn
  requires a secure context.
- Store credentials on the server as the parsed **COSE public key** (Pezhwan
  does this for you) — never a client-supplied string.
- Keep the challenge store short-lived. Pezhwan expires challenges by default
  after five minutes and a challenge is single-use.
- Enable MFA alongside passkeys for high-value accounts; treat passkeys as a
  strong primary factor, not a replacement for authorization policy.
- Watch the audit log for `WEB_AUTHN_*` events so unusual registration or
  repeated failed authentication is visible.

## Further reading

- Protocol details: [WebAuthn Level 2](https://www.w3.org/TR/webauthn-2/)
- Attestation and signature verification implementation:
  `packages/crypto/src/webauthn.ts`
- Service and credential model: `packages/core/src/services/auth/webauthn.service.ts`,
  `packages/core/src/models/webauthn-credential.model.ts`
- Working demo: `demos/passkeys/`
