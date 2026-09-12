import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createCryptoKeyStore, type CryptoKey } from '@pezhwan/crypto';

function makeKey(
  id: string,
  purpose: CryptoKey['purpose'] = 'encryption',
  createdAt = new Date(),
): CryptoKey {
  return {
    id,
    material: randomBytes(32),
    createdAt,
    purpose,
    status: 'ACTIVE',
    algorithm: 'aes-256-gcm',
  };
}

describe('CryptoKeyStore lifecycle', () => {
  it('stores and retrieves keys', () => {
    const store = createCryptoKeyStore();
    store.addKey(makeKey('k1'));
    assert.equal(store.getKey('k1')?.id, 'k1');
    assert.equal(store.getKey('missing'), null);
  });

  it('returns the most recently added active key', () => {
    const store = createCryptoKeyStore();
    const early = makeKey('k1', 'encryption', new Date(Date.now() - 1000));
    const late = makeKey('k2');
    store.addKey(early);
    store.addKey(late);
    assert.equal(store.getActiveKey('encryption')?.id, 'k2');
  });

  it('retires active keys and keeps them readable', () => {
    const store = createCryptoKeyStore();
    store.addKey(makeKey('k1'));
    assert.equal(store.retireKey('k1'), true);
    assert.equal(store.getKey('k1')?.status, 'RETIRED');
    assert.equal(store.getActiveKey('encryption'), null);
    assert.equal(store.retireKey('k1'), false);
  });

  it('destroys keys and invalidates lookups', () => {
    const store = createCryptoKeyStore();
    store.addKey(makeKey('k1'));
    assert.equal(store.destroyKey('k1'), true);
    assert.equal(store.getKey('k1'), null);
  });

  it('lists keys with purpose/status filters', () => {
    const store = createCryptoKeyStore();
    store.addKey(makeKey('k-sig', 'signing'));
    store.addKey(makeKey('k-enc', 'encryption'));
    const signing = store.listKeys({ purpose: 'signing' });
    assert.equal(signing.length, 1);
    assert.equal(signing[0]?.id, 'k-sig');
    assert.equal(store.listKeys({ status: 'ACTIVE' }).length, 2);
  });
});
