/**
 * PEZHWAN — SLH-DSA (FIPS 205, SPHINCS+) stateless hash-based signatures.
 *
 * Real implementation backed by @noble/post-quantum. Hash-based signatures
 * are quantum-safe even against a future quantum computer with unbounded
 * computation: security rests on the hash, not the lattice structure.
 *
 * The "f" (fast) parameter sets are recommended for general use:
 *  - SLH-DSA-SHA2-128f — 128-bit security, fast, ~17 KB signatures
 *  - SLH-DSA-SHA2-192f — 192-bit security
 *  - SLH-DSA-SHA2-256f — 256-bit security, ~50 KB signatures
 */

import {
  slh_dsa_sha2_128f,
  slh_dsa_sha2_192f,
  slh_dsa_sha2_256f,
} from '@noble/post-quantum/slh-dsa.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SphincsPublicKey {
  readonly raw: Buffer;
  readonly algorithm: 'SLH-DSA-SHA2-128f' | 'SLH-DSA-SHA2-192f' | 'SLH-DSA-SHA2-256f';
}

export interface SphincsPrivateKey {
  readonly raw: Buffer;
  readonly algorithm: 'SLH-DSA-SHA2-128f' | 'SLH-DSA-SHA2-192f' | 'SLH-DSA-SHA2-256f';
}

export interface SphincsSignature {
  readonly raw: Buffer;
  readonly algorithm: 'SLH-DSA-SHA2-128f' | 'SLH-DSA-SHA2-192f' | 'SLH-DSA-SHA2-256f';
}

export interface SphincsKeyPair {
  publicKey: SphincsPublicKey;
  privateKey: SphincsPrivateKey;
}

export interface SphincsParams {
  publicKeyBytes: number;
  privateKeyBytes: number;
  signatureBytes: number;
  securityLevel: 128 | 192 | 256;
}

// ---------------------------------------------------------------------------
// Parameters (FIPS 205 Table 4)
// ---------------------------------------------------------------------------

export const SPHINCS_PARAMS: Record<string, SphincsParams> = {
  'SLH-DSA-SHA2-128f': {
    publicKeyBytes: 32,
    privateKeyBytes: 64,
    signatureBytes: 17088,
    securityLevel: 128,
  },
  'SLH-DSA-SHA2-192f': {
    publicKeyBytes: 48,
    privateKeyBytes: 96,
    signatureBytes: 35664,
    securityLevel: 192,
  },
  'SLH-DSA-SHA2-256f': {
    publicKeyBytes: 32,
    privateKeyBytes: 64,
    signatureBytes: 49856,
    securityLevel: 256,
  },
};

const NOBLE_SPHINCS = {
  'SLH-DSA-SHA2-128f': slh_dsa_sha2_128f,
  'SLH-DSA-SHA2-192f': slh_dsa_sha2_192f,
  'SLH-DSA-SHA2-256f': slh_dsa_sha2_256f,
} as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SphincsSigner {
  private readonly algorithm: SphincsPublicKey['algorithm'];

  constructor(algorithm: SphincsPublicKey['algorithm'] = 'SLH-DSA-SHA2-128f') {
    this.algorithm = algorithm;
  }

  get params(): SphincsParams {
    return SPHINCS_PARAMS[this.algorithm]!;
  }

  /**
   * Generate an SLH-DSA key pair. Signing keys are 64–96 bytes; the secret
   * state is expanded internally by the scheme on each sign.
   */
  async generateKeyPair(seed?: Uint8Array): Promise<SphincsKeyPair> {
    const generated = seed
      ? NOBLE_SPHINCS[this.algorithm].keygen(seed)
      : NOBLE_SPHINCS[this.algorithm].keygen();
    return {
      publicKey: { raw: Buffer.from(generated.publicKey), algorithm: this.algorithm },
      privateKey: { raw: Buffer.from(generated.secretKey), algorithm: this.algorithm },
    };
  }

  /** Sign a message using SLH-DSA (fast parameter set). */
  async sign(message: Buffer, privateKey: SphincsPrivateKey): Promise<SphincsSignature> {
    if (privateKey.algorithm !== this.algorithm) {
      throw new Error(
        `SLH-DSA key algorithm '${privateKey.algorithm}' does not match signer algorithm '${this.algorithm}'`,
      );
    }
    if (privateKey.raw.length !== this.params.privateKeyBytes) {
      throw new Error(
        `Expected secret key length ${this.params.privateKeyBytes}, got ${privateKey.raw.length}`,
      );
    }
    const sig = NOBLE_SPHINCS[this.algorithm].sign(
      new Uint8Array(message),
      new Uint8Array(privateKey.raw),
    );
    return { raw: Buffer.from(sig), algorithm: this.algorithm };
  }

  /** Verify an SLH-DSA signature. Returns false on failure — never throws. */
  async verify(
    message: Buffer,
    signature: SphincsSignature,
    publicKey: SphincsPublicKey,
  ): Promise<boolean> {
    try {
      if (signature.algorithm !== this.algorithm || publicKey.algorithm !== this.algorithm) {
        return false;
      }
      if (
        signature.raw.length !== this.params.signatureBytes ||
        publicKey.raw.length !== this.params.publicKeyBytes
      ) {
        return false;
      }
      return NOBLE_SPHINCS[this.algorithm].verify(
        new Uint8Array(signature.raw),
        new Uint8Array(message),
        new Uint8Array(publicKey.raw),
      );
    } catch {
      return false;
    }
  }
}
