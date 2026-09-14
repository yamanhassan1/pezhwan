/**
 * PEZHWAN — ML-DSA (FIPS 204, CRYSTALS-Dilithium) digital signatures.
 *
 * Real implementation backed by @noble/post-quantum:
 *  - Dilithium2 → ML-DSA-44 (NIST Level 2, ~AES-128 security)
 *  - Dilithium3 → ML-DSA-65 (NIST Level 3, ~AES-192 security, recommended)
 *  - Dilithium5 → ML-DSA-87 (NIST Level 5, ~AES-256 security)
 *
 * Provides hedged key generation, signing and fail-closed verification.
 * Verification is pure: returns false on any invalid input, never throws.
 */

import { ml_dsa44, ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DilithiumPublicKey {
  readonly raw: Buffer;
  readonly algorithm: 'Dilithium2' | 'Dilithium3' | 'Dilithium5';
}

export interface DilithiumPrivateKey {
  readonly raw: Buffer;
  readonly algorithm: 'Dilithium2' | 'Dilithium3' | 'Dilithium5';
}

export interface DilithiumSignature {
  readonly raw: Buffer;
  readonly algorithm: 'Dilithium2' | 'Dilithium3' | 'Dilithium5';
}

export interface DilithiumKeyPair {
  publicKey: DilithiumPublicKey;
  privateKey: DilithiumPrivateKey;
}

export interface DilithiumParams {
  publicKeyBytes: number;
  privateKeyBytes: number;
  signatureBytes: number;
  securityLevel: 2 | 3 | 5;
}

// ---------------------------------------------------------------------------
// Parameters (FIPS 204 Table 2 sizes)
// ---------------------------------------------------------------------------

export const DILITHIUM_PARAMS: Record<string, DilithiumParams> = {
  Dilithium2: {
    publicKeyBytes: 1312,
    privateKeyBytes: 2560,
    signatureBytes: 2420,
    securityLevel: 2,
  },
  Dilithium3: {
    publicKeyBytes: 1952,
    privateKeyBytes: 4032,
    signatureBytes: 3309,
    securityLevel: 3,
  },
  Dilithium5: {
    publicKeyBytes: 2592,
    privateKeyBytes: 4896,
    signatureBytes: 4627,
    securityLevel: 5,
  },
};

const NOBLE_ALGS = {
  Dilithium2: ml_dsa44,
  Dilithium3: ml_dsa65,
  Dilithium5: ml_dsa87,
} as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class DilithiumSigner {
  private readonly algorithm: DilithiumPublicKey['algorithm'];

  constructor(algorithm: DilithiumPublicKey['algorithm'] = 'Dilithium3') {
    this.algorithm = algorithm;
  }

  get params(): DilithiumParams {
    return DILITHIUM_PARAMS[this.algorithm]!;
  }

  /**
   * Generate an ML-DSA key pair. Hedged mode produces high-entropy keys
   * via the platform CSPRNG. `seed` is optional and maps directly to
   * noble's deterministic keygen for the given parameter set.
   */
  async generateKeyPair(seed?: Uint8Array): Promise<DilithiumKeyPair> {
    const generated = seed
      ? NOBLE_ALGS[this.algorithm].keygen(seed)
      : NOBLE_ALGS[this.algorithm].keygen();
    return {
      publicKey: {
        raw: Buffer.from(generated.publicKey),
        algorithm: this.algorithm,
      },
      privateKey: {
        raw: Buffer.from(generated.secretKey),
        algorithm: this.algorithm,
      },
    };
  }

  /**
   * Sign a message with hedged mode (platform CSPRNG + extraEntropy).
   * The ML-DSA context is set to the empty default.
   */
  async sign(message: Buffer, privateKey: DilithiumPrivateKey): Promise<DilithiumSignature> {
    if (privateKey.algorithm !== this.algorithm) {
      throw new Error(
        `ML-DSA key algorithm '${privateKey.algorithm}' does not match signer algorithm '${this.algorithm}'`,
      );
    }
    if (privateKey.raw.length !== this.params.privateKeyBytes) {
      throw new Error(
        `Expected secret key length ${this.params.privateKeyBytes}, got ${privateKey.raw.length}`,
      );
    }
    const sig = NOBLE_ALGS[this.algorithm].sign(
      new Uint8Array(message),
      new Uint8Array(privateKey.raw),
      { extraEntropy: randomBytes(32) },
    );
    return { raw: Buffer.from(sig), algorithm: this.algorithm };
  }

  /**
   * Verify a signature. Returns false for structural (wrong length /
   * algorithm mismatch) or cryptographic failures — never throws.
   */
  async verify(
    message: Buffer,
    signature: DilithiumSignature,
    publicKey: DilithiumPublicKey,
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
      return NOBLE_ALGS[this.algorithm].verify(
        new Uint8Array(signature.raw),
        new Uint8Array(message),
        new Uint8Array(publicKey.raw),
      );
    } catch {
      return false;
    }
  }
}
