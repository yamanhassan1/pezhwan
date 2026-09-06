/**
 * PEZHWAN — key store service.
 *
 * Persists JWT signing keys to MongoDB with lifecycle management
 * (generate → stage → activate → retire → revoke). The in-memory KeyStore
 * from @pezhwan/crypto handles ephemeral key state; this service adds
 * durable storage so keys survive process restarts and can be shared
 * across instances.
 */

import mongoose from 'mongoose';
import type { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { JwtAlgorithm } from '@pezhwan/shared';

const { Schema, model, models } = mongoose;

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export type KeyDocStatus = 'STAGED' | 'ACTIVE' | 'VERIFY-ONLY' | 'RETIRED' | 'REVOKED';

export interface KeyDoc {
  _id: Types.ObjectId;
  kid: string;
  tenantId: string;
  algorithm: JwtAlgorithm;
  publicKey: string;
  privateKey: string;
  status: KeyDocStatus;
  createdAt: Date;
  activatedAt?: Date;
  retiredAt?: Date;
  revokedAt?: Date;
  expiresAt: Date;
}

const keySchema = new Schema<KeyDoc>(
  {
    kid: { type: String, required: true },
    tenantId: { type: String, required: true },
    algorithm: { type: String, required: true, enum: ['RS256', 'ES256', 'EdDSA', 'HS256'] },
    publicKey: { type: String, required: true },
    privateKey: { type: String, required: true, select: false },
    status: {
      type: String,
      required: true,
      enum: ['STAGED', 'ACTIVE', 'VERIFY-ONLY', 'RETIRED', 'REVOKED'],
    },
    activatedAt: { type: Date },
    retiredAt: { type: Date },
    revokedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

keySchema.index({ tenantId: 1, kid: 1 }, { unique: true });
keySchema.index({ tenantId: 1, status: 1 });
keySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const KeyModel: Model<KeyDoc> = (models.Key as Model<KeyDoc>) || model<KeyDoc>('Key', keySchema);

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface KeyStoreServiceOptions {
  /** Default key TTL in ms (default 30 days). */
  defaultTtlMs?: number;
  /** Maximum active keys per tenant (default 5). */
  maxActiveKeys?: number;
}

export class KeyStoreService {
  private readonly defaultTtlMs: number;
  private readonly maxActiveKeys: number;

  constructor(options: KeyStoreServiceOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 30 * 24 * 60 * 60 * 1000;
    this.maxActiveKeys = options.maxActiveKeys ?? 5;
  }

  /**
   * Generate and persist a new signing key. The key is created in STAGED
   * status and must be explicitly activated.
   */
  async generateKey(
    tenantId: string,
    algorithm: JwtAlgorithm = 'RS256',
    ttlMs?: number,
  ): Promise<KeyDoc> {
    const { generateKeyPairSync } = await import('node:crypto');
    const kid = randomUUID();
    const expiresAt = new Date(Date.now() + (ttlMs ?? this.defaultTtlMs));

    let publicKey: string;
    let privateKey: string;

    if (algorithm === 'ES256') {
      const kp = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      publicKey = kp.publicKey.export({ type: 'spki', format: 'pem' }) as string;
      privateKey = kp.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    } else if (algorithm === 'EdDSA') {
      const kp = generateKeyPairSync('ed25519');
      publicKey = kp.publicKey.export({ type: 'spki', format: 'pem' }) as string;
      privateKey = kp.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    } else {
      // RSA (RS256)
      const kp = generateKeyPairSync('rsa', { modulusLength: 2048 });
      publicKey = kp.publicKey.export({ type: 'spki', format: 'pem' }) as string;
      privateKey = kp.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    }

    const doc = await KeyModel.create({
      kid,
      tenantId,
      algorithm,
      publicKey,
      privateKey,
      status: 'STAGED',
      expiresAt,
    });

    return doc;
  }

  /**
   * Activate a staged key. This makes it the current signing key.
   * Previous ACTIVE keys are moved to VERIFY-ONLY.
   */
  async activateKey(kid: string, tenantId: string): Promise<KeyDoc | null> {
    const session = await mongoose.startSession();
    try {
      let result: KeyDoc | null = null;
      await session.withTransaction(async () => {
        // Demote existing active keys.
        await KeyModel.updateMany(
          { tenantId, status: 'ACTIVE' },
          { $set: { status: 'VERIFY-ONLY' } },
          { session },
        );

        // Promote the staged key.
        result = await KeyModel.findOneAndUpdate(
          { kid, tenantId, status: 'STAGED' },
          { $set: { status: 'ACTIVE', activatedAt: new Date() } },
          { session, new: true },
        );
      });
      return result;
    } finally {
      session.endSession();
    }
  }

  /**
   * Retire a key (no longer used for signing, still valid for verification).
   */
  async retireKey(kid: string, tenantId: string): Promise<boolean> {
    const result = await KeyModel.findOneAndUpdate(
      { kid, tenantId, status: { $in: ['ACTIVE', 'VERIFY-ONLY'] } },
      { $set: { status: 'RETIRED', retiredAt: new Date() } },
    );
    return result !== null;
  }

  /**
   * Revoke a key (immediate invalidation). Should only be used in
   * emergency key compromise scenarios.
   */
  async revokeKey(kid: string, tenantId: string): Promise<boolean> {
    const result = await KeyModel.findOneAndUpdate(
      { kid, tenantId, status: { $ne: 'REVOKED' } },
      { $set: { status: 'REVOKED', revokedAt: new Date() } },
    );
    return result !== null;
  }

  /**
   * Get the current active signing key.
   */
  async getActiveKey(tenantId: string): Promise<KeyDoc | null> {
    return KeyModel.findOne({ tenantId, status: 'ACTIVE' });
  }

  /**
   * Get all keys valid for verification (ACTIVE + VERIFY-ONLY).
   */
  async getVerificationKeys(tenantId: string): Promise<KeyDoc[]> {
    return KeyModel.find({ tenantId, status: { $in: ['ACTIVE', 'VERIFY-ONLY'] } });
  }

  /**
   * Get a specific key by kid (includes private key for signing).
   */
  async getKey(kid: string, tenantId: string): Promise<KeyDoc | null> {
    return KeyModel.findOne({ kid, tenantId }).select('+privateKey');
  }

  /**
   * List all keys for a tenant (optionally including revoked).
   */
  async listKeys(tenantId: string, includeRevoked = false): Promise<KeyDoc[]> {
    const filter: Record<string, unknown> = { tenantId };
    if (!includeRevoked) {
      filter.status = { $ne: 'REVOKED' };
    }
    return KeyModel.find(filter).sort({ createdAt: -1 });
  }

  /**
   * Clean up expired keys that haven't been auto-deleted by TTL index.
   * Run periodically (e.g. daily cron).
   */
  async cleanupExpired(): Promise<number> {
    const result = await KeyModel.deleteMany({
      expiresAt: { $lte: new Date() },
      status: { $nin: ['ACTIVE', 'VERIFY-ONLY'] },
    });
    return result.deletedCount ?? 0;
  }

  /**
   * Rotate keys: retire the oldest ACTIVE key and generate a new one.
   */
  async rotateKey(tenantId: string, algorithm: JwtAlgorithm = 'RS256'): Promise<KeyDoc> {
    const active = await KeyModel.findOne({ tenantId, status: 'ACTIVE' }).sort({ activatedAt: 1 });
    if (active) {
      await this.retireKey(active.kid, tenantId);
    }
    const newKey = await this.generateKey(tenantId, algorithm);
    return this.activateKey(newKey.kid, tenantId) as Promise<KeyDoc>;
  }
}

export function createKeyStoreService(options?: KeyStoreServiceOptions): KeyStoreService {
  return new KeyStoreService(options);
}
