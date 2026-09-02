/**
 * PEZHWAN — API key service.
 *
 * For server-to-server / service-to-service authentication. The raw key is
 * shown to the integrator once at creation time; we store only its SHA-256
 * hash and a human-readable prefix (e.g. "pk_live_...").
 */

import { randomBytes, createHash } from 'node:crypto';
import { ValidationError } from '@pezhwan/shared';
import { ApiKeyModel } from '../models/index.ts';

const KEY_PREFIX = 'pk_live';

export class ApiKeyService {
  /** Generate a new API key (returns raw once + caller persists the hash). */
  async create(input: {
    tenantId: string;
    applicationId: string;
    name: string;
    scopes?: string[];
  }): Promise<{ rawKey: string; prefix: string; keyHash: string }> {
    const rawKey = `${KEY_PREFIX}_${randomBytes(32).toString('base64url')}`;
    const keyHash = this.hashKey(rawKey);
    const prefix = `${KEY_PREFIX}_${rawKey.slice(KEY_PREFIX.length + 1, KEY_PREFIX.length + 9)}`;

    await ApiKeyModel.create({
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      name: input.name,
      keyHash,
      prefix,
      scopes: input.scopes ?? [],
      isActive: true,
    });

    return { rawKey, prefix, keyHash };
  }

  hashKey(raw: string): string {
    return createHash('sha256').update(raw).digest('base64');
  }

  /** Look up + authenticate a presented API key. */
  async authenticate(rawKey: string): Promise<{
    apiKeyId: string;
    tenantId: string;
    applicationId: string;
    scopes: string[];
  } | null> {
    const keyHash = this.hashKey(rawKey);
    const doc = await ApiKeyModel.findOne({ keyHash, isActive: true }).lean();
    if (!doc) {
      return null;
    }
    if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) {
      return null;
    }
    return {
      apiKeyId: String(doc._id),
      tenantId: String(doc.tenantId),
      applicationId: String(doc.applicationId),
      scopes: doc.scopes ?? [],
    };
  }

  async revoke(apiKeyId: string): Promise<void> {
    await ApiKeyModel.updateOne(
      { _id: apiKeyId },
      { isActive: false },
    );
  }
}