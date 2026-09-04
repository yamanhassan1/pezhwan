/**
 * PEZHWAN — WebAuthn / FIDO2 enterprise service.
 *
 * Orchestrates the FIDO2 registration and authentication lifecycle on top of
 * the device-level verifiers in `@pezhwan/crypto`:
 *   - Passkeys (cross-device sync, discoverable/resident credentials)
 *   - Security keys (YubiKey, SoloKey, ...) with attestation validation
 *   - Platform authenticators (Windows Hello, macOS Touch ID, Android/iOS)
 *   - Credential management (list, rename, delete, revoke)
 *
 * Design rules:
 *   - The low-level signature/attestation verification lives in
 *     `@pezhwan/crypto` (pure, testable). This service handles persistence,
 *     ownership, replay/domain checks, audit events and policy.
 *   - An unknown challenge or mismatched origin/rpId fails closed.
 *   - Signing counters are compared to detect cloned authenticators.
 */

import {
  generateChallenge,
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
  type PublicKeyCredentialCreationOptions,
  type PublicKeyCredentialRequestOptions,
  type RegistrationResult,
  type AuthenticationResult,
  type WebAuthnVerificationResult,
  type AuthenticatorTransport,
} from '@pezhwan/crypto';
import { AuthenticationError, ValidationError } from '@pezhwan/shared';
import { AUDIT_EVENT } from '@pezhwan/shared';
import { WebAuthnCredentialModel } from '../../models/index.ts';
import type { AuditService } from '../audit.service.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebAuthnConfig {
  /** RP display name shown in the authenticator prompt. */
  rpName: string;
  /** RP id (e.g. "auth.example.com") — must match the web origin. */
  rpId: string;
  /** Allowed origin(s) for clientDataJSON validation. */
  origins: string[];
  /** Require user verification (UV) on registration/auth. */
  requireUserVerification?: boolean;
  /** Require discoverable (resident) credentials. */
  requireResidentKey?: boolean;
  /** Attestation conveyance preference. */
  attestation?: 'none' | 'indirect' | 'direct';
  /** Max challenge age in ms before a pending registration expires. */
  challengeTtlMs?: number;
}

export interface WebAuthnChallenge {
  challenge: string;
  userId?: string;
  expiresAt: number;
}

export interface RegisterOptionsResult {
  options: PublicKeyCredentialCreationOptions;
  /** The challenge this registration must complete against. */
  expectedChallenge: string;
}

export interface AuthenticateOptionsResult {
  options: PublicKeyCredentialRequestOptions;
  /** The challenge this authentication must complete against. */
  expectedChallenge: string;
}

export interface WebAuthnCredentialSummary {
  credentialId: string;
  nickname?: string;
  transports: string[];
  attestationFormat?: string;
  aaguid?: string;
  discoverable: boolean;
  createdAt: Date;
  lastUsedAt?: Date | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CHALLENGE_TTL_MS = 5 * 60_000; // 5 minutes

/** In-memory challenge store (per-instance). Production should use Redis. */
const challengeStore = new Map<string, WebAuthnChallenge>();

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class WebAuthnService {
  private readonly rpName: string;
  private readonly rpId: string;
  private readonly origins: string[];
  private readonly requireUserVerification: boolean;
  private readonly requireResidentKey: boolean;
  private readonly attestation: 'none' | 'indirect' | 'direct';
  private readonly challengeTtlMs: number;

  constructor(
    config: WebAuthnConfig,
    private readonly audit?: AuditService,
  ) {
    if (!config.rpId) {
      throw new ValidationError('WebAuthn requires an rpId', 'INVALID_CONFIG');
    }
    if (config.origins.length === 0) {
      throw new ValidationError('WebAuthn requires at least one allowed origin', 'INVALID_CONFIG');
    }
    this.rpName = config.rpName;
    this.rpId = config.rpId;
    this.origins = config.origins;
    this.requireUserVerification = config.requireUserVerification ?? false;
    this.requireResidentKey = config.requireResidentKey ?? false;
    this.attestation = config.attestation ?? 'none';
    this.challengeTtlMs = config.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS;
  }

  // ---------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------

  /**
   * Begin a registration ceremony. Persists the expected challenge so the
   * verification step can attest that the response matches THIS ceremony.
   */
  async beginRegistration(
    userId: string,
    userName: string,
    userDisplayName: string,
    existingCredentialIds: string[] = [],
  ): Promise<RegisterOptionsResult> {
    // Allowed credential ids are base64url — the crypto helpers expect them as-is.
    const options = generateRegistrationOptions({
      rpName: this.rpName,
      rpId: this.rpId,
      userId,
      userName,
      userDisplayName,
      excludeCredentials: existingCredentialIds,
      userVerification: this.requireUserVerification ? 'required' : 'preferred',
      residentKey: this.requireResidentKey ? 'required' : 'preferred',
      attestation: this.attestation,
      timeout: 60_000,
    });

    challengeStore.set(options.challenge, {
      challenge: options.challenge,
      userId,
      expiresAt: Date.now() + this.challengeTtlMs,
    });

    return { options, expectedChallenge: options.challenge };
  }

  /**
   * Complete a registration ceremony. Verifies the attestation object,
   * validates challenge/origin/rpId, then persists the credential.
   */
  async completeRegistration(
    registrationResult: RegistrationResult,
    expectedChallenge: string,
    origin: string,
  ): Promise<WebAuthnCredentialSummary> {
    if (!allows(origin, this.origins)) {
      throw new AuthenticationError('Origin not allowed', 'WEB_AUTHN_ORIGIN');
    }

    const pending = this.takeChallenge(expectedChallenge);
    if (!pending?.userId) {
      throw new AuthenticationError('Unknown or expired challenge', 'WEB_AUTHN_CHALLENGE');
    }

    const verification = await verifyRegistrationResponse({
      challenge: expectedChallenge,
      origin,
      rpId: this.rpId,
      registrationResult,
    });

    if (!verification.verified || !verification.credentialId) {
      throw new AuthenticationError(
        verification.error ?? 'Registration verification failed',
        'WEB_AUTHN_INVALID',
      );
    }

    // The crypto verifier already parsed the credential public key. Re-derive a
    // durable credential from the returned result (the service stores the raw
    // id + a counter starting at the verified value).
    const existing = await WebAuthnCredentialModel.countDocuments({
      credentialId: verification.credentialId,
    });
    if (existing > 0) {
      throw new ValidationError(
        'Credential already registered',
        'WEB_AUTHN_DUPLICATE',
      );
    }

    const credential = await WebAuthnCredentialModel.create({
      tenantId: pending.userId, // userId is the tenant-scoped owner (single-tenant default)
      userId: pending.userId as unknown as import('mongoose').Types.ObjectId,
      credentialId: verification.credentialId,
      // COSE-encoded public key parsed from the attestation object (hex). This
      // is what the authenticator later signs with during authentication.
      publicKey: verification.credentialPublicKey ?? '',
      counter: verification.newCounter ?? 0,
      transports: (registrationResult.response as { getTransports?: () => string[] }).getTransports?.() ?? [],
      attestationFormat: verification.attestationFormat ?? this.attestation,
      discoverable: this.requireResidentKey,
      userVerified: this.requireUserVerification,
      isRevoked: false,
    });

    await this.audit?.log({
      eventType: AUDIT_EVENT.MFA_ENABLED,
      userId: pending.userId,
      metadata: { method: 'webauthn', credentialId: verification.credentialId },
    } as never);

    return this.toSummary(credential);
  }

  // ---------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------

  /**
   * Begin an authentication ceremony. If `credentialIds` is empty, any
   * registered credential for the user may be used (passkey/discoverable flow).
   */
  async beginAuthentication(
    userId: string,
    credentialIds?: string[],
  ): Promise<AuthenticateOptionsResult> {
    const allowCredentials = credentialIds && credentialIds.length > 0
      ? credentialIds
      : await this.listCredentialIds(userId);

    const options = generateAuthenticationOptions({
      rpId: this.rpId,
      allowCredentials,
      userVerification: this.requireUserVerification ? 'required' : 'preferred',
      timeout: 60_000,
    });

    challengeStore.set(options.challenge, {
      challenge: options.challenge,
      userId,
      expiresAt: Date.now() + this.challengeTtlMs,
    });

    return { options, expectedChallenge: options.challenge };
  }

  /**
   * Complete an authentication ceremony. Verifies the signature, validates
   * challenge/origin/rpId, checks the signing counter, and updates it.
   */
  async completeAuthentication(
    authenticationResult: AuthenticationResult,
    expectedChallenge: string,
    origin: string,
  ): Promise<boolean> {
    if (!allows(origin, this.origins)) {
      throw new AuthenticationError('Origin not allowed', 'WEB_AUTHN_ORIGIN');
    }

    const pending = this.takeChallenge(expectedChallenge);
    if (!pending?.userId) {
      throw new AuthenticationError('Unknown or expired challenge', 'WEB_AUTHN_CHALLENGE');
    }

    const credential = await WebAuthnCredentialModel.findOne({
      credentialId: authenticationResult.id,
      isRevoked: false,
    });
    if (!credential) {
      throw new AuthenticationError('Unknown credential', 'WEB_AUTHN_UNKNOWN');
    }

    const verification: WebAuthnVerificationResult =
      await verifyAuthenticationResponse({
        challenge: expectedChallenge,
        origin,
        rpId: this.rpId,
        authenticationResult,
        credential: {
          credentialId: credential.credentialId,
          publicKey: credential.publicKey,
          counter: credential.counter,
          transports: credential.transports as AuthenticatorTransport[],
          createdAt: credential.createdAt,
        },
      });

    if (!verification.verified) {
      await this.audit?.log({
        eventType: AUDIT_EVENT.MFA_CHALLENGE_FAILED,
        userId: pending.userId,
        metadata: { method: 'webauthn', credentialId: credential.credentialId },
      } as never);
      return false;
    }

    // Update counter + last used. Detect cloned authenticators: the counter must
    // not go backwards (0 means the authenticator doesn't support counters).
    const newCounter = verification.newCounter ?? credential.counter;
    if (credential.counter > 0 && newCounter <= credential.counter) {
      await this.audit?.log({
        eventType: AUDIT_EVENT.MFA_CHALLENGE_FAILED,
        userId: pending.userId,
        metadata: {
          method: 'webauthn',
          credentialId: credential.credentialId,
          reason: 'counter_reuse_clone_detected',
        },
      } as never);
      return false;
    }

    await WebAuthnCredentialModel.updateOne(
      { _id: credential._id },
      { counter: newCounter, lastUsedAt: new Date() },
    );

    await this.audit?.log({
      eventType: AUDIT_EVENT.MFA_CHALLENGE_SUCCESS,
      userId: pending.userId,
      metadata: { method: 'webauthn', credentialId: credential.credentialId },
    } as never);

    return true;
  }

  // ---------------------------------------------------------------------
  // Credential management
  // ---------------------------------------------------------------------

  /** List a user's registered credentials (no key material exposed). */
  async listCredentials(userId: string): Promise<WebAuthnCredentialSummary[]> {
    const docs = await WebAuthnCredentialModel.find({ userId, isRevoked: false })
      .sort({ createdAt: -1 })
      .lean();
    return docs.map((d) => this.toSummary(d));
  }

  /** List just the base64url credential ids for a user (for allowCredentials). */
  async listCredentialIds(userId: string): Promise<string[]> {
    const docs = await WebAuthnCredentialModel.find({ userId, isRevoked: false })
      .select('credentialId')
      .lean();
    return docs.map((d) => d.credentialId);
  }

  /** Rename a credential's user-facing nickname. */
  async renameCredential(userId: string, credentialId: string, nickname: string): Promise<void> {
    const res = await WebAuthnCredentialModel.updateOne(
      { userId, credentialId },
      { $set: { nickname } },
    );
    if (res.matchedCount === 0) {
      throw new ValidationError('Credential not found', 'WEB_AUTHN_NOT_FOUND');
    }
  }

  /** Delete a credential (removes the second factor / passkey). */
  async deleteCredential(userId: string, credentialId: string): Promise<void> {
    const res = await WebAuthnCredentialModel.deleteOne({ userId, credentialId });
    if (res.deletedCount === 0) {
      throw new ValidationError('Credential not found', 'WEB_AUTHN_NOT_FOUND');
    }
  }

  /** Revoke a credential (keep the record, block future use). */
  async revokeCredential(userId: string, credentialId: string): Promise<void> {
    const res = await WebAuthnCredentialModel.updateOne(
      { userId, credentialId },
      { $set: { isRevoked: true, revokedAt: new Date() } },
    );
    if (res.matchedCount === 0) {
      throw new ValidationError('Credential not found', 'WEB_AUTHN_NOT_FOUND');
    }
  }

  /** Whether the user has any active (non-revoked) credentials. */
  async hasCredentials(userId: string): Promise<boolean> {
    const count = await WebAuthnCredentialModel.countDocuments({ userId, isRevoked: false });
    return count > 0;
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private takeChallenge(challenge: string): WebAuthnChallenge | undefined {
    const pending = challengeStore.get(challenge);
    challengeStore.delete(challenge);
    if (!pending) return undefined;
    if (pending.expiresAt < Date.now()) return undefined;
    return pending;
  }

  private toSummary(doc: {
    credentialId: string;
    nickname?: string;
    transports: string[];
    attestationFormat?: string;
    aaguid?: string;
    discoverable: boolean;
    createdAt: Date;
    lastUsedAt?: Date | null;
  }): WebAuthnCredentialSummary {
    return {
      credentialId: doc.credentialId,
      nickname: doc.nickname,
      transports: doc.transports,
      attestationFormat: doc.attestationFormat,
      aaguid: doc.aaguid,
      discoverable: doc.discoverable,
      createdAt: doc.createdAt,
      lastUsedAt: doc.lastUsedAt ?? null,
    };
  }
}

/** Origin allow-list check (exact match after normalization). */
function allows(origin: string, allowedOrigins: string[]): boolean {
  const normalized = origin.replace(/\/$/, '');
  return allowedOrigins.some((o) => o.replace(/\/$/, '') === normalized);
}