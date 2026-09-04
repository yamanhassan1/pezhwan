/**
 * PEZHWAN — Post-Quantum Cryptography (PQ) module entry point.
 *
 * Provides CRYSTALS-Kyber (ML-KEM) for key encapsulation and
 * CRYSTALS-Dilithium (ML-DSA) for digital signatures, plus a hybrid
 * mode that combines classical RSA/ECDSA with PQ algorithms for
 * defense-in-depth during the post-quantum transition.
 *
 * NOTE: These implementations use a libpq-style abstraction. In production,
 * integrate with a native PQ library (e.g. liboqs, pqcrypto) via N-API
 * bindings. The TypeScript layer provides the interface and orchestration.
 */

export {
  KyberKeyEncapsulation,
  type KyberPublicKey,
  type KyberPrivateKey,
  type KyberCiphertext,
  type KyberSharedSecret,
  type KyberKeyPair,
  KYBER_PARAMS,
} from './kyber.ts';

export {
  DilithiumSigner,
  type DilithiumPublicKey,
  type DilithiumPrivateKey,
  type DilithiumSignature,
  type DilithiumKeyPair,
  DILITHIUM_PARAMS,
} from './dilithium.ts';

export {
  FalconSigner,
  type FalconPublicKey,
  type FalconPrivateKey,
  type FalconSignature,
  type FalconKeyPair,
  FALCON_PARAMS,
} from './falcon.ts';

export {
  HybridCrypto,
  type HybridKeyPair,
  type HybridEncapsulation,
  type HybridSignature,
  type HybridMode,
} from './hybrid.ts';
