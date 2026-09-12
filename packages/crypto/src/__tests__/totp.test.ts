import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateToptSecretBytes,
  generateTotp,
  verifyTotp,
  hotp,
  buildOtpauthUri,
  secretFromBase32,
  generateBackupCodes,
} from '@pezhwan/crypto';

const TIME = 1_700_000_000;

describe('TOTP (RFC 6238)', () => {
  it('generates a deterministic 6-digit code per step', () => {
    const secret = generateToptSecretBytes(32);
    const code = generateTotp(secret, TIME);
    assert.match(code, /^\d{6}$/);
    assert.equal(generateTotp(secret, TIME), code);
  });

  it('accepts +/-1 step clock skew and rejects wrong codes', () => {
    const secret = generateToptSecretBytes(32);
    const code = generateTotp(secret, TIME);
    assert.equal(verifyTotp(code, secret, TIME), true);
    assert.equal(verifyTotp(code, secret, TIME + 30), true);
    assert.equal(verifyTotp(code, secret, TIME - 30), true);
    assert.equal(verifyTotp('123456', secret, TIME), false);
  });

  it('hotp steps change the code per counter', () => {
    const secret = generateToptSecretBytes(32);
    const one = hotp(secret, 1, 6);
    const two = hotp(secret, 2, 6);
    assert.match(one, /^\d{6}$/);
    assert.notEqual(one, two);
  });

  it('round-trips secrets through otpauth URIs', () => {
    const secret = generateToptSecretBytes(32);
    const uri = buildOtpauthUri({ issuer: 'pezhwan', accountName: 'a@b.co', secret });
    assert.ok(uri.startsWith('otpauth://totp/'));
    const b32 = new URL(uri).searchParams.get('secret');
    assert.ok(b32);
    const decoded = secretFromBase32(b32);
    assert.ok(decoded);
    assert.equal(generateTotp(decoded, TIME), generateTotp(secret, TIME));
  });

  it('generates unique high-entropy backup codes', () => {
    const codes = generateBackupCodes(10, 12);
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    assert.ok(codes.every((code) => code.length >= 10));
  });
});
