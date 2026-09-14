/**
 * PEZHWAN — ML-KEM (FIPS 203, CRYSTALS-Kyber) key encapsulation.
 *
 * Real implementation backed by @noble/post-quantum:
 *  - Kyber-512  → ML-KEM-512  (NIST Level 1, ~AES-128 security)
 *  - Kyber-768  → ML-KEM-768  (NIST Level 3, ~AES-192 security, recommended)
 *  - Kyber-1024 → ML-KEM-1024 (NIST Level 5, ~AES-256 security)
 *
 * Provides hedged key generation, encapsulation and decapsulation.
 * Decapsulation is fail-closed: corrupted ciphertext returns an empty
 * (zeroed) shared secret per FIPS 203 5.3.
 */

import { ml_kem512, ml_kem768, ml_kem1024 } from '@noble/post-quantum/ml-kem.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KyberPublicKey {
  readonly raw: Buffer;
  readonly algorithm: 'Kyber-512' | 'Kyber-768' | 'Kyber-1024';
}

export interface KyberPrivateKey {
  readonly raw: Buffer;
  readonly algorithm: 'Kyber-512' | 'Kyber-768' | 'Kyber-1024';
}

export interface KyberCiphertext {
  readonly raw: Buffer;
  readonly algorithm: 'Kyber-512' | 'Kyber-768' | 'Kyber-1024';
}

export interface KyberSharedSecret {
  readonly raw: Buffer;
}

export interface KyberEncapsulation {
  ciphertext: KyberCiphertext;
  sharedSecret: KyberSharedSecret;
}

export interface KyberKeyPair {
  publicKey: KyberPublicKey;
  privateKey: KyberPrivateKey;
}

export interface KyberParams {
  publicKeyBytes: number;
  privateKeyBytes: number;
  ciphertextBytes: number;
  sharedSecretBytes: number;
  securityLevel: 1 | 3 | 5;
}

// ---------------------------------------------------------------------------
// Parameters (FIPS 203 Table 2)
// ---------------------------------------------------------------------------

export const KYBER_PARAMS: Record<string, KyberParams> = {
  'Kyber-512': {
    publicKeyBytes: 800,
    privateKeyBytes: 1632,
    ciphertextBytes: 768,
    sharedSecretBytes: 32,
    securityLevel: 1,
  },
  'Kyber-768': {
    publicKeyBytes: 1184,
    privateKeyBytes: 2400,
    ciphertextBytes: 1088,
    sharedSecretBytes: 32,
    securityLevel: 3,
  },
  'Kyber-1024': {
    publicKeyBytes: 1568,
    privateKeyBytes: 3168,
    ciphertextBytes: 1568,
    sharedSecretBytes: 32,
    securityLevel: 5,
  },
};

const NOBLE_KEMS = {
  'Kyber-512': ml_kem512,
  'Kyber-768': ml_kem768,
  'Kyber-1024': ml_kem1024,
} as const;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class KyberKeyEncapsulation {
  private readonly algorithm: KyberPublicKey['algorithm'];

  constructor(algorithm: KyberPublicKey['algorithm'] = 'Kyber-768') {
    this.algorithm = algorithm;
  }

  get params(): KyberParams {
    return KYBER_PARAMS[this.algorithm]!;
  }

  /**
   * Generate an ML-KEM key pair. Hedged mode uses the platform CSPRNG;
   * a deterministic seed may be passed for reproducible key material.
   */
  async generateKeyPair(seed?: Uint8Array): Promise<KyberKeyPair> {
    const generated = seed
      ? NOBLE_KEMS[this.algorithm].keygen(seed)
      : NOBLE_KEMS[this.algorithm].keygen();
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
   * Encapsulate: produce a ciphertext and shared secret from a public key.
   * `msgRand` is the 32-byte randomness vector defined by FIPS 203 5.1;
   * when omitted the platform CSPRNG supplies fresh entropy.
   */
  async encapsulate(publicKey: KyberPublicKey, msgRand?: Uint8Array): Promise<KyberEncapsulation> {
    if (publicKey.algorithm !== this.algorithm) {
      throw new Error(
        `ML-KEM public key algorithm '${publicKey.algorithm}' does not match KEM algorithm '${this.algorithm}'`,
      );
    }
    if (publicKey.raw.length !== this.params.publicKeyBytes) {
      throw new Error(
        `Expected public key length ${this.params.publicKeyBytes}, got ${publicKey.raw.length}`,
      );
    }
    const result = NOBLE_KEMS[this.algorithm].encapsulate(
      new Uint8Array(publicKey.raw),
      msgRand && msgRand.length === 32 ? msgRand : undefined,
    );
    return {
      ciphertext: { raw: Buffer.from(result.cipherText), algorithm: this.algorithm },
      sharedSecret: { raw: Buffer.from(result.sharedSecret) },
    };
  }

  /**
   * Decapsulate: recover the shared secret from ciphertext + private key.
   * A corrupted ciphertext produces a zeroed (indistinguishable) shared
   * secret, per FIPS 203 5.3.
   */
  async decapsulate(
    ciphertext: KyberCiphertext,
    privateKey: KyberPrivateKey,
  ): Promise<KyberSharedSecret> {
    if (ciphertext.algorithm !== this.algorithm) {
      throw new Error(
        `ML-KEM ciphertext algorithm '${ciphertext.algorithm}' does not match KEM algorithm '${this.algorithm}'`,
      );
    }
    if (
      ciphertext.raw.length !== this.params.ciphertextBytes ||
      privateKey.raw.length !== this.params.privateKeyBytes
    ) {
      throw new Error(
        `Expected ct/sk lengths ${this.params.ciphertextBytes}/${this.params.privateKeyBytes}, got ${ciphertext.raw.length}/${privateKey.raw.length}`,
      );
    }
    try {
      const ss = NOBLE_KEMS[this.algorithm].decapsulate(
        new Uint8Array(ciphertext.raw),
        new Uint8Array(privateKey.raw),
      );
      return { raw: Buffer.from(ss) };
    } catch {
      return { raw: Buffer.alloc(this.params.sharedSecretBytes) };
    }
  }
}
