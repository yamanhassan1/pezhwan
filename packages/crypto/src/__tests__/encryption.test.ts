import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  encryptAes256Gcm,
  decryptAes256Gcm,
  envelopeEncrypt,
  envelopeDecrypt,
  deriveKeyFromPassword,
} from '@pezhwan/crypto';

describe('AES-256-GCM encryption', () => {
  it('round-trips plaintext with a fresh IV', () => {
    const key = randomBytes(32);
    const result = encryptAes256Gcm(Buffer.from('sensitive payload'), key);
    assert.ok(result.iv.length === 12);
    assert.ok(result.authTag.length >= 12);
    assert.equal(decryptAes256Gcm(result, key).toString(), 'sensitive payload');
  });

  it('detects tampered ciphertext', () => {
    const key = randomBytes(32);
    const result = encryptAes256Gcm(Buffer.from('secret'), key);
    const byte = result.ciphertext[0] ?? 0;
    result.ciphertext[0] = byte ^ 0xff;
    assert.throws(() => decryptAes256Gcm(result, key));
  });

  it('binds associated data', () => {
    const key = randomBytes(32);
    const result = encryptAes256Gcm(Buffer.from('secret'), key, Buffer.from('tenant-aad'));
    assert.equal(decryptAes256Gcm(result, key, Buffer.from('tenant-aad')).toString(), 'secret');
    assert.throws(() => decryptAes256Gcm(result, key, Buffer.from('other')));
  });

  it('envelope-encrypts with a master key', () => {
    const master = randomBytes(32);
    const sealed = envelopeEncrypt(Buffer.from('envelope payload'), master);
    assert.equal(envelopeDecrypt(sealed, master).toString(), 'envelope payload');
  });

  it('derives deterministic keys from a password', () => {
    const salt = randomBytes(16);
    const first = deriveKeyFromPassword('secret', salt, 1_000);
    const second = deriveKeyFromPassword('secret', salt, 1_000);
    assert.deepEqual(first, second);
    assert.ok(first.length === 32);
  });
});
