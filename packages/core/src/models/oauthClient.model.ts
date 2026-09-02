/**
 * PEZHWAN — OAuth client model (OAuth 2.1 / OIDC).
 *
 * Represents a registered client that can initiate authorization-code flows.
 * Client secrets are NEVER stored raw — only the SHA-256 hash. Public clients
 * (SPAs) use PKCE with S256 and no secret.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';
import type { OAuthGrant } from '@pezhwan/shared';

const { Schema, model, models } = mongoose;

export interface OAuthClientDoc {
  _id: Types.ObjectId;
  tenantId: string;
  applicationId: string;
  name: string;
  clientId: string;
  clientSecretHash: string | null;
  redirectUris: string[];
  grants: OAuthGrant[];
  pkceMethods: ('S256' | 'plain' | 'none')[];
  scopes: string[];
  isActive: boolean;
  isConfidential: boolean;
  tokenEndpointAuthMethod:
    | 'client_secret_basic'
    | 'client_secret_post'
    | 'none';
  createdAt: Date;
  updatedAt: Date;
}

const oauthClientSchema = new Schema<OAuthClientDoc>(
  {
    tenantId: { type: String, required: true },
    applicationId: { type: String, required: true },
    name: { type: String, required: true },
    clientId: { type: String, required: true },
    clientSecretHash: { type: String, default: null },
    redirectUris: { type: [String], default: [] },
    grants: {
      type: [String],
      enum: ['authorization_code', 'refresh_token', 'client_credentials'],
      default: ['authorization_code'],
    },
    pkceMethods: {
      type: [String],
      enum: ['S256', 'plain', 'none'],
      default: ['S256'],
    },
    scopes: { type: [String], default: ['openid', 'profile', 'email'] },
    isActive: { type: Boolean, default: true },
    isConfidential: { type: Boolean, default: true },
    tokenEndpointAuthMethod: {
      type: String,
      enum: ['client_secret_basic', 'client_secret_post', 'none'],
      default: 'client_secret_basic',
    },
  },
  { timestamps: true, versionKey: false },
);

// Unique clientId (globally unique — used in the token/authorize endpoints).
oauthClientSchema.index({ clientId: 1 }, { unique: true });
// Tenant-scoped lookups for admin listings + isolation.
oauthClientSchema.index({ tenantId: 1, applicationId: 1 });

export const OAuthClientModel: Model<OAuthClientDoc> =
  (models.OAuthClient as Model<OAuthClientDoc>) ||
  model<OAuthClientDoc>('OAuthClient', oauthClientSchema);
