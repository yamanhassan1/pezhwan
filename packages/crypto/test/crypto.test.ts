import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  hashPassword,
  verifyPassword,
  generateOtp,
  hashOtp,
  verifyOtp,
  KeyStore,
} from '@pezhwan/crypto';
import {
  generateToptSecretBytes,
  generateTotp,
  verifyTotp,
  generateBackupCodes,
  encodeBase32,
  buildOtpauthUri,
  secretFromBase32,
} from '@pezhwan/crypto';

test('password hashing uses Argon2 and round-trips', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.ok(hash.startsWith('$argon2'));
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('wrong', hash), false);
});

test('verifyPassword returns false for malformed hash', async () => {
  assert.equal(await verifyPassword('x', 'not-a-real-hash'), false);
});

test('OTP generation produces N digits and constant-time verify', () => {
  const code = generateOtp(6);
  assert.match(code, /^\d{6}$/);
  const hash = hashOtp(code);
  assert.equal(verifyOtp(code, hash), true);
  assert.equal(verifyOtp('000000', hash), false);
});

test('KeyStore generates, rotates, and exposes a valid JWKS', async () => {
  const store = new KeyStore('RS256');
  const firstKid = store.current.kid;
  const jwks = store.jwks();
  assert.ok(jwks.length >= 1);
  assert.equal(jwks[0]!.alg, 'RS256');
  assert.equal(jwks[0]!.use, 'sig');

  store.addKey();
  assert.ok(store.byKid(firstKid) !== undefined);
  assert.ok(store.all.length >= 2);
});

test('TOTP: same secret/step produces the expected 6-digit code', () => {
  const secret = generateToptSecretBytes(32);
  const time = 1_700_000_000;
  const first = generateTotp(secret, time);
  const second = generateTotp(secret, time);
  assert.match(first, /^\d{6}$/);
  assert.equal(first, second);
});

test('TOTP: verify accepts ±1 step clock skew and rejects wrong codes', () => {
  const secret = generateToptSecretBytes(32);
  const time = 1_700_000_000;
  const code = generateTotp(secret, time);
  assert.equal(verifyTotp(code, secret, time), true);
  // One step ahead / behind is within the default window.
  assert.equal(verifyTotp(code, secret, time + 30), true);
  assert.equal(verifyTotp(code, secret, time - 30), true);
  assert.equal(verifyTotp('123456', secret, time), false);
});

test('TOTP: base32 secret round-trips through the otpauth URI', () => {
  const secret = generateToptSecretBytes(32);
  const uri = buildOtpauthUri({ issuer: 'pezhwan', accountName: 'a@b.com', secret });
  assert.ok(uri.startsWith('otpauth://totp/'));
  const params = new URLSearchParams(new URL(uri).search);
  const decoded = secretFromBase32(params.get('secret')!);
  assert.ok(decoded !== null);
  const time = 1_700_000_000;
  assert.equal(generateTotp(decoded!, time), generateTotp(secret, time));
});

test('backup codes are high-entropy and unique', () => {
  const codes = generateBackupCodes(10, 12);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) {
    assert.ok(c.length >= 10);
  }
});