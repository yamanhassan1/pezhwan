/**
 * PEZHWAN — Post-Quantum Cryptography (PQ) module entry point.
 *
 * FIPS-standardised algorithms backed by the audited pure-JS
 * @noble/post-quantum implementation:
 *  - ML-KEM-(512/768/1024)  key encapsulation (FIPS 203, CRYSTALS-Kyber)
 *  - ML-DSA-(44/65/87)      digital signatures (FIPS 204, CRYSTALS-Dilithium)
 *  - FALCON-(512/1024)      lattice signatures (fast, compact signatures)
 *  - SLH-DSA                stateless hash-based signatures (FIPS 205, SPHINCS+)
 *  - Hybrid                 classical (RSA/ECDSA/X25519) + ML-DSA/ML-KEM combos
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
  SphincsSigner,
  type SphincsPublicKey,
  type SphincsPrivateKey,
  type SphincsSignature,
  type SphincsKeyPair,
  type SphincsParams,
  SPHINCS_PARAMS,
} from './slhdsa.ts';

export {
  HybridCrypto,
  type HybridKeyPair,
  type HybridEncapsulation,
  type HybridSignature,
  type HybridMode,
} from './hybrid.ts';
