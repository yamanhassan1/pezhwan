import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateRsaKeyPair, signJwt, verifyJwt } from '@pezhwan/crypto';

function signedToken(
  payload: Record<string, unknown>,
  privateKey: string,
  options: Record<string, unknown> = {},
) {
  return signJwt(payload, privateKey, 'kid1', 'RS256', options);
}

describe('RS256 JWT sign/verify', () => {
  it('round-trips a token', () => {
    const { publicKey, privateKey } = generateRsaKeyPair();
    const token = signedToken({ sub: 'u1', tenantId: 't1' }, privateKey);
    const claims = verifyJwt(token, publicKey);
    assert.equal(claims.sub, 'u1');
    assert.equal(claims.tenantId, 't1');
  });

  it('rejects a tampered payload', () => {
    const { publicKey, privateKey } = generateRsaKeyPair();
    const token = signedToken({ sub: 'u1' }, privateKey);
    const [header, , signature] = token.split('.');
    const tampered = [
      header,
      Buffer.from(JSON.stringify({ sub: 'u2' })).toString('base64url'),
      signature,
    ].join('.');
    assert.throws(() => verifyJwt(tampered, publicKey));
  });

  it('rejects signatures from a different key', () => {
    const signer = generateRsaKeyPair();
    const other = generateRsaKeyPair();
    const token = signedToken({ sub: 'u1' }, signer.privateKey);
    assert.throws(() => verifyJwt(token, other.publicKey));
  });

  it('enforces the intended audience', () => {
    const { publicKey, privateKey } = generateRsaKeyPair();
    const token = signedToken({ sub: 'u1' }, privateKey, {
      audience: 'pezhwan.clients',
      expiresIn: 3600,
    });
    assert.ok(verifyJwt(token, publicKey, 'RS256', { audience: 'pezhwan.clients' }));
    assert.throws(() => verifyJwt(token, publicKey, 'RS256', { audience: 'other' }));
  });
});
