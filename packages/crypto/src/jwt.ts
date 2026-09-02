/**
 * PEZHWAN — asymmetric JWT signing (RS256) with key rotation and JWKS.
 *
 * Prefer RS256/ES256/EdDSA over symmetric HS256 for distributed identity
 * infrastructure: public keys are published via JWKS while private keys stay
 * secret, enabling independent consumers to verify tokens without sharing a
 * secret.
 */

import {
  generateKeyPairSync,
  createPublicKey,
  createPrivateKey,
  randomUUID,
} from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { JwtAlgorithm } from '@pezhwan/shared';

type JwtLibraryAlgorithm = jwt.Algorithm;

/** A single signing key with its unique key id (kid). */
export interface SigningKey {
  kid: string;
  // PEM-encoded (or crypto.KeyObject) representations
  publicKey: string;
  privateKey: string;
  /** Epoch ms when this key was generated (for rotation bookkeeping). */
  createdAt: number;
  /** Epoch ms after which this key is retired. */
  expiresAt: number;
}

/** JWKS JSON Web Key Set entry (public, safe to publish). */
export interface JwkJson {
  kty: string;
  kid: string;
  n?: string;
  e?: string;
  alg: JwtAlgorithm;
  use: 'sig';
  key_ops?: string[];
}

/**
 * Generate an RSA key pair suitable for RS256 JWT signing.
 * @param modulusLength default 2048 bits.
 */
export function generateRsaKeyPair(
  modulusLength = 2048,
): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

/** Create a key object from a PEM public string. */
export function importPublicKey(pem: string) {
  return createPublicKey(pem);
}

/** Create a key object from a PEM private string. */
export function importPrivateKey(pem: string) {
  return createPrivateKey(pem);
}

/**
 * Build the public JSON Web Key (JWK) for a given RSA public key + kid.
 * Used to construct the JWKS endpoint response.
 */
export function publicKeyToJwk(publicKeyPem: string, kid: string): JwkJson {
  const key = createPublicKey(publicKeyPem);
  const jwk = key.export({ format: 'jwk' }) as {
    n?: string;
    e?: string;
    kty?: string;
  };
  return {
    kty: jwk.kty ?? 'RSA',
    kid,
    n: jwk.n,
    e: jwk.e,
    alg: 'RS256',
    use: 'sig',
  };
}

/**
 * KeyStore manages the current + previous signing keys and supports rotation.
 * It is designed to be backed by persistent storage so instances in an HA
 * cluster share key material (see @pezhwan/core KeyStore persistence).
 */
export class KeyStore {
  private readonly keys = new Map<string, SigningKey>();
  private readonly algorithm: JwtAlgorithm;

  constructor(algorithm: JwtAlgorithm = 'RS256') {
    this.algorithm = algorithm;
  }

  /** All keys currently held (used for persistence/rotation bookkeeping). */
  get all(): SigningKey[] {
    return [...this.keys.values()];
  }

  /** The currently active signing key (for new tokens). */
  get current(): SigningKey {
    const all = [...this.keys.values()].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
    const active = all.find((k) => k.expiresAt > Date.now());
    if (active) {
      return active;
    }
    // No valid key — generate one.
    return this.addKey();
  }

  /** Look up a key by kid (for verification). Returns undefined if unknown. */
  byKid(kid: string): SigningKey | undefined {
    return this.keys.get(kid);
  }

  /**
   * Drop all currently-held keys. ONLY intended at bootstrap: before serving
   * traffic, an initKeyPersistence() flow clears the throwaway startup key so
   * the durable store can become authoritative.
   */
  clear(): void {
    this.keys.clear();
  }

  /** Add / upsert a key (used on recovery or explicit provisioning). */
  addKey(
    kid: string = randomUUID(),
    ttlMs = 30 * 24 * 60 * 60 * 1000, // 30 days
  ): SigningKey {
    const { publicKey, privateKey } = generateRsaKeyPair();
    const now = Date.now();
    const key: SigningKey = {
      kid,
      publicKey,
      privateKey,
      createdAt: now,
      expiresAt: now + ttlMs,
    };
    this.keys.set(kid, key);
    this.prune();
    return key;
  }

  /** Add a key from persisted material (restore from disk/store). */
  addKeyWithMaterial(key: SigningKey): void {
    if (!key?.kid || !key?.publicKey || !key?.privateKey) {
      throw new Error('Cannot restore an incomplete signing key');
    }
    this.keys.set(key.kid, key);
    this.prune();
  }

  /** All non-expired public keys as a JWKS (kid + public parts only). */
  jwks(): JwkJson[] {
    const now = Date.now();
    return [...this.keys.values()]
      .filter((k) => k.expiresAt > now)
      .map((k) => publicKeyToJwk(k.publicKey, k.kid));
  }

  /** Remove expired keys to bound memory in the no-persistence path. */
  private prune(): void {
    const now = Date.now();
    for (const [kid, key] of this.keys) {
      if (key.expiresAt < now) {
        this.keys.delete(kid);
      }
    }
  }
}

/**
 * Sign a payload with the given private key + kid.
 * @returns a compact JWS string.
 */
export function signJwt(
  payload: Record<string, unknown>,
  privateKeyPem: string,
  kid: string,
  algorithm: JwtAlgorithm = 'RS256',
  options: SignOptions = {},
): string {
  return jwt.sign(payload, importPrivateKey(privateKeyPem), {
    algorithm: algorithm as JwtLibraryAlgorithm,
    keyid: kid,
    ...options,
  } as SignOptions);
}

/**
 * Verify a JWT against the public key denoted by its `kid`.
 * @returns the decoded payload.
 * @throws {TokenError} on any verification failure.
 */
export function verifyJwt(
  token: string,
  publicKeyPem: string,
  algorithm: JwtAlgorithm = 'RS256',
  options: jwt.VerifyOptions = {},
): Record<string, unknown> {
  return jwt.verify(token, importPublicKey(publicKeyPem), {
    algorithms: [algorithm as JwtLibraryAlgorithm],
    ...options,
  }) as Record<string, unknown>;
}
