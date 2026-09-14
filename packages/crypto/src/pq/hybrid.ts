/**
 * PEZHWAN — Hybrid classical + post-quantum cryptography.
 *
 * During the post-quantum transition a hybrid scheme keeps security even if
 * one of the two algorithms is later broken:
 *
 *  Hybrid key exchange:   X25519 (WebCrypto ECDH) + ML-KEM-768/1024 → HKDF
 *  Hybrid signatures:     RSA-2048 / ECDSA P-256 + ML-DSA-65 (Dilithium3)
 *
 * Both legs must verify / be combined for the result to be trusted — a
 * defensive, "belt and suspenders" posture for the transition period.
 *
 * Key material is Buffer-only (raw or PEM) so pairs can be persisted and
 * restored by the KeyStore just like classical keys.
 */

import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
  verify as nodeVerify,
} from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { KyberKeyEncapsulation } from './kyber.ts';
import { DilithiumSigner } from './dilithium.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HybridMode =
  'x25519+kyber768' | 'x25519+kyber1024' | 'rsa+dilithium3' | 'ecdsa+dilithium3';

export interface HybridKeyPair {
  mode: HybridMode;
  /** Classical public key: SPKI PEM (signature modes) or raw X25519 pk (KEM). */
  classicalPublicKey: Buffer;
  /** Classical private key: PKCS8 PEM (signature modes) or PKCS8 X25519 sk (KEM). */
  classicalPrivateKey: Buffer;
  /** PQ public key (raw ML-KEM / ML-DSA bytes). */
  pqPublicKey: Buffer;
  /** PQ private key (raw ML-KEM / ML-DSA bytes). */
  pqPrivateKey: Buffer;
}

export interface HybridEncapsulation {
  /** Ephemeral X25519 public key (the KEM leg of the ciphertext). */
  classical: Buffer;
  /** ML-KEM ciphertext (the PQ leg of the ciphertext). */
  postQuantum: Buffer;
  /** HKDF-combined 32-byte shared secret. */
  sharedSecret: Buffer;
}

export interface HybridSignature {
  /** Classical signature bytes (RSA PKCS1v1.5 / ECDSA P-256 over SHA-256). */
  classical: Buffer;
  /** PQ signature bytes (ML-DSA-65). */
  postQuantum: Buffer;
  mode: HybridMode;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class HybridCrypto {
  private readonly mode: HybridMode;

  constructor(mode: HybridMode = 'x25519+kyber768') {
    if (
      mode !== 'x25519+kyber768' &&
      mode !== 'x25519+kyber1024' &&
      mode !== 'rsa+dilithium3' &&
      mode !== 'ecdsa+dilithium3'
    ) {
      throw new Error(`Unsupported hybrid mode: ${String(mode)}`);
    }
    this.mode = mode;
  }

  get isKem(): boolean {
    return this.mode.startsWith('x25519');
  }

  /** Generate a hybrid key pair (classical + PQ legs present in one object). */
  async generateKeyPair(): Promise<HybridKeyPair> {
    if (this.mode.startsWith('x25519')) {
      const { publicKey: classicalPublicKey, privateKey: classicalPrivateKey } =
        await this.generateX25519KeyPair();
      const kem = new KyberKeyEncapsulation(
        this.mode === 'x25519+kyber1024' ? 'Kyber-1024' : 'Kyber-768',
      );
      const { publicKey, privateKey } = await kem.generateKeyPair();
      return {
        mode: this.mode,
        classicalPublicKey,
        classicalPrivateKey,
        pqPublicKey: publicKey.raw,
        pqPrivateKey: privateKey.raw,
      };
    }
    const classical =
      this.mode === 'ecdsa+dilithium3'
        ? generateKeyPairSync('ec', {
            namedCurve: 'P-256',
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
          })
        : generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
          });
    const signer = new DilithiumSigner('Dilithium3');
    const { publicKey: pqPub, privateKey: pqPriv } = await signer.generateKeyPair();
    return {
      mode: this.mode,
      classicalPublicKey: Buffer.from(classical.publicKey, 'utf-8'),
      classicalPrivateKey: Buffer.from(classical.privateKey, 'utf-8'),
      pqPublicKey: pqPub.raw,
      pqPrivateKey: pqPriv.raw,
    };
  }

  /**
   * Hybrid key encapsulation: X25519 ECDH (ephemeral) + ML-KEM captured to a
   * single shared secret via HKDF-SHA256 over both secrets.
   */
  async encapsulate(hybridPubKey: HybridKeyPair): Promise<HybridEncapsulation> {
    if (!this.isKem) {
      throw new Error('HybridCrypto.encapsulate requires an x25519+kyber mode');
    }
    const kemAlg = this.mode === 'x25519+kyber1024' ? 'Kyber-1024' : 'Kyber-768';
    const kem = new KyberKeyEncapsulation(kemAlg);
    const pqPk = { algorithm: kemAlg as 'Kyber-768' | 'Kyber-1024', raw: hybridPubKey.pqPublicKey };

    const { publicKey: ephPublic, privateKey: ephPrivate } = await this.generateX25519KeyPair();
    const ecdhSecret = await this.x25519SharedSecret(ephPrivate, hybridPubKey.classicalPublicKey);
    const { ciphertext, sharedSecret: kemSecret } = await kem.encapsulate(pqPk, randomBytes(32));
    const sharedSecret = await this.deriveHybridSecret(ecdhSecret, kemSecret.raw);

    return {
      classical: ephPublic,
      postQuantum: ciphertext.raw,
      sharedSecret,
    };
  }

  /** Hybrid decapsulation: recover the shared secret from both ciphertext legs. */
  async decapsulate(
    encapsulation: HybridEncapsulation,
    hybridPrivKey: HybridKeyPair,
  ): Promise<Buffer> {
    if (!this.isKem) {
      throw new Error('HybridCrypto.decapsulate requires an x25519+kyber mode');
    }
    const kemAlg = this.mode === 'x25519+kyber1024' ? 'Kyber-1024' : 'Kyber-768';
    const kem = new KyberKeyEncapsulation(kemAlg);
    const ecdhSecret = await this.x25519SharedSecret(
      hybridPrivKey.classicalPrivateKey,
      encapsulation.classical,
    );
    const kemSecret = await kem.decapsulate(
      { algorithm: kemAlg as 'Kyber-768' | 'Kyber-1024', raw: encapsulation.postQuantum },
      { algorithm: kemAlg as 'Kyber-768' | 'Kyber-1024', raw: hybridPrivKey.pqPrivateKey },
    );
    return this.deriveHybridSecret(ecdhSecret, kemSecret.raw);
  }

  /** Hybrid signature: classical (RSA/ECDSA PKCS#1/X9.62) + ML-DSA concatenated. */
  async sign(message: Buffer, hybridKey: HybridKeyPair): Promise<HybridSignature> {
    if (this.isKem) {
      throw new Error('HybridCrypto.sign requires a signature mode (rsa/ecdsa+dilithium3)');
    }
    const classicalSig = nodeSign(
      'sha256',
      message,
      createPrivateKey(hybridKey.classicalPrivateKey.toString('utf-8')),
    );
    const signer = new DilithiumSigner('Dilithium3');
    const pqSig = await signer.sign(message, {
      algorithm: 'Dilithium3',
      raw: hybridKey.pqPrivateKey,
    });
    return { classical: classicalSig, postQuantum: pqSig.raw, mode: this.mode };
  }

  /** Hybrid verification: BOTH the classical and PQ legs must verify. */
  async verify(
    message: Buffer,
    signature: HybridSignature,
    hybridKey: HybridKeyPair,
  ): Promise<boolean> {
    if (this.isKem) {
      return false;
    }
    let classicalValid: boolean;
    try {
      classicalValid = nodeVerify(
        'sha256',
        message,
        createPublicKey(hybridKey.classicalPublicKey.toString('utf-8')),
        signature.classical,
      );
    } catch {
      classicalValid = false;
    }
    const signer = new DilithiumSigner('Dilithium3');
    const pqValid = await signer.verify(
      message,
      { algorithm: 'Dilithium3', raw: signature.postQuantum },
      { algorithm: 'Dilithium3', raw: hybridKey.pqPublicKey },
    );
    return classicalValid && pqValid;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async generateX25519KeyPair(): Promise<{ publicKey: Buffer; privateKey: Buffer }> {
    const pair = (await crypto.subtle.generateKey({ name: 'X25519' }, true, [
      'deriveBits',
    ])) as unknown as { publicKey: CryptoKey; privateKey: CryptoKey };
    const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey));
    // WebCrypto (per spec) cannot export X25519 private keys as raw — PKCS8.
    const privateKey = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    return { publicKey, privateKey };
  }

  private async x25519SharedSecret(privateKeyRaw: Buffer, publicKeyRaw: Buffer): Promise<Buffer> {
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      new Uint8Array(privateKeyRaw),
      'X25519',
      false,
      ['deriveBits'],
    );
    const publicKey = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(publicKeyRaw),
      'X25519',
      false,
      [],
    );
    const secret = await crypto.subtle.deriveBits(
      { name: 'X25519', public: publicKey },
      privateKey,
      256,
    );
    return Buffer.from(secret);
  }

  private async deriveHybridSecret(ecdSecret: Buffer, kemSecret: Buffer): Promise<Buffer> {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(Buffer.concat([ecdSecret, kemSecret])),
      { name: 'HKDF', hash: 'SHA-256' },
      false,
      ['deriveBits'],
    );
    const derived = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32),
        info: new TextEncoder().encode('pezhwan-hybrid-x25519-mlkem-v1'),
      },
      keyMaterial,
      256,
    );
    return Buffer.from(derived);
  }
}
