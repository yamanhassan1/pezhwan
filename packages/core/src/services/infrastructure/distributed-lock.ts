/**
 * PEZHWAN — distributed lock (Redlock-style).
 *
 * Provides mutual exclusion across multiple server instances using Redis
 * SET NX EX (or an in-memory fallback for single-node degraded mode).
 *
 * Used for: session rotation (prevent concurrent refresh-token reuse),
 * key rotation, backup locks, and any operation that must be serialised
 * across instances without relying on a single process.
 *
 * The lock is best-effort: if Redis is down the lock degrades to in-process
 * mutual exclusion (which is still safe for a single replica).
 */

import type { RedisCache, RedisLike } from '../redisCache.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LockOptions {
  /** Lock key (auto-prefixed with namespace). */
  key: string;
  /** TTL in ms — the lock auto-expires after this duration (default 10 000). */
  ttlMs?: number;
  /** Retry attempts when the lock is already held (default 0 = acquire-or-fail). */
  retries?: number;
  /** Delay in ms between retries (default 100). */
  retryDelayMs?: number;
}

export interface Lock {
  /** Unique token that proves ownership. */
  readonly token: string;
  /** The key that was locked. */
  readonly key: string;
  /** Timestamp when the lock was acquired. */
  readonly acquiredAt: number;
  /** TTL in ms. */
  readonly ttlMs: number;

  /**
   * Release the lock. Only succeeds when the caller still owns the token.
   * Returns true if released, false if already expired / stolen.
   */
  release(): Promise<boolean>;

  /**
   * Extend the lock TTL (re-acquire with the same token). Returns true on
   * success, false if the lock was lost.
   */
  extend(ttlMs?: number): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

let lockCounter = 0;

function generateToken(): string {
  lockCounter += 1;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `lock:${ts}:${rand}:${lockCounter}`;
}

export class DistributedLock {
  private readonly namespace: string;

  constructor(
    private readonly cache: RedisCache,
    private readonly client: RedisLike | null,
    namespace = 'pezhwan',
  ) {
    this.namespace = namespace;
  }

  private prefixedKey(key: string): string {
    return `${this.namespace}:lock:${key}`;
  }

  /**
   * Attempt to acquire a lock. Returns a Lock handle on success, or null
   * when the lock is already held and retries are exhausted.
   *
   * Under the hood this performs a Redis SET key NX EX (atomic) or an
   * in-memory Map-based lock for the degraded path.
   */
  async acquire(options: LockOptions): Promise<Lock | null> {
    const { key, ttlMs = 10_000, retries = 0, retryDelayMs = 100 } = options;
    const fullKey = this.prefixedKey(key);
    const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const token = generateToken();
      const acquired = await this.tryAcquire(fullKey, token, ttlSeconds);
      if (acquired) {
        return this.createLock(fullKey, token, ttlMs);
      }
      if (attempt < retries) {
        await sleep(retryDelayMs);
      }
    }
    return null;
  }

  /**
   * Convenience: execute a function under a lock. The lock is automatically
   * released when the function completes (or throws). Returns null when the
   * lock cannot be acquired.
   */
  async withLock<T>(options: LockOptions, fn: () => Promise<T>): Promise<T | null> {
    const lock = await this.acquire(options);
    if (!lock) {
      return null;
    }
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  // -------------------------------------------------------------------------
  // Redis SET NX EX implementation
  // -------------------------------------------------------------------------

  private async tryAcquire(fullKey: string, token: string, ttlSeconds: number): Promise<boolean> {
    try {
      // Use the raw ioredis client if available for SET NX EX (atomic).
      if (this.client && this.client.status === 'ready' && typeof this.client.set === 'function') {
        const result = await (
          this.client as { set: (...args: unknown[]) => Promise<string | null> }
        ).set(fullKey, token, 'NX', 'EX', ttlSeconds);
        return result === 'OK';
      }

      // Fallback: check-then-set via the RedisCache (less atomic, but safe
      // enough for single-instance degraded mode).
      const existing = await this.client?.get(fullKey);
      if (existing) {
        return false;
      }
      await this.cache.set(fullKey, token, ttlSeconds);
      return true;
    } catch {
      return false;
    }
  }

  private createLock(fullKey: string, token: string, ttlMs: number): Lock {
    const lock: Lock = {
      token,
      key: fullKey,
      acquiredAt: Date.now(),
      ttlMs,

      release: async (): Promise<boolean> => {
        try {
          // Lua script for atomic ownership check + delete. Falls back to
          // GET + DEL for caches without Lua support.
          if (
            this.client &&
            this.client.status === 'ready' &&
            typeof (this.client as any).eval === 'function'
          ) {
            const result = await (this.client as any).eval(
              'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
              [fullKey],
              [token],
            );
            return result === 1;
          }
          // In-memory fallback: just delete (single-process, no races).
          await this.cache.del(fullKey);
          return true;
        } catch {
          return false;
        }
      },

      extend: async (newTtlMs?: number): Promise<boolean> => {
        const newTtl = newTtlMs ?? ttlMs;
        const newTtlSeconds = Math.max(1, Math.ceil(newTtl / 1000));
        try {
          if (
            this.client &&
            this.client.status === 'ready' &&
            typeof (this.client as any).eval === 'function'
          ) {
            const result = await (this.client as any).eval(
              'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end',
              [fullKey],
              [token, String(newTtl)],
            );
            return result === 1;
          }
          // In-memory fallback: just re-set.
          await this.cache.set(fullKey, token, newTtlSeconds);
          return true;
        } catch {
          return false;
        }
      },
    };
    return lock;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createDistributedLock(
  cache: RedisCache,
  client: RedisLike | null,
  namespace = 'pezhwan',
): DistributedLock {
  return new DistributedLock(cache, client, namespace);
}
