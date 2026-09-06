/**
 * SRP-6a (Secure Remote Password) implementation.
 *
 * Provides zero-knowledge password proof for password-authenticated key exchange.
 * Uses the 2048-bit MODP group from RFC 5054.
 *
 * @module
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SRPParams {
  /** Safe prime modulus (2048-bit) */
  N: bigint;
  /** Generator */
  g: bigint;
  /** Hash output size in bytes */
  hashSize: number;
  /** Hash algorithm name */
  hash: 'sha256' | 'sha512';
}

export interface SRPServerChallenge {
  /** Public ephemeral value B (hex) */
  B: string;
  /** Salt (hex) */
  salt: string;
  /** Session identifier */
  sessionId: string;
}

export interface SRPServerProof {
  /** Server proof M2 (hex) */
  M2: string;
  /** Derived session key (hex) */
  sessionKey: string;
}

export interface SRPClientChallenge {
  /** Public ephemeral value A (hex) */
  A: string;
}

export interface SRPClientProof {
  /** Client proof M1 (hex) */
  M1: string;
}

// ---------------------------------------------------------------------------
// RFC 5054 2048-bit MODP Group (stored as hex, parsed at init time)
// ---------------------------------------------------------------------------

const N_HEX =
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1' +
  '29024E088A67CC74020BBEA63B139B22514A08798E3404DD' +
  'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245' +
  'E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
  'EE386BFB5A899FA5ADF98E4E27349F329F7BBDF55F07CFE7' +
  'D651E27B931BAE88F35CF3B8A9ABBF617A16D2EE15508AF8' +
  'C5F244DC5345EE09F1B9E5D49C5319D7226B07637C5E1814' +
  'C0E7C83F00C0FFD8219CE45590668985D19B3507CD14A587' +
  '33E1CA224D96036720A16637E454F4A32C77B88D4D9A0152' +
  'C54191E10745692089E66B707E46A879DC7E4BB38A7ABBBB' +
  '487B0D6E6B83E895932BCBCD26B1CF5C1F1E14AD06F13E69' +
  'A0D70157F71A7C3F5D16D607144F998E13B9728D6F2D4EB7' +
  'A328916C2C8A38F07C8D661E2FA08F024B45D777E19E8E55' +
  'BC3F7C2A3C2F3594B7D7C3D0E32088E5AD16E558094807B6' +
  '92E0A0977C63A8E5E7D727061A3368BE8B2D89E63C48D2B5' +
  '1D6F3A125F6A7A7D7F7E45820DB50EBB5A20187D1E2A1AF0' +
  'C37D7AFEA01B1AF0F535B2658C127F60A828F250A1B9D693' +
  'AF67A8D507E0E1D3A839A2897807E23C2F4C57C4B7E44A98' +
  'C5C421D1C1A1B4E5A8C0E566F8A0E4B87D2B52C8C6FB5000';

const G = 2n;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ZERO = 0n;
const ONE = 1n;

const params: SRPParams = {
  N: BigInt('0x' + N_HEX.replace(/\s/g, '')),
  g: G,
  hashSize: 32,
  hash: 'sha256',
};

/** Convert bytes to bigint */
function bytesToBigInt(buf: Buffer): bigint {
  return BigInt('0x' + buf.toString('hex'));
}

/** Convert bigint to fixed-size hex string (256 bytes for 2048-bit modulus) */
function bigIntToHex(n: bigint, byteLen = 256): string {
  const hex = n.toString(16);
  return hex.padStart(byteLen * 2, '0');
}

/** Convert hex string to Buffer */
function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

/** Hash with SHA-256 */
function sha256(data: Buffer): Buffer {
  return createHash('sha256').update(data).digest();
}

/**
 * Calculate H(N || g || H(salt || H(username || ":" || password)))
 *
 * The salted hash used in SRP password verifier derivation.
 */
function calculatePasswordHash(
  username: string,
  password: string,
  salt: Buffer,
  N: bigint,
  g: bigint,
): Buffer {
  const innerHash = sha256(Buffer.from(username + ':' + password, 'utf-8'));
  return sha256(
    Buffer.concat([hexToBuffer(bigIntToHex(N)), hexToBuffer(bigIntToHex(g, 1)), salt, innerHash]),
  );
}

/** Generate random bigint in [1, N-1] */
function randomBigInt(N: bigint): bigint {
  const byteLen = Math.ceil(N.toString(16).length / 2);
  let n: bigint;
  do {
    n = bytesToBigInt(randomBytes(byteLen));
  } while (n === ZERO || n >= N);
  return n;
}

/** Modular exponentiation: base^exp mod mod */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = ONE;
  base = ((base % mod) + mod) % mod;
  while (exp > ZERO) {
    if (exp & ONE) {
      result = (result * base) % mod;
    }
    exp >>= ONE;
    base = (base * base) % mod;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate SRP password verifier and salt.
 *
 * Call this during registration to store `verifier` and `salt` in the database.
 */
export function generateVerifier(
  username: string,
  password: string,
  saltBytes = 16,
): { verifier: string; salt: string } {
  const salt = randomBytes(saltBytes);
  const x = bytesToBigInt(calculatePasswordHash(username, password, salt, params.N, params.g));
  const v = modPow(params.g, x, params.N);
  return {
    verifier: bigIntToHex(v),
    salt: salt.toString('hex'),
  };
}

/**
 * Generate server challenge (B, salt) for the client.
 *
 * Server stores `secret` and `sessionId` for later verification.
 */
export function generateServerChallenge(
  salt: string,
  sessionId?: string,
): {
  challenge: SRPServerChallenge;
  secret: { b: bigint; B: bigint };
} {
  const b = randomBigInt(params.N);
  const B = (params.g * modPow(params.g, b, params.N)) % params.N;

  return {
    challenge: {
      B: bigIntToHex(B),
      salt,
      sessionId: sessionId ?? randomBytes(8).toString('hex'),
    },
    secret: { b, B },
  };
}

/**
 * Process client challenge and generate server proof.
 *
 * Server-side: receives A from client, computes shared key and proofs.
 */
export function processClientChallenge(
  clientA: string,
  verifier: string,
  serverSecret: { b: bigint; B: bigint },
  username: string,
  salt: string,
  _sessionId: string,
): SRPServerProof {
  const { b, B } = serverSecret;
  const N = params.N;
  const g = params.g;
  const v = BigInt('0x' + verifier);
  const A = BigInt('0x' + clientA);

  // Safety check: A must not be 0 mod N
  if (A % N === ZERO) {
    throw new Error('SRP: Client public value A is zero');
  }

  // u = H(A || B)
  const u = bytesToBigInt(
    sha256(Buffer.concat([hexToBuffer(bigIntToHex(A)), hexToBuffer(bigIntToHex(B))])),
  );

  if (u === ZERO) {
    throw new Error('SRP: Computed scrambling parameter u is zero');
  }

  // S = (A * v^u)^b mod N
  const S = modPow((A * modPow(v, u, N)) % N, b, N);

  // K = H(S)
  const K = sha256(hexToBuffer(bigIntToHex(S)));

  // M1 = H(H(N) xor H(g) || H(salt) || A || B || K)
  const Nhash = sha256(hexToBuffer(bigIntToHex(N)));
  const ghash = sha256(hexToBuffer(bigIntToHex(g, 1)));
  const saltHash = sha256(hexToBuffer(salt));

  const NhXorGh = Buffer.alloc(Nhash.length);
  for (let i = 0; i < Nhash.length; i++) {
    NhXorGh[i] = Nhash[i]! ^ ghash[i]!;
  }

  const M1 = sha256(
    Buffer.concat([NhXorGh, saltHash, hexToBuffer(bigIntToHex(A)), hexToBuffer(bigIntToHex(B)), K]),
  );

  // M2 = H(A || M1 || K)
  const M2 = sha256(Buffer.concat([hexToBuffer(bigIntToHex(A)), M1, K]));

  return {
    M2: M2.toString('hex'),
    sessionKey: K.toString('hex'),
  };
}

/**
 * Verify server proof M2 on the client side.
 *
 * Returns the session key if the server proof is valid.
 */
export function verifyServerProof(
  clientA: string,
  clientM1: string,
  serverM2: string,
  sessionKey: string,
): boolean {
  const A = hexToBuffer(clientA);
  const M1 = hexToBuffer(clientM1);
  const M2 = hexToBuffer(serverM2);
  const K = hexToBuffer(sessionKey);

  const expectedM2 = sha256(Buffer.concat([A, M1, K]));

  if (M2.length !== expectedM2.length) {
    return false;
  }

  return timingSafeEqual(M2, expectedM2);
}

/**
 * Compute client challenge proof M1.
 *
 * Client-side helper to generate M1 for the server.
 */
export function computeClientProof(
  username: string,
  salt: string,
  clientA: string,
  serverB: string,
  sessionKey: string,
): string {
  const N = params.N;
  const g = params.g;
  const A = hexToBuffer(clientA);
  const B = hexToBuffer(serverB);
  const K = hexToBuffer(sessionKey);
  const saltBuf = hexToBuffer(salt);

  const Nhash = sha256(hexToBuffer(bigIntToHex(N)));
  const ghash = sha256(hexToBuffer(bigIntToHex(g, 1)));
  const saltHash = sha256(saltBuf);

  const NhXorGh = Buffer.alloc(Nhash.length);
  for (let i = 0; i < Nhash.length; i++) {
    NhXorGh[i] = Nhash[i]! ^ ghash[i]!;
  }

  const M1 = sha256(Buffer.concat([NhXorGh, saltHash, A, B, K]));

  return M1.toString('hex');
}

/**
 * SRP client session state.
 */
export interface SRPClientSession {
  a: bigint;
  A: bigint;
  sessionKey: string;
}

/**
 * Initiate SRP client challenge.
 *
 * Returns A (public value) and internal state for later proof computation.
 */
export function initiateClient(): {
  challenge: SRPClientChallenge;
  session: SRPClientSession;
} {
  const a = randomBigInt(params.N);
  const A = modPow(params.g, a, params.N);

  return {
    challenge: { A: bigIntToHex(A) },
    session: { a, A, sessionKey: '' },
  };
}

/**
 * Derive client session key after server challenge received.
 *
 * Takes B from server and password info, computes shared secret and M1.
 */
export function deriveClientSession(
  session: SRPClientSession,
  username: string,
  password: string,
  salt: string,
  serverB: string,
): { M1: string; sessionKey: string } {
  const N = params.N;
  const g = params.g;
  const { a, A } = session;
  const B = BigInt('0x' + serverB);
  const saltBuf = hexToBuffer(salt);

  if (B % N === ZERO) {
    throw new Error('SRP: Server public value B is zero');
  }

  const u = bytesToBigInt(
    sha256(Buffer.concat([hexToBuffer(bigIntToHex(A)), hexToBuffer(bigIntToHex(B))])),
  );

  const x = bytesToBigInt(calculatePasswordHash(username, password, saltBuf, N, g));

  const S = modPow(B - ((modPow(g, x, N) * u) % N), a + u * x, N);
  const K = sha256(hexToBuffer(bigIntToHex(S)));

  session.sessionKey = K.toString('hex');

  const M1 = computeClientProof(username, salt, bigIntToHex(A), serverB, K.toString('hex'));

  return {
    M1,
    sessionKey: K.toString('hex'),
  };
}

/**
 * Validate M1 proof from client on server side.
 *
 * Returns true if the client proof is valid.
 */
export function validateClientProof(clientM1: string, expectedM1: string): boolean {
  const a = hexToBuffer(clientM1);
  const b = hexToBuffer(expectedM1);

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

/**
 * Get the SRP parameters (for testing or custom implementations).
 */
export function getParams(): SRPParams {
  return { ...params };
}
