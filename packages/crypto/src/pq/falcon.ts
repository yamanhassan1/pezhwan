/**
 * PEZHWAN — Falcon digital signatures (FALCON-512 / FALCON-1024).
 *
 * Real implementation backed by @noble/post-quantum (NTRU lattice sampling).
 *  - Falcon-512  (NIST Level 1, ~AES-128 security) — small 666-byte signatures
 *  - Falcon-1024 (NIST Level 5, ~AES-256 security)
 *
 * Use Falcon when signature size or verification cost is critical. For
 * general-purpose PQ signatures prefer ML-DSA (Dilithium).
 */

import { falcon512, falcon1024 } from '@noble/post-quantum/falcon.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FalconPublicKey {
  readonly raw: Buffer;
  readonly algorithm: 'Falcon-512' | 'Falcon-1024';
}

export interface FalconPrivateKey {
  readonly raw: Buffer;
  readonly algorithm: 'Falcon-512' | 'Falcon-1024';
}

export interface FalconSignature {
  readonly raw: Buffer;
  readonly algorithm: 'Falcon-512' | 'Falcon-1024';
}

export interface FalconKeyPair {
  publicKey: FalconPublicKey;
  privateKey: FalconPrivateKey;
}

export interface FalconParams {
  publicKeyBytes: number;
  privateKeyBytes: number;
  signatureBytes: number;
  securityLevel: 1 | 5;
}

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export const FALCON_PARAMS: Record<string, FalconParams> = {
  'Falcon-512': {
    publicKeyBytes: 897,
    privateKeyBytes: 1281,
    signatureBytes: 666,
    securityLevel: 1,
  },
  'Falcon-1024': {
    publicKeyBytes: 1793,
    privateKeyBytes: 2305,
    signatureBytes: 1280,
    securityLevel: 5,
  },
};

const NOBLE_FALCONS = {
  'Falcon-512': falcon512,
  'Falcon-1024': falcon1024,
} as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class FalconSigner {
  private readonly algorithm: FalconPublicKey['algorithm'];

  constructor(algorithm: FalconPublicKey['algorithm'] = 'Falcon-1024') {
    this.algorithm = algorithm;
  }

  get params(): FalconParams {
    return FALCON_PARAMS[this.algorithm]!;
  }

  /**
   * Generate a Falcon key pair via noble. Hedged mode uses the platform
   * CSPRNG; a deterministic seed may be passed for reproducible keys.
   */
  async generateKeyPair(seed?: Uint8Array): Promise<FalconKeyPair> {
    const generated = seed
      ? NOBLE_FALCONS[this.algorithm].keygen(seed)
      : NOBLE_FALCONS[this.algorithm].keygen();
    return {
      publicKey: { raw: Buffer.from(generated.publicKey), algorithm: this.algorithm },
      privateKey: { raw: Buffer.from(generated.secretKey), algorithm: this.algorithm },
    };
  }

  /** Sign a message. Falcon signatures are randomized (compact NTRU form). */
  async sign(message: Buffer, privateKey: FalconPrivateKey): Promise<FalconSignature> {
    if (privateKey.algorithm !== this.algorithm) {
      throw new Error(
        `Falcon key algorithm '${privateKey.algorithm}' does not match signer algorithm '${this.algorithm}'`,
      );
    }
    if (privateKey.raw.length !== this.params.privateKeyBytes) {
      throw new Error(
        `Expected secret key length ${this.params.privateKeyBytes}, got ${privateKey.raw.length}`,
      );
    }
    const sig = NOBLE_FALCONS[this.algorithm].sign(
      new Uint8Array(message),
      new Uint8Array(privateKey.raw),
    );
    return { raw: Buffer.from(sig), algorithm: this.algorithm };
  }

  /** Verify a Falcon signature. Returns false on failure — never throws. */
  async verify(
    message: Buffer,
    signature: FalconSignature,
    publicKey: FalconPublicKey,
  ): Promise<boolean> {
    try {
      if (signature.algorithm !== this.algorithm || publicKey.algorithm !== this.algorithm) {
        return false;
      }
      // Falcon signatures are variable-length (≤ the parameter-set maximum).
      if (
        signature.raw.length > this.params.signatureBytes ||
        signature.raw.length < 20 ||
        publicKey.raw.length !== this.params.publicKeyBytes
      ) {
        return false;
      }
      return NOBLE_FALCONS[this.algorithm].verify(
        new Uint8Array(signature.raw),
        new Uint8Array(message),
        new Uint8Array(publicKey.raw),
      );
    } catch {
      return false;
    }
  }
}
