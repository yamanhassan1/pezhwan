/**
 * PEZHWAN — WebAuthn credential model.
 *
 * Persists FIDO2/WebAuthn credentials (passkeys, security keys, platform
 * authenticators) keyed by user + tenant. Signing counters are stored to
 * detect cloned authenticators; transports and attestation metadata aid
 * device policy enforcement.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';

const { Schema, model, models } = mongoose;

export interface WebAuthnCredentialDoc {
  _id: Types.ObjectId;
  tenantId: string;
  userId: Types.ObjectId;
  /** Base64url credential id (the WebAuthn `id` / `rawId`). */
  credentialId: string;
  /** The credential's public key (COSE key bytes, hex/base64url encoded). */
  publicKey: string;
  /** Signature counter as reported by the authenticator. */
  counter: number;
  /** Transport hints reported at registration. */
  transports: string[];
  /** Attestation format ('none', 'packed', 'fido-u2f', 'apple', ...). */
  attestationFormat?: string;
  /** User-facing label (e.g. "YubiKey 5", "Windows Hello"). */
  nickname?: string;
  /** AAGUID of the authenticator (device fingerprint). */
  aaguid?: string;
  /** Whether this authenticator is a resident/discoverable credential. */
  discoverable: boolean;
  /** Whether the authenticator performed user verification at setup. */
  userVerified: boolean;
  /** Whether the device is flagged as requiring re-verification. */
  isRevoked: boolean;
  revokedAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  __v?: number;
}

const schema = new Schema<WebAuthnCredentialDoc>(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    credentialId: { type: String, required: true },
    publicKey: { type: String, required: true },
    counter: { type: Number, required: true, default: 0 },
    transports: { type: [String], default: [] },
    attestationFormat: { type: String },
    nickname: { type: String, trim: true },
    aaguid: { type: String },
    discoverable: { type: Boolean, default: false },
    userVerified: { type: Boolean, default: false },
    isRevoked: { type: Boolean, default: false },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// A credential id is globally unique (FIDO2 credential ids are random).
schema.index({ credentialId: 1 }, { unique: true });
// Lookup for a user's credentials.
schema.index({ tenantId: 1, userId: 1 });
// Only active credentials in auth flows.
schema.index({ userId: 1, isRevoked: 1 });

export const WebAuthnCredentialModel: Model<WebAuthnCredentialDoc> =
  (models.WebAuthnCredential as Model<WebAuthnCredentialDoc>) ||
  model<WebAuthnCredentialDoc>('WebAuthnCredential', schema);