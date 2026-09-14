# @pezhwan/crypto

Cryptographic primitives for the PEZHWAN platform: password hashing, JWTs and
JWKS, AES-256-GCM encryption, OTP/TOTP (RFC 6238), secure randomness, WebAuthn
(passkeys), key-store lifecycle, and advanced tooling (post-quantum crypto,
zero-knowledge helpers, HSM adapters, SRP).

These are the exact primitives `@pezhwan/core` uses, kept framework-free so any
part of your stack can use them safely.

## Installation

```bash
npm install @pezhwan/crypto
```

## Password hashing (Argon2id)

```ts
import { hashPassword, verifyPassword, isArgon2Hash } from '@pezhwan/crypto';

const hash = await hashPassword('Str0ng!Pass#2026');
await verifyPassword('Str0ng!Pass#2026', hash); // true
isArgon2Hash(hash); // true
```

## JWTs and key stores

```ts
import { KeyStore, signJwt, verifyJwt, generateRsaKeyPair, publicKeyToJwk } from '@pezhwan/crypto';

const keyStore = KeyStore.generateKeys('active'); // RS256 key pair w/ kid + status
const token = signJwt({ sub: 'u_123', roles: ['USER'] }, keyStore.active.privateKey, {
  issuer: 'https://id.example.com',
  audience: 'pezhwan.clients',
});

const payload = verifyJwt(token, keyStore.active.publicKey, {
  issuer: 'https://id.example.com',
  audience: 'pezhwan.clients',
});
```

`KeyStore` models the key lifecycle explicitly: `GENERATED → STAGED → ACTIVE →
VERIFY-ONLY → RETIRED → REVOKED`. Public keys convert to JWKS quickly:

```ts
import { generateRsaKeyPair, publicKeyToJwk } from '@pezhwan/crypto';

const { publicKeyPem } = generateRsaKeyPair(2048);
const jwk = publicKeyToJwk(publicKeyPem, 'key-1');
// { kty: 'RSA', kid: 'key-1', use: 'sig', alg: 'RS256', n, e }
```

## Encryption (AES-256-GCM)

```ts
import {
  encryptAes256Gcm,
  decryptAes256Gcm,
  envelopeEncrypt,
  envelopeDecrypt,
} from '@pezhwan/crypto';
import { createCryptoKeyStore } from '@pezhwan/crypto';

const { ciphertext, iv, tag } = encryptAes256Gcm(Buffer.from(key), plaintext);
const decrypted = decryptAes256Gcm(Buffer.from(key), { ciphertext, iv, tag });
```

`CryptoKeyStore` (`createCryptoKeyStore()`) manages actively used keys with an
`active / retired / destroyed` lifecycle — encrypted payloads can be decrypted
as long as one of their keys is still alive, then safely lost when all are
destroyed:

```ts
const store = createCryptoKeyStore();
const kid = store.generateKey();
const sealed = envelopeEncrypt(store, kid, plaintext);
const opened = envelopeDecrypt(store, sealed);
```

## One-time passwords (HOTP/TOTP, RFC 6238)

```ts
import {
  generateToptSecretBytes,
  encodeBase32,
  generateTotp,
  verifyTotp,
  buildOtpauthUri,
  secretFromBase32,
} from '@pezhwan/crypto';

const secret = generateToptSecretBytes(32); // 32 random bytes
const base32 = encodeBase32(secret); // shared secret for the app
const otpauthUri = buildOtpauthUri({ issuer: 'Pezhwan', accountName: 'ada@example.com', secret });

// Server-side TOTP check at the current time, with a 30 s step window:
const nowSeconds = Math.floor(Date.now() / 1000);
verifyTotp(await promptUserForCode(), secret, nowSeconds, { step: 30, window: 1 });
```

For short-lived numeric codes (email/phone OTP):

```ts
import { generateOtp, hashOtp, verifyOtp } from '@pezhwan/crypto';

const code = generateOtp(6); // 6-digit code
const stash = hashOtp(code); // store the hash, never the code
verifyOtp(code, stash); // true
```

Backup codes for account recovery:

```ts
import { generateBackupCodes } from '@pezhwan/crypto';

const codes = generateBackupCodes(10, 10); // 10 x 10-char codes
```

## Secure randomness

```ts
import {
  secureRandomBytes,
  secureRandomHex,
  secureRandomBase64,
  secureRandomAlphanumeric,
  generateUuidV4,
  secureCompare,
  secureCompareString,
} from '@pezhwan/crypto';

const bits = secureRandomBytes(32);
const token = secureRandomAlphanumeric(64);
const id = generateUuidV4();

// Constant-time comparison — always use this for secrets, tokens, MACs.
secureCompareString(a, b);
```

The `timing-safe` helpers (`timingSafeCompare`, `timingSafeHexCompare`,
`timingSafeBufferCompare`, `constantTimeEqual`, `constantTimeStringEqual`) and
the HMAC/secret helpers (`validateHmacSignature`, `hashSecret`,
`verifySecret`, `validateBearerToken`, `validateCsrfToken`) cover the
verification side.

## WebAuthn / passkeys

```ts
import {
  generateChallenge,
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  serializeCredential,
  deserializeCredential,
  hashCredentialId,
  generateUserId,
} from '@pezhwan/crypto';

const userId = generateUserId();
const options = generateRegistrationOptions({
  rpId: 'example.com',
  rpName: 'Example',
  user: { id: userId, name: 'ada@example.com' },
});
const regResult = await verifyRegistrationResponse({
  rpId: 'example.com',
  options,
  response: clientAssertion,
});

const challenge = generateChallenge();
const authnOptions = generateAuthenticationOptions({ rpId: 'example.com', challenge });
const authnResult = await verifyAuthenticationResponse({
  rpId: 'example.com',
  challenge,
  credential,
  response,
});
```

`serializeCredential`/`deserializeCredential` move the credential record in and
out of a JSON-safe string for storage, and `hashCredentialId` gives you an
index-safe identifier.

## SRP

Password-authenticated key exchange helpers live in `src/srp.ts` — useful for
protocols that must never transmit the password to the server.

## Advanced tooling

- `pq/` — post-quantum primitives.
- `zk/` — zero-knowledge proof helpers.
- `hsm/` — HSM (hardware security module) adapter interfaces, so keys can live
  in hardware where compliance requires it.

## Security notes

- Secrets are handled here and never float above the crypto layer — core
  services store only hashes and derivation metadata.
- The higher-order verification helpers are designed to be **constant-time**
  where the input is secret. Prefer `secureCompare*`/`timingSafe*` over
  plain equality for tokens, codes, and signatures.
- The TOTP secret generator is exported as `generateToptSecretBytes` (a
  long-standing typo in the export name). It returns RFC 6238 secret bytes;
  there is no properly-spelled alias, so new code should use this name and we
  keep it stable to avoid breaking consumers.

## Related docs

- [`@pezhwan/core`](../core/README.md) — the runtime that consumes these primitives.
- [`docs/security/key-management.md`](../../docs/security/key-management.md) — key lifecycle, rotation, and storage guidance.
- [`docs/tutorials/mfa-setup.md`](../../docs/tutorials/mfa-setup.md) — using TOTP end to end.
