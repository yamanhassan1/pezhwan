import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateCodeVerifier, generateCodeChallenge, verifyPkce } from '@pezhwan/oauth';

describe('PKCE (RFC 7636)', () => {
  it('generates a 43+ char verifier', () => {
    const verifier = generateCodeVerifier(32);
    assert.ok(verifier.length >= 43);
    assert.ok(verifier.length <= 128);
  });

  it('derives deterministic S256 challenges', () => {
    const verifier = generateCodeVerifier();
    assert.equal(generateCodeChallenge(verifier), generateCodeChallenge(verifier));
    assert.ok(!generateCodeChallenge(verifier).includes('='));
  });

  it('verifies a matching verifier/challenge pair', () => {
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier, 'S256');
    assert.equal(verifyPkce(verifier, challenge, 'S256'), true);
    assert.equal(verifyPkce('wrong-verifier-x', challenge, 'S256'), false);
  });

  it('supports plain challenges for legacy flows', () => {
    const verifier = generateCodeVerifier();
    assert.equal(generateCodeChallenge(verifier, 'plain'), verifier);
    assert.equal(verifyPkce(verifier, verifier, 'plain'), true);
  });

  it('fails closed on missing challenge', () => {
    assert.equal(verifyPkce('verifier', null, 'S256'), false);
    assert.equal(verifyPkce('verifier', 'challenge', 'none'), false);
  });
});
