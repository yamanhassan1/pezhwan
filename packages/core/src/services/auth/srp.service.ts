/**
 * PEZHWAN — SRP service (Secure Remote Password).
 *
 * Implements the SRP-6a registration and authentication protocol primitives
 * using Node's built-in crypto. Verifier generation and session-proof exchange
 * are deterministic and safe for server-side use.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N_HEX =
  'EEAF0AB9ADB38DD69C33F80AFA8FC5E86072618775FF3C0B9EA2314C' +
  '9C256576D674DF7496EA81D3383B4813D692C6E0E0D5D8E250B98BE4' +
  '8E495C1D6089DAD15DC7D7B46154D6B6CE8EF4AD69B15D4982559B29' +
  '7BCF1885C529F566660E57EC68EDBC3C05726CC02FD4CBF4976EAA9A' +
  'FD5138FE8376435B9FC61D2FC0EB06E3';

const N = BigInt('0x' + N_HEX);
const g = 2n;

function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let result = 1n;
  base %= m;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * base) % m;
    base = (base * base) % m;
    e >>= 1n;
  }
  return result;
}

/** Only ASCII k for SRP-6a: k = H(N | g). */
function kFactor(): bigint {
  const hash = createHash('sha256').update(Buffer.from(N_HEX, 'hex')).update(Buffer.from([2])).digest();
  return BigInt('0x' + hash.toString('hex')) % N;
}

export interface SrpRegistrationVerifier {
  salt: string;
  verifier: string;
}

export interface SrpSession {
  serverPrivate: bigint;
  serverPublic: string;
  u: bigint;
  salt: string;
  verifier: bigint;
  /** The server-side proof generated for a valid client proof (null until validate). */
  serverProofKey: string | null;
}

export class SrpService {
  /** Derive a password verifier for storage at registration time. */
  deriveVerifier(identifier: string, password: string): SrpRegistrationVerifier {
    const salt = randomBytes(16);
    const x = BigInt('0x' + scryptSync(password, `${identifier}:${salt.toString('hex')}`, 32).toString('hex')) % N;
    const v = modPow(g, x, N);
    return { salt: salt.toString('hex'), verifier: v.toString(16) };
  }

  /** Begin a server-side authentication session given a stored verifier. */
  begin(saltHex: string, verifierHex: string): SrpSession {
    const salt = BigInt('0x' + saltHex);
    const verifier = BigInt('0x' + verifierHex);
    const k = kFactor();
    const b = randomBytes(32).reduce((acc, byte) => (acc * 256n + BigInt(byte)) % N, 0n);
    const B = (k * verifier + modPow(g, b, N)) % N;
    return {
      serverPrivate: b,
      serverPublic: B.toString(16),
      u: 0n,
      salt: saltHex,
      verifier,
      serverProofKey: null,
    };
  }

  /**
   * Validate a client proof M1 given the client public key A.
   * Returns true when the client proves knowledge of the password, and stores
   * the server proof key for the subsequent M2 exchange.
   */
  validateClientProof(session: SrpSession, clientPublicHex: string, clientProof: string): boolean {
    const A = BigInt('0x' + clientPublicHex);
    if (A % N === 0n) return false;
    const B = BigInt('0x' + session.serverPublic);
    const uHash = createHash('sha256')
      .update(Buffer.from(clientPublicHex, 'hex'))
      .update(Buffer.from(session.serverPublic, 'hex'))
      .digest();
    const u = BigInt('0x' + uHash.toString('hex')) % N;
    if (u === 0n) return false;
    const k = kFactor();
    const S = modPow(A * modPow(session.verifier, u, N) % N, session.serverPrivate, N);
    const sessionKey = this.hashToKey(S, clientPublicHex, session.serverPublic);
    const identityHash = createHash('sha256').update(session.salt).digest('hex');
    const expected = createHash('sha256')
      .update(Buffer.from(identityHash, 'hex'))
      .update(Buffer.from(clientPublicHex, 'hex'))
      .update(Buffer.from(session.serverPublic, 'hex'))
      .update(sessionKey)
      .digest('hex');
    const ok = timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(clientProof, 'hex'));
    if (ok) session.serverProofKey = expected;
    return ok;
  }

  private hashToKey(S: bigint, aHex: string, bHex: string): Buffer {
    const pad = S.toString(16).padStart(N_HEX.length, '0');
    return scryptSync(pad, `${aHex}:${bHex}`, 32);
  }
}