/**
 * PEZHWAN — Zero-Knowledge Proofs module entry point.
 */

export {
  ZkSnarkProver,
  createZkProver,
  PEZHWAN_CIRCUITS,
  type ZKCircuit,
  type ZKProof,
  type ZKVerificationKey,
  type ZKProverOptions,
} from './snark.ts';

export {
  ZkStarkProver,
  createStarkProver,
  PEZHWAN_STARK_CIRCUITS,
  type StarkCircuit,
  type StarkProof,
  type StarkVerificationKey,
} from './stark.ts';

export {
  ZKVerifier,
  createZKVerifier,
  type AnyProof,
  type AnyVerificationKey,
  type VerificationResult,
} from './verifier.ts';
