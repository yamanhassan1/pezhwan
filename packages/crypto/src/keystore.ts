/**
 * PEZHWAN — in-memory key store for encryption keys.
 *
 * Manages encryption keys with lifecycle (active → retired → destroyed)
 * and provides key rotation. Keys are stored in memory and must be
 * provided at startup (e.g. from environment variables, KMS, or HSM).
 */

import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CryptoKey {
  /** Unique key identifier. */
  readonly id: string;
  /** Key material (32 bytes for AES-256). */
  readonly material: Buffer;
  /** Key creation timestamp. */
  readonly createdAt: Date;
  /** Key expiration (optional). */
  readonly expiresAt?: Date;
  /** Key purpose. */
  readonly purpose: 'encryption' | 'signing' | 'mac';
  /** Key status. */
  readonly status: 'ACTIVE' | 'RETIRED' | 'DESTROYED';
  /** Algorithm the key is used with. */
  readonly algorithm: string;
}

// ---------------------------------------------------------------------------
// CryptoKeyStore
// ---------------------------------------------------------------------------

export class CryptoKeyStore {
  private readonly keys = new Map<string, CryptoKey>();

  /**
   * Register a key in the store.
   */
  addKey(key: CryptoKey): void {
    this.keys.set(key.id, key);
  }

  /**
   * Get a key by ID. Returns null if not found or destroyed.
   */
  getKey(keyId: string): CryptoKey | null {
    const key = this.keys.get(keyId);
    if (!key || key.status === 'DESTROYED') {
      return null;
    }
    return key;
  }

  /**
   * Get the current active key for a purpose.
   * Returns the most recently created active key.
   */
  getActiveKey(purpose: CryptoKey['purpose'] = 'encryption'): CryptoKey | null {
    let latest: CryptoKey | null = null;
    for (const key of this.keys.values()) {
      if (key.status === 'ACTIVE' && key.purpose === purpose) {
        if (!latest || key.createdAt > latest.createdAt) {
          latest = key;
        }
      }
    }
    return latest;
  }

  /**
   * Retire a key (no longer used for new operations, still valid for
   * decryption of existing data).
   */
  retireKey(keyId: string): boolean {
    const key = this.keys.get(keyId);
    if (!key || key.status !== 'ACTIVE') {
      return false;
    }
    this.keys.set(keyId, { ...key, status: 'RETIRED' });
    return true;
  }

  /**
   * Destroy a key (immediate invalidation).
   */
  destroyKey(keyId: string): boolean {
    const key = this.keys.get(keyId);
    if (!key) {
      return false;
    }
    this.keys.set(keyId, { ...key, status: 'DESTROYED', material: Buffer.alloc(0) });
    return true;
  }

  /**
   * List all keys (optionally filtered by purpose and status).
   */
  listKeys(filters?: { purpose?: CryptoKey['purpose']; status?: CryptoKey['status'] }): CryptoKey[] {
    return Array.from(this.keys.values()).filter((key) => {
      if (filters?.purpose && key.purpose !== filters.purpose) return false;
      if (filters?.status && key.status !== filters.status) return false;
      return true;
    });
  }

  /**
   * Generate a new AES-256 key and register it.
   */
  generateKey(purpose: CryptoKey['purpose'] = 'encryption', id?: string): CryptoKey {
    const keyId = id ?? randomBytes(16).toString('hex');
    const material = randomBytes(32);
    const key: CryptoKey = {
      id: keyId,
      material,
      createdAt: new Date(),
      purpose,
      status: 'ACTIVE',
      algorithm: 'AES-256-GCM',
    };
    this.addKey(key);
    return key;
  }

  /**
   * Rotate keys: retire the current active key and generate a new one.
   */
  rotateKey(purpose: CryptoKey['purpose'] = 'encryption'): CryptoKey {
    const current = this.getActiveKey(purpose);
    if (current) {
      this.retireKey(current.id);
    }
    return this.generateKey(purpose);
  }
}

export function createCryptoKeyStore(): CryptoKeyStore {
  return new CryptoKeyStore();
}
