/**
 * PEZHWAN — OAuth authorization code model.
 *
 * A one-time authorization code issued by the /authorize endpoint and redeemed
 * at the /token endpoint during an authorization-code grant. Only the SHA-256
 * hash is stored. The PKCE challenge (code_challenge) is stored, never the
 * plaintext verifier. Short TTL with single-use semantics.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';
import type { AuthMethod } from '@pezhwan/shared';

const { Schema, model, models } = mongoose;

export interface AuthorizationCodeDoc {
  _id: Types.ObjectId;
  codeHash: string;
  tenantId: string;
  applicationId: string;
  clientId: string;
  userId: string;
  sessionId: string;
  redirectUri: string;
  scope: string[];
  codeChallenge: string | null;
  codeChallengeMethod: 'S256' | 'plain' | null;
  nonce: string | null;
  authMethod: AuthMethod;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

const authorizationCodeSchema = new Schema<AuthorizationCodeDoc>(
  {
    codeHash: { type: String, required: true },
    tenantId: { type: String, required: true },
    applicationId: { type: String, required: true },
    clientId: { type: String, required: true },
    userId: { type: String, required: true },
    sessionId: { type: String, required: true },
    redirectUri: { type: String, required: true },
    scope: { type: [String], default: [] },
    codeChallenge: { type: String, default: null },
    codeChallengeMethod: { type: String, enum: ['S256', 'plain', null], default: null },
    nonce: { type: String, default: null },
    authMethod: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Zero-knowledge single-use redemption: unique hash means a code cannot be
// replayed, and an attempt to insert a duplicate fails.
authorizationCodeSchema.index({ codeHash: 1 }, { unique: true });
// TTL: auto-remove expired codes.
authorizationCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Cleanup + audit lookups.
authorizationCodeSchema.index({ userId: 1, tenantId: 1 });

export const AuthorizationCodeModel: Model<AuthorizationCodeDoc> =
  (models.AuthorizationCode as Model<AuthorizationCodeDoc>) ||
  model<AuthorizationCodeDoc>('AuthorizationCode', authorizationCodeSchema);
