/**
 * PEZHWAN — asymmetric JWT signing with key rotation and JWKS.
 *
 * Any algorithm from the `JwtSigningAlgorithm` set is supported:
 * classical (RS256/ES256/EdDSA), post-quantum (ML-DSA-65/87) and hybrid
 * (classical + ML-DSA combined signatures). The algorithm is a config value —
 * callers decide which algorithm is used (e.g. from a `crypto` config block)
 * so algorithm swaps require zero code changes. Algorithm-specific artifacts
 * (keys, JWKS entries, signatures) are derived from the configured algorithm.
 *
 * HS256 is symmetric (shared HMAC secret, no public key) and therefore out of
 * scope for the public JWKS model: it is rejected by the key-generating paths.
 *
 * All operations are synchronous: ML-DSA keygen/sign/verify are direct
 * (non-async) noble calls, matching the jsonwebtoken API shape so the whole
 * KeyStore chain (rotation, persistence, signing) stays sync like the
 * classical paths.
 *
 * Hybrid JWS shape (transitional, non-standard): a 4-segment compact token
 * `header.payload.<classicalSig>.<pqSig>` whose header carries `alg` and a
 * `pqc_kid` referencing the ML-DSA public key. Both signatures cover the same
 * `header.payload` signing input and BOTH must verify for acceptance.
 * Base64url never contains '.', so segments are unambiguous regardless of
 * signature length. For ES256 the classical leg is the raw JWS r||s encoding.
 */

import {
  generateKeyPairSync,
  createPublicKey,
  createPrivateKey,
  randomUUID,
  sign as nodeSign,
  verify as nodeVerify,
} from 'node:crypto';
import { ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { DILITHIUM_PARAMS } from './pq/dilithium.ts';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { JwtAlgorithm } from '@pezhwan/shared';

type JwtLibraryAlgorithm = jwt.Algorithm;

/** Post-quantum / hybrid signing algorithms. */
export type PqSigningAlgorithm =
  'ML-DSA-65' | 'ML-DSA-87' | 'hybrid-RS256-MLDSA65' | 'hybrid-ES256-MLDSA65';

/** Any algorithm a PEZHWAN signing key may use. */
export type JwtSigningAlgorithm = JwtAlgorithm | PqSigningAlgorithm;

/** A single signing key with its unique key id (kid). */
export interface SigningKey {
  kid: string;
  /** Algorithm this key material backs.
   *  Classical/hybrid: `publicKey`/`privateKey` (PEM) required.
   *  Pure PQ: `pqPublicKey`/`pqPrivateKey` (base64url raw) required. */
  algorithm: JwtSigningAlgorithm;
  /** PEM-encoded public key (classical / hybrid keys). */
  publicKey?: string;
  /** PEM-encoded private key (classical / hybrid keys). */
  privateKey?: string;
  /** base64url raw ML-DSA public key (PQ / hybrid keys). */
  pqPublicKey?: string;
  /** base64url raw ML-DSA private key (PQ / hybrid keys). */
  pqPrivateKey?: string;
  /** Epoch ms when this key was generated (rotation bookkeeping). */
  createdAt: number;
  /** Lifecycle state controlling signing, verification, and publication. */
  status: KeyStatus;
  /** Epoch ms when this key became active, if activated. */
  activatedAt?: number;
  /** Epoch ms when this key stopped signing new tokens, if retired. */
  retiredAt?: number;
  /** Epoch ms when this key was emergency-revoked, if revoked. */
  revokedAt?: number;
  /** Epoch ms after which this key is retired. */
  expiresAt: number;
}

export type KeyStatus = 'GENERATED' | 'STAGED' | 'ACTIVE' | 'VERIFY-ONLY' | 'RETIRED' | 'REVOKED';

/** JWKS JSON Web Key Set entry (public, safe to publish). */
export interface JwkJson {
  kty: string;
  kid: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
  alg: JwtSigningAlgorithm;
  use: 'sig';
  key_ops?: string[];
}

/** Key material produced for an algorithm (classical and/or PQ leg). */
export interface SigningKeyMaterial {
  publicKey?: string;
  privateKey?: string;
  pqPublicKey?: string;
  pqPrivateKey?: string;
}

function isHybrid(
  algorithm: JwtSigningAlgorithm,
): algorithm is 'hybrid-RS256-MLDSA65' | 'hybrid-ES256-MLDSA65' {
  return algorithm === 'hybrid-RS256-MLDSA65' || algorithm === 'hybrid-ES256-MLDSA65';
}

function isPurePq(algorithm: JwtSigningAlgorithm): algorithm is 'ML-DSA-65' | 'ML-DSA-87' {
  return algorithm === 'ML-DSA-65' || algorithm === 'ML-DSA-87';
}

function base64url(input: string | Uint8Array): string {
  if (typeof input === 'string') {
    return Buffer.from(input).toString('base64url');
  }
  // noble types Uint8Array as Uint8Array<ArrayBufferLike>, which Buffer.from
  // refuses without a cast; copying into a fresh ArrayBuffer-backed view is
  // always safe, includes Buffer inputs that are offset views.
  const copy = new Uint8Array(input);
  return Buffer.from(copy.buffer as ArrayBuffer, copy.byteOffset, copy.byteLength).toString(
    'base64url',
  );
}

function unbase64url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

/** The ML-DSA parameter-set variant backing an algorithm name. */
function dlParamsFor(algorithm: 'ML-DSA-65' | 'ML-DSA-87'): (typeof DILITHIUM_PARAMS)[string] {
  return algorithm === 'ML-DSA-87'
    ? DILITHIUM_PARAMS['Dilithium5']!
    : DILITHIUM_PARAMS['Dilithium3']!;
}

function nobleMlDsa(algorithm: 'ML-DSA-65' | 'ML-DSA-87'): typeof ml_dsa65 {
  return algorithm === 'ML-DSA-87' ? ml_dsa87 : ml_dsa65;
}

/** The classical algorithm merged into a hybrid name. */
function classicalAlgorithmOf(
  algorithm: 'hybrid-RS256-MLDSA65' | 'hybrid-ES256-MLDSA65',
): JwtAlgorithm {
  return algorithm === 'hybrid-ES256-MLDSA65' ? 'ES256' : 'RS256';
}

/**
 * Generate an RSA key pair suitable for RS256 JWT signing.
 * @param modulusLength default 2048 bits.
 */
export function generateRsaKeyPair(modulusLength = 2048): {
  publicKey: string;
  privateKey: string;
} {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

/**
 * Generate PEM key material appropriate for a classical asymmetric JWT
 * algorithm: RS256 → RSA-2048, ES256 → ECDSA P-256, EdDSA → Ed25519.
 * HS256 has no asymmetric key pair and is rejected here (fail fast).
 */
export function generateKeyPairForAlgorithm(algorithm: JwtAlgorithm): {
  publicKey: string;
  privateKey: string;
} {
  switch (algorithm) {
    case 'ES256': {
      const { publicKey, privateKey } = generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      return { publicKey, privateKey };
    }
    case 'EdDSA': {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      return { publicKey, privateKey };
    }
    case 'RS256':
      return generateRsaKeyPair();
    case 'HS256':
      throw new Error(
        `JWT algorithm ${algorithm} is symmetric and cannot back a public JWKS signing key`,
      );
    default:
      throw new Error(`Unsupported JWT signing algorithm: ${String(algorithm)}`);
  }
}

/**
 * Generate the full key material for any supported signing algorithm.
 * Classic → PEM legs only; pure PQ → raw ML-DSA legs only; hybrid → both.
 */
export function generateSigningKeyPair(algorithm: JwtSigningAlgorithm): SigningKeyMaterial {
  if (isPurePq(algorithm)) {
    const { publicKey, secretKey } = nobleMlDsa(algorithm).keygen();
    return { pqPublicKey: base64url(publicKey), pqPrivateKey: base64url(secretKey) };
  }
  if (isHybrid(algorithm)) {
    const classical = generateKeyPairForAlgorithm(classicalAlgorithmOf(algorithm));
    const { publicKey, secretKey } = ml_dsa65.keygen();
    return {
      ...classical,
      pqPublicKey: base64url(publicKey),
      pqPrivateKey: base64url(secretKey),
    };
  }
  return generateKeyPairForAlgorithm(algorithm as JwtAlgorithm);
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
 * Build the public JSON Web Key (JWK) for a public key + kid.
 * JWK shape and metadata are derived from the key material (RSA: n/e,
 * EC: crv/x/y, OKP/Ed25519: crv/x) and the configured algorithm.
 */
export function publicKeyToJwk(
  publicKeyPem: string,
  kid: string,
  algorithm: JwtAlgorithm = 'RS256',
): JwkJson {
  const key = createPublicKey(publicKeyPem);
  const jwk = key.export({ format: 'jwk' }) as {
    kty?: string;
    n?: string;
    e?: string;
    crv?: string;
    x?: string;
    y?: string;
  };
  const entry: JwkJson = {
    kty: jwk.kty ?? 'RSA',
    kid,
    alg: algorithm,
    use: 'sig',
  };
  if (entry.kty === 'RSA') {
    entry.n = jwk.n;
    entry.e = jwk.e;
  } else if (entry.kty === 'EC') {
    entry.crv = jwk.crv;
    entry.x = jwk.x;
    entry.y = jwk.y;
  } else if (entry.kty === 'OKP') {
    entry.crv = jwk.crv;
    entry.x = jwk.x;
  }
  return entry;
}

/** Build the JWKS entry for a raw ML-DSA public key (kty "ML-DSA"). */
export function pqPublicKeyToJwk(
  pqPublicKeyB64: string,
  kid: string,
  algorithm: 'ML-DSA-65' | 'ML-DSA-87',
): JwkJson {
  return {
    kty: 'ML-DSA',
    kid,
    crv: algorithm,
    x: pqPublicKeyB64,
    alg: algorithm,
    use: 'sig',
    key_ops: ['verify'],
  };
}

/** Decode + length-check a base64url PQ leg. Throws on structural mismatch. */
function validatePqLeg(value: string | undefined, expectedBytes: number, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing ${label} for PQ/hybrid signing key`);
  }
  let buf: Buffer;
  try {
    buf = unbase64url(value);
  } catch {
    throw new Error(`Invalid ${label} encoding for PQ/hybrid signing key`);
  }
  if (buf.length !== expectedBytes) {
    throw new Error(
      `Invalid ${label} length for PQ signing key: expected ${expectedBytes}, got ${buf.length}`,
    );
  }
}

/**
 * KeyStore manages the current + previous signing keys and supports rotation.
 * It is designed to be backed by persistent storage so instances in an HA
 * cluster share key material (see @pezhwan/core KeyStore persistence).
 */
export class KeyStore {
  private readonly keys = new Map<string, SigningKey>();
  private readonly algorithm: JwtSigningAlgorithm;

  constructor(algorithm: JwtSigningAlgorithm = 'RS256') {
    this.algorithm = algorithm;
  }

  /** The configured signing algorithm. */
  get configuredAlgorithm(): JwtSigningAlgorithm {
    return this.algorithm;
  }

  /** All keys currently held (used for persistence/rotation bookkeeping). */
  get all(): SigningKey[] {
    return [...this.keys.values()];
  }

  /** The currently active signing key (for new tokens). */
  get current(): SigningKey {
    const all = [...this.keys.values()].sort((a, b) => b.createdAt - a.createdAt);
    const active = all.find((k) => k.status === 'ACTIVE' && k.expiresAt > Date.now());
    if (active) {
      return active;
    }
    // No valid key — generate one.
    return this.addKey();
  }

  /** Look up a key by kid (for verification). Returns undefined if unknown. */
  byKid(kid: string): SigningKey | undefined {
    const key = this.keys.get(kid);
    return key && key.status !== 'REVOKED' && key.expiresAt > Date.now() ? key : undefined;
  }

  /**
   * Drop all currently-held keys. ONLY intended at bootstrap: before serving
   * traffic, an initKeyPersistence() flow clears the throwaway startup key so
   * the durable store can become authoritative.
   */
  clear(): void {
    this.keys.clear();
  }

  /** Add / upsert a freshly generated key (used on bootstrap and rotation). */
  addKey(kid: string = randomUUID(), ttlMs = 30 * 24 * 60 * 60 * 1000): SigningKey {
    const material = generateSigningKeyPair(this.algorithm);
    const now = Date.now();
    const key: SigningKey = {
      kid,
      algorithm: this.algorithm,
      ...material,
      createdAt: now,
      status: 'ACTIVE',
      activatedAt: now,
      expiresAt: now + ttlMs,
    };
    this.keys.set(kid, key);
    this.prune();
    return key;
  }

  /** Add a key from persisted material (restore from disk/store). */
  addKeyWithMaterial(key: SigningKey): void {
    if (!key?.kid || !Number.isFinite(key.createdAt) || !Number.isFinite(key.expiresAt)) {
      throw new Error('Cannot restore an incomplete signing key');
    }
    const algorithm: JwtSigningAlgorithm = key.algorithm ?? 'RS256';
    try {
      if (isPurePq(algorithm)) {
        const params = dlParamsFor(algorithm);
        validatePqLeg(key.pqPublicKey, params.publicKeyBytes, 'public key');
        validatePqLeg(key.pqPrivateKey, params.privateKeyBytes, 'private key');
      } else {
        if (!key.publicKey || !key.privateKey) {
          throw new Error('Missing PEM key material');
        }
        // PEM validity is enforced at ADOPTION time, not lazily at sign/verify.
        createPublicKey(key.publicKey);
        createPrivateKey(key.privateKey);
        if (
          createPublicKey(key.privateKey)
            .export({ format: 'der', type: 'spki' })
            .equals(createPublicKey(key.publicKey).export({ format: 'der', type: 'spki' })) ===
          false
        ) {
          throw new Error('public/private key material do not match');
        }
        if (isHybrid(algorithm)) {
          const params = dlParamsFor('ML-DSA-65');
          validatePqLeg(key.pqPublicKey, params.publicKeyBytes, 'PQ public key');
          validatePqLeg(key.pqPrivateKey, params.privateKeyBytes, 'PQ private key');
        }
      }
    } catch (err) {
      throw new Error(
        `Cannot restore an incomplete signing key (invalid ${key.kid} key material): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const restored: SigningKey = {
      ...key,
      algorithm,
      status: key.status ?? 'ACTIVE',
      activatedAt: key.activatedAt ?? key.createdAt,
    };
    this.keys.set(restored.kid, restored);
    this.prune();
  }

  /** All non-expired public keys as a JWKS (kid + public parts only). */
  jwks(): JwkJson[] {
    const now = Date.now();
    const entries: JwkJson[] = [];
    for (const key of this.keys.values()) {
      if (key.expiresAt <= now) {
        continue;
      }
      if (key.status !== 'ACTIVE' && key.status !== 'VERIFY-ONLY') {
        continue;
      }
      if (isPurePq(key.algorithm)) {
        entries.push(pqPublicKeyToJwk(key.pqPublicKey!, key.kid, key.algorithm));
        continue;
      }
      if (isHybrid(key.algorithm)) {
        // Publish BOTH legs: the classical JWK (historical consumers) and the
        // PQ JWK (post-quantum consumers) under a distinct "-pqc" kid.
        entries.push(publicKeyToJwk(key.publicKey!, key.kid, classicalAlgorithmOf(key.algorithm)));
        entries.push(pqPublicKeyToJwk(key.pqPublicKey!, `${key.kid}-pqc`, 'ML-DSA-65'));
        continue;
      }
      entries.push(publicKeyToJwk(key.publicKey!, key.kid, key.algorithm as JwtAlgorithm));
    }
    return entries;
  }

  /** Stop signing with the current key while keeping it available for verification. */
  retire(kid: string): void {
    const key = this.keys.get(kid);
    if (!key || key.status === 'REVOKED') {
      throw new Error(`Cannot retire unknown or revoked signing key "${kid}"`);
    }
    key.status = 'VERIFY-ONLY';
    key.retiredAt = Date.now();
  }

  /** Emergency revoke a key so it is no longer accepted or published. */
  revoke(kid: string): void {
    const key = this.keys.get(kid);
    if (!key) {
      throw new Error(`Cannot revoke unknown signing key "${kid}"`);
    }
    key.status = 'REVOKED';
    key.revokedAt = Date.now();
  }

  /** Sign a payload with the current active key (algorithm-aware). */
  sign(payload: Record<string, unknown>, options: SignOptions = {}): string {
    return signToken(payload, this.current, options);
  }

  /** Verify a token against the key denoted by its kid (algorithm-aware). */
  verify(token: string, options: jwt.VerifyOptions = {}): Record<string, unknown> {
    const kid = readKid(token);
    const key = this.byKid(kid);
    if (!key) {
      throw new jwt.JsonWebTokenError(`unknown kid: ${kid ? `<${kid}>` : '<missing>'}`);
    }
    return verifyToken(token, key, options);
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

// ---------------------------------------------------------------------------
// Signing / verification — algorithm dispatch
// ---------------------------------------------------------------------------

/**
 * Sign a payload with the given key material. Dispatches on the key's
 * algorithm: classical (jsonwebtoken), EdDSA (manual), pure ML-DSA,
 * or classical+ML-DSA hybrid. @returns a compact JWS string.
 */
export function signToken(
  payload: Record<string, unknown>,
  key: SigningKey,
  options: SignOptions = {},
): string {
  if (isHybrid(key.algorithm)) {
    return signHybridJwt(payload, key, options);
  }
  if (isPurePq(key.algorithm)) {
    return signMlDsaJwt(payload, key, options);
  }
  if (key.algorithm === 'EdDSA') {
    return signEdDsaJwt(payload, key.privateKey!, key.kid, options);
  }
  return jwt.sign(payload, importPrivateKey(key.privateKey!), {
    algorithm: key.algorithm as JwtLibraryAlgorithm,
    keyid: key.kid,
    ...options,
  } as SignOptions);
}

/**
 * Verify a JWT against the signing key denoted by its `kid`.
 * @returns the decoded payload.
 * @throws on any verification failure (algorithm-aware).
 */
export function verifyToken(
  token: string,
  key: SigningKey,
  options: jwt.VerifyOptions = {},
): Record<string, unknown> {
  if (isHybrid(key.algorithm)) {
    return verifyHybridJwt(token, key, options);
  }
  if (isPurePq(key.algorithm)) {
    return verifyMlDsaJwt(token, key, options);
  }
  if (key.algorithm === 'EdDSA') {
    return verifyEdDsaJwt(token, key.publicKey!, options);
  }
  return jwt.verify(token, importPublicKey(key.publicKey!), {
    algorithms: [key.algorithm as JwtLibraryAlgorithm],
    ...options,
  }) as Record<string, unknown>;
}

/**
 * Legacy entry point: sign with PEM material instead of a SigningKey.
 * Used by OIDC and older call sites. PQ/hybrid require the KeyStore shape.
 */
export function signJwt(
  payload: Record<string, unknown>,
  privateKeyPem: string,
  kid: string,
  algorithm: JwtAlgorithm = 'RS256',
  options: SignOptions = {},
): string {
  return signToken(payload, legacyClassicalKey(kid, privateKeyPem, '', algorithm), options);
}

/**
 * Legacy entry point: verify with a PEM public key instead of a SigningKey.
 */
export function verifyJwt(
  token: string,
  publicKeyPem: string,
  algorithm: JwtAlgorithm = 'RS256',
  options: jwt.VerifyOptions = {},
): Record<string, unknown> {
  return verifyToken(
    token,
    legacyClassicalKey(readKid(token) ?? '', '', publicKeyPem, algorithm),
    options,
  );
}

function legacyClassicalKey(
  kid: string,
  privateKeyPem: string,
  publicKeyPem: string,
  algorithm: JwtAlgorithm,
): SigningKey {
  return {
    kid,
    algorithm,
    privateKey: privateKeyPem || undefined,
    publicKey: publicKeyPem || undefined,
    createdAt: Date.now(),
    status: 'ACTIVE',
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
  };
}

function readKid(token: string): string {
  const [encodedHeader] = token.split('.');
  if (!encodedHeader) {
    throw new jwt.JsonWebTokenError('jwt malformed');
  }
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(unbase64url(encodedHeader).toString('utf-8'));
  } catch {
    throw new jwt.JsonWebTokenError('invalid token');
  }
  return String(header.kid ?? '');
}

// ---------------------------------------------------------------------------
// Manual JWS builders — EdDSA / ML-DSA / hybrid. jsonwebtoken has no native
// path for these, so the compact JWS is built and verified directly. Claim
// validation mirrors jsonwebtoken semantics (exp/nbf/maxAge/issuer/audience)
// using its public error classes so callers that branch on err.name
// (TokenExpiredError, NotBeforeError) keep working.
// ---------------------------------------------------------------------------

function claimsWithTime(
  payload: Record<string, unknown>,
  options: SignOptions,
): {
  claims: Record<string, unknown>;
  encodedPayload: string;
} {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = { iat: now, ...payload };
  if (!('exp' in claims) && options.expiresIn !== undefined) {
    claims.exp = now + secondsOf(options.expiresIn);
  }
  if (!('nbf' in claims) && options.notBefore !== undefined) {
    claims.nbf = now + secondsOf(options.notBefore);
  }
  return { claims, encodedPayload: base64url(JSON.stringify(claims)) };
}

function signMlDsaJwt(
  payload: Record<string, unknown>,
  key: SigningKey,
  options: SignOptions,
): string {
  const algorithm = key.algorithm as 'ML-DSA-65' | 'ML-DSA-87';
  const header = { alg: algorithm, kid: key.kid, typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const { encodedPayload } = claimsWithTime(payload, options);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = nobleMlDsa(algorithm).sign(
    Buffer.from(signingInput),
    unbase64url(key.pqPrivateKey!),
  );
  return `${signingInput}.${base64url(signature)}`;
}

function verifyMlDsaJwt(
  token: string,
  key: SigningKey,
  options: jwt.VerifyOptions,
): Record<string, unknown> {
  const algorithm = key.algorithm as 'ML-DSA-65' | 'ML-DSA-87';
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new jwt.JsonWebTokenError('jwt malformed');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const { claims } = decodeParts(encodedHeader!, encodedPayload!);
  if (claims.headerAlg !== algorithm) {
    throw new jwt.JsonWebTokenError('invalid algorithm');
  }
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const valid = nobleMlDsa(algorithm).verify(
    unbase64url(encodedSignature!),
    Buffer.from(signingInput),
    unbase64url(key.pqPublicKey!),
  );
  if (!valid) {
    throw new jwt.JsonWebTokenError('invalid signature');
  }
  assertJwtClaims(claims.claims, options);
  return claims.claims;
}

function signHybridJwt(
  payload: Record<string, unknown>,
  key: SigningKey,
  options: SignOptions,
): string {
  const algorithm = key.algorithm as 'hybrid-RS256-MLDSA65' | 'hybrid-ES256-MLDSA65';
  const head = {
    alg: algorithm,
    kid: key.kid,
    pqc_kid: `${key.kid}-pqc`,
    typ: 'JWT',
  };
  const encodedHeader = base64url(JSON.stringify(head));
  const { encodedPayload } = claimsWithTime(payload, options);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  // Classical leg: JWS r||s (ES256) or PKCS#1 v1.5 (RS256) over SHA-256. For
  // ES256 convert the DER signature from node:crypto into raw r||s (JWS form).
  const classicalRaw = nodeSign(
    'sha256',
    Buffer.from(signingInput),
    createPrivateKey(key.privateKey!),
  );
  const classical =
    classicalAlgorithmOf(algorithm) === 'ES256' ? derToJoseSignature(classicalRaw) : classicalRaw;
  const pq = ml_dsa65.sign(Buffer.from(signingInput), unbase64url(key.pqPrivateKey!));
  return `${signingInput}.${base64url(classical)}.${base64url(pq)}`;
}

function verifyHybridJwt(
  token: string,
  key: SigningKey,
  options: jwt.VerifyOptions,
): Record<string, unknown> {
  const algorithm = key.algorithm as 'hybrid-RS256-MLDSA65' | 'hybrid-ES256-MLDSA65';
  const parts = token.split('.');
  if (parts.length !== 4) {
    throw new jwt.JsonWebTokenError('jwt malformed');
  }
  const [encodedHeader, encodedPayload, encodedClassical, encodedPq] = parts;
  const { claims } = decodeParts(encodedHeader!, encodedPayload!);
  if (claims.headerAlg !== algorithm || claims.headerPqcKid !== `${key.kid}-pqc`) {
    throw new jwt.JsonWebTokenError('invalid algorithm');
  }
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const classicalSig = unbase64url(encodedClassical!);
  const classicalVerifyInput =
    classicalAlgorithmOf(algorithm) === 'ES256' ? joseToDerSignature(classicalSig) : classicalSig;
  let classicalValid = false;
  try {
    classicalValid = nodeVerify(
      'sha256',
      Buffer.from(signingInput),
      createPublicKey(key.publicKey!),
      classicalVerifyInput,
    );
  } catch {
    classicalValid = false;
  }
  const pqValid = ml_dsa65.verify(
    unbase64url(encodedPq!),
    Buffer.from(signingInput),
    unbase64url(key.pqPublicKey!),
  );
  if (!classicalValid || !pqValid) {
    throw new jwt.JsonWebTokenError('invalid signature');
  }
  assertJwtClaims(claims.claims, options);
  return claims.claims;
}

function signEdDsaJwt(
  payload: Record<string, unknown>,
  privateKeyPem: string,
  kid: string,
  options: SignOptions,
): string {
  const header = { alg: 'EdDSA' as const, kid, typ: 'JWT' };
  const encodedHeader = base64url(JSON.stringify(header));
  const { encodedPayload } = claimsWithTime(payload, options);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = nodeSign(null, Buffer.from(signingInput), importPrivateKey(privateKeyPem));
  return `${signingInput}.${base64url(signature)}`;
}

function verifyEdDsaJwt(
  token: string,
  publicKeyPem: string,
  options: jwt.VerifyOptions,
): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new jwt.JsonWebTokenError('jwt malformed');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const { claims } = decodeParts(encodedHeader!, encodedPayload!);
  if (claims.headerAlg !== 'EdDSA') {
    throw new jwt.JsonWebTokenError('invalid algorithm');
  }
  const valid = nodeVerify(
    null,
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    importPublicKey(publicKeyPem),
    unbase64url(encodedSignature!),
  );
  if (!valid) {
    throw new jwt.JsonWebTokenError('invalid signature');
  }
  assertJwtClaims(claims.claims, options);
  return claims.claims;
}

function decodeParts(
  encodedHeader: string,
  encodedPayload: string,
): {
  claims: { headerAlg: string; headerPqcKid?: string; claims: Record<string, unknown> };
} {
  let header: { alg?: string; pqc_kid?: string };
  let claims: Record<string, unknown>;
  try {
    header = JSON.parse(unbase64url(encodedHeader).toString('utf-8'));
    claims = JSON.parse(unbase64url(encodedPayload).toString('utf-8'));
  } catch {
    throw new jwt.JsonWebTokenError('invalid token');
  }
  return { claims: { headerAlg: header.alg ?? '', headerPqcKid: header.pqc_kid, claims } };
}

// ---------------------------------------------------------------------------
// DER <-> JOSE (raw r||s) — needed because node:crypto emits DER for ECDSA
// while the JWS ES256 representation is the raw 64-byte r||s concatenation.
// ---------------------------------------------------------------------------

function derToJoseSignature(der: Buffer): Buffer {
  // SEQUENCE { INTEGER r, INTEGER s }
  if (der.length < 8 || der[0] !== 0x30) {
    throw new jwt.JsonWebTokenError('invalid signature');
  }
  const ints: Buffer[] = [];
  let offset = 2;
  if (der[1] === 0x81) {
    offset = 3;
  } else if ((der[1] as number) & 0x80) {
    offset = 2 + (der[1]! & 0x7f);
  }
  while (offset < der.length && ints.length < 2) {
    if (der[offset] !== 0x02) {
      break;
    }
    const len = der[offset + 1]!;
    let int = der.subarray(offset + 2, offset + 2 + len);
    // DER integers may be padded with a leading 0x00 when the high bit is set
    // (sign bit). Strip it; a value longer than 32 bytes after that is invalid
    // for P-256.
    if (int.length === 33 && int[0] === 0) {
      int = int.subarray(1);
    }
    if (int.length > 32) {
      throw new jwt.JsonWebTokenError('invalid signature');
    }
    ints.push(int);
    offset += 2 + len;
  }
  if (ints.length !== 2) {
    throw new jwt.JsonWebTokenError('invalid signature');
  }
  return Buffer.concat([padded32(ints[0]!), padded32(ints[1]!)]);
}

function padded32(value: Buffer): Buffer {
  if (value.length === 32) {
    return value;
  }
  const out = Buffer.alloc(32);
  value.copy(out, 32 - value.length);
  return out;
}

function joseToDerSignature(raw: Buffer): Buffer {
  if (raw.length !== 64) {
    throw new jwt.JsonWebTokenError('invalid signature');
  }
  const r = derInteger(raw.subarray(0, 32));
  const s = derInteger(raw.subarray(32, 64));
  const body = Buffer.concat([r, s]);
  const header = Buffer.alloc(2);
  header[0] = 0x30;
  const bodyLen = body.length;
  if (bodyLen < 0x80) {
    header[1] = bodyLen;
    return Buffer.concat([header, body]);
  }
  const lenEnc = Buffer.from([0x81, bodyLen]);
  return Buffer.concat([Buffer.from([0x30]), lenEnc, body]);
}

function derInteger(value: Buffer): Buffer {
  let start = 0;
  while (
    start < value.length - 1 &&
    value[start] === 0 &&
    ((value[start + 1] as number) & 0x80) === 0
  ) {
    start += 1;
  }
  const trimmed = value.subarray(start);
  const positive =
    trimmed.length > 0 && (trimmed[0]! & 0x80) === 0
      ? trimmed
      : Buffer.concat([Buffer.from([0]), trimmed]);
  const len = positive.length;
  const out = Buffer.alloc(2 + len);
  out[0] = 0x02;
  out[1] = len;
  positive.copy(out, 2);
  return out;
}

function secondsOf(value: number | string): number {
  return typeof value === 'number' ? Math.floor(value) : Number.parseInt(value, 10);
}

/** Mirrors jsonwebtoken's claim checks for exp/nbf/maxAge/iss/aud. */
function assertJwtClaims(claims: Record<string, unknown>, options: jwt.VerifyOptions): void {
  const nowSec = Math.floor(Date.now() / 1000);

  if (typeof claims.exp === 'number' && nowSec >= claims.exp) {
    throw new jwt.TokenExpiredError('jwt expired', new Date(claims.exp * 1000));
  }
  if (typeof claims.nbf === 'number' && nowSec < claims.nbf) {
    throw new jwt.NotBeforeError('jwt not active', new Date(claims.nbf * 1000));
  }
  if (options.maxAge !== undefined && typeof claims.iat === 'number') {
    const maxAge = secondsOf(options.maxAge);
    if (nowSec - claims.iat > maxAge) {
      throw new jwt.TokenExpiredError('maxAge exceeded', new Date((claims.iat + maxAge) * 1000));
    }
  }
  if (options.issuer !== undefined) {
    const expected = Array.isArray(options.issuer) ? options.issuer : [options.issuer];
    if (!expected.includes(claims.iss as string)) {
      throw new jwt.JsonWebTokenError('jwt issuer invalid. expected: ' + expected.join(', '));
    }
  }
  if (options.audience !== undefined) {
    const expected = Array.isArray(options.audience) ? options.audience : [options.audience];
    const actual = Array.isArray(claims.aud) ? (claims.aud as string[]) : [claims.aud as string];
    if (!actual.some((value) => expected.includes(value))) {
      throw new jwt.JsonWebTokenError('jwt audience invalid. expected: ' + expected.join(', '));
    }
  }
}
