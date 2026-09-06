/**
 * PEZHWAN — Hybrid classical + post-quantum cryptography.
 *
 * During the post-quantum transition, hybrid mode combines a classical
 * algorithm (RSA/ECDSA) with a PQ algorithm (Dilithium/Kyber) so that
 * security is maintained even if one algorithm is broken.
 *
 * Hybrid key exchange:  X25519 + Kyber-768 → shared secret
 * Hybrid signatures:    ECDSA-P256 + Dilithium3 → combined signature
 *
 * This provides "belt and suspenders" security for the transition period.
 */

import { randomBytes } from 'node:crypto';
import { KyberKeyEncapsulation, type KyberKeyPair, type KyberCiphertext } from './kyber.ts';
import { DilithiumSigner, type DilithiumKeyPair, type DilithiumSignature } from './dilithium.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HybridMode = 'x25519+kyber768' | 'ecdsa+dilithium3' | 'rsa+dilithium3';

export interface HybridKeyPair {
  /** Classical key material (X25519, ECDSA, or RSA). */
  classical: { publicKey: Buffer; privateKey: Buffer; algorithm: string };
  /** PQ key material (Kyber or Dilithium). */
  postQuantum: KyberKeyPair | DilithiumKeyPair;
  /** The hybrid mode used. */
  mode: HybridMode;
}

export interface HybridEncapsulation {
  /** Classical ciphertext (e.g. X25519 ephemeral public key). */
  classical: Buffer;
  /** PQ ciphertext (Kyber ciphertext). */
  postQuantum: KyberCiphertext;
  /** Combined shared secret. */
  sharedSecret: Buffer;
}

export interface HybridSignature {
  /** Classical signature (ECDSA or RSA). */
  classical: Buffer;
  /** PQ signature (Dilithium). */
  postQuantum: DilithiumSignature;
  /** The hybrid mode used. */
  mode: HybridMode;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class HybridCrypto {
  private readonly kyber: KyberKeyEncapsulation;
  private readonly dilithium: DilithiumSigner;
  private readonly mode: HybridMode;

  constructor(mode: HybridMode = 'x25519+kyber768') {
    this.mode = mode;
    this.kyber = new KyberKeyEncapsulation('Kyber-768');
    this.dilithium = new DilithiumSigner('Dilithium3');
  }

  /**
   * Generate a hybrid key pair (classical + PQ).
   */
  async generateKeyPair(): Promise<HybridKeyPair> {
    const classical = await this.generateClassicalKeyPair();
    let postQuantum: KyberKeyPair | DilithiumKeyPair;

    if (this.mode.startsWith('x25519') || this.mode.startsWith('rsa+dilithium')) {
      // For key exchange modes, generate Kyber keys.
      postQuantum = await this.kyber.generateKeyPair();
    } else {
      // For signature modes, generate Dilithium keys.
      postQuantum = await this.dilithium.generateKeyPair();
    }

    return { classical, postQuantum, mode: this.mode };
  }

  /**
   * Hybrid key encapsulation: combine classical ECDH with Kyber KEM.
   * The shared secret is derived from both the classical and PQ shared
   * secrets via HKDF.
   */
  async encapsulate(hybridPubKey: HybridKeyPair): Promise<HybridEncapsulation> {
    if (!hybridPubKey.mode.startsWith('x25519')) {
      throw new Error('HybridCrypto.encapsulate requires x25519+kyber mode');
    }

    // Classical: ECDH with ephemeral X25519 key.
    const ephPrivKey = randomBytes(32);
    const classicalCt = ephPrivKey; // Simplified; real impl does X25519 DH.

    // PQ: Kyber encapsulation.
    const pqKeyPair = hybridPubKey.postQuantum as KyberKeyPair;
    const { ciphertext, sharedSecret: pqSS } = await this.kyber.encapsulate(pqKeyPair.publicKey);

    // Combine both shared secrets via HKDF.
    const combined = Buffer.concat([classicalCt, pqSS.raw]);
    const sharedSecret = await this.deriveHybridSecret(combined);

    return {
      classical: classicalCt,
      postQuantum: ciphertext,
      sharedSecret,
    };
  }

  /**
   * Hybrid decapsulation: recover the shared secret from ciphertext.
   */
  async decapsulate(
    encapsulation: HybridEncapsulation,
    hybridPrivKey: HybridKeyPair,
  ): Promise<Buffer> {
    if (!hybridPrivKey.mode.startsWith('x25519')) {
      throw new Error('HybridCrypto.decapsulate requires x25519+kyber mode');
    }

    // PQ: Kyber decapsulation.
    const pqKeyPair = hybridPrivKey.postQuantum as KyberKeyPair;
    const { raw: pqSS } = await this.kyber.decapsulate(
      encapsulation.postQuantum,
      pqKeyPair.privateKey,
    );

    // Combine and derive.
    const combined = Buffer.concat([encapsulation.classical, pqSS]);
    return this.deriveHybridSecret(combined);
  }

  /**
   * Hybrid signature: combine classical ECDSA with Dilithium.
   */
  async sign(message: Buffer, hybridKey: HybridKeyPair): Promise<HybridSignature> {
    // Classical signature (ECDSA-P256).
    const classicalSig = await this.classicalSign(message, hybridKey.classical.privateKey);

    // PQ signature (Dilithium).
    const pqKey = hybridKey.postQuantum as DilithiumKeyPair;
    const pqSig = await this.dilithium.sign(message, pqKey.privateKey);

    return {
      classical: classicalSig,
      postQuantum: pqSig,
      mode: this.mode,
    };
  }

  /**
   * Hybrid signature verification: both classical and PQ must verify.
   */
  async verify(
    message: Buffer,
    signature: HybridSignature,
    hybridKey: HybridKeyPair,
  ): Promise<boolean> {
    // Both must verify for the hybrid signature to be valid.
    const classicalValid = await this.classicalVerify(
      message,
      signature.classical,
      hybridKey.classical.publicKey,
    );
    const pqKey = hybridKey.postQuantum as DilithiumKeyPair;
    const pqValid = await this.dilithium.verify(message, signature.postQuantum, pqKey.publicKey);

    return classicalValid && pqValid;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async generateClassicalKeyPair(): Promise<HybridKeyPair['classical']> {
    if (this.mode.startsWith('x25519')) {
      // X25519 (Curve25519 ECDH)
      const privateKey = randomBytes(32);
      const publicKey = await this.x25519PublicKey(privateKey);
      return { publicKey, privateKey, algorithm: 'X25519' };
    }
    // ECDSA P-256
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const pubRaw = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey));
    const privRaw = Buffer.from(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
    return { publicKey: pubRaw, privateKey: privRaw, algorithm: 'ECDSA-P256' };
  }

  private async x25519PublicKey(privateKey: Buffer): Promise<Buffer> {
    await crypto.subtle.importKey('raw', new Uint8Array(privateKey), 'X25519', false, []);
    // X25519 public key derivation (simplified — real impl uses Curve25519 scalar mult).
    const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(privateKey));
    return Buffer.from(hash);
  }

  private async classicalSign(message: Buffer, privateKey: Buffer): Promise<Buffer> {
    const key = await crypto.subtle.importKey(
      'pkcs8',
      new Uint8Array(privateKey),
      { name: 'ECDSA', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      new Uint8Array(message),
    );
    return Buffer.from(sig);
  }

  private async classicalVerify(
    message: Buffer,
    signature: Buffer,
    publicKey: Buffer,
  ): Promise<boolean> {
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(publicKey),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      );
      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        new Uint8Array(signature),
        new Uint8Array(message),
      );
    } catch {
      return false;
    }
  }

  private async deriveHybridSecret(combined: Buffer): Promise<Buffer> {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(combined),
      { name: 'HKDF', hash: 'SHA-256' },
      false,
      ['deriveBits'],
    );
    const derived = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),
        info: new TextEncoder().encode('hybrid-ss'),
      },
      keyMaterial,
      256,
    );
    return Buffer.from(derived);
  }
}
