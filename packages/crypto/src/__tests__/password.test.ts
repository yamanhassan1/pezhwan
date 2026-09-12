import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, isArgon2Hash } from '@pezhwan/crypto';

describe('Argon2id password hashing', () => {
  it('round-trips with a strong Argon2 hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    assert.ok(hash.startsWith('$argon2'));
    assert.equal(isArgon2Hash(hash), true);
    assert.equal(await verifyPassword('correct horse battery staple', hash), true);
    assert.equal(await verifyPassword('wrong password', hash), false);
  });

  it('rejects malformed hashes', async () => {
    assert.equal(await verifyPassword('x', 'not-a-real-hash'), false);
    assert.equal(isArgon2Hash('not-a-real-hash'), false);
  });
});
