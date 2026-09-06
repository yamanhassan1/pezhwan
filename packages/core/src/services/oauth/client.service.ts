/**
 * PEZHWAN — OAuth client registry service.
 *
 * Administrative lifecycle for OAuth clients: register, list, activate,
 * deactivate, and rotate secrets. Secrets are stored as SHA-256 hashes only
 * (see oauthClient.model.ts) — the raw secret is surfaced exactly once at
 * creation/rotation.
 */

import { createHash, randomBytes } from 'node:crypto';
import { OAuthClientModel, type OAuthClientDoc } from '../../models/index.ts';
import type { OAuthGrant } from '@pezhwan/shared';

export interface RegisterClientInput {
  tenantId: string;
  applicationId: string;
  name: string;
  redirectUris: string[];
  grants?: OAuthGrant[];
  scopes?: string[];
  confidential?: boolean;
}

export interface RegisteredClient {
  clientId: string;
  clientSecret?: string;
  name: string;
  confidential: boolean;
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('base64');
}

export class OAuthClientService {
  /** Registers a client, returning it with a one-time raw secret. */
  async register(input: RegisterClientInput): Promise<RegisteredClient> {
    const rawSecret = randomBytes(32).toString('base64url');
    const clientId = `client_${randomBytes(16).toString('base64url')}`;
    const confidential = input.confidential !== false;
    await OAuthClientModel.create({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      name: input.name,
      clientId,
      clientSecretHash: confidential ? hashSecret(rawSecret) : null,
      redirectUris: input.redirectUris,
      grants: (input.grants ?? ['authorization_code', 'refresh_token']) as OAuthGrant[],
      pkceMethods: confidential ? ['S256', 'plain'] : ['S256'],
      scopes: input.scopes ?? ['openid', 'profile', 'email'],
      isActive: true,
      isConfidential: confidential,
      tokenEndpointAuthMethod: confidential ? 'client_secret_post' : 'none',
    });
    return {
      clientId,
      clientSecret: confidential ? rawSecret : undefined,
      name: input.name,
      confidential,
    };
  }

  async list(tenantId: string, applicationId: string): Promise<OAuthClientDoc[]> {
    return OAuthClientModel.find({ tenantId, applicationId });
  }

  async get(clientId: string): Promise<OAuthClientDoc | null> {
    return OAuthClientModel.findOne({ clientId });
  }

  async setActive(clientId: string, isActive: boolean): Promise<OAuthClientDoc | null> {
    return OAuthClientModel.findOneAndUpdate({ clientId }, { $set: { isActive } }, { new: true });
  }

  /** Rotates the client secret; returns null for public clients. */
  async rotateSecret(clientId: string): Promise<{ rawSecret: string } | null> {
    const rawSecret = randomBytes(32).toString('base64url');
    const doc = await OAuthClientModel.findOneAndUpdate(
      { clientId, isConfidential: true },
      { $set: { clientSecretHash: hashSecret(rawSecret) } },
      { new: true },
    );
    if (!doc) return null;
    return { rawSecret };
  }

  async remove(clientId: string): Promise<void> {
    await OAuthClientModel.deleteOne({ clientId });
  }
}