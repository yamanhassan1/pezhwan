/**
 * PEZHWAN — Redis cache wrapper.
 *
 * Small helper over ioredis used for ephemeral/high-speed state. Deliberately
 * never throws — on any Redis failure (unready client, mid-command error) it
 * returns a sentinel (null / false) so callers fall through to MongoDB, the
 * durable source of truth. This keeps Redis an optimiser, never a gate.
 */

/** Structural subset of ioredis we actually use (real clients satisfy this). */
export interface RedisLike {
  status: string;
  get(key: string): Promise<string | null>;
  set(...args: unknown[]): Promise<unknown>;
  del(...args: unknown[]): Promise<unknown>;
  connect?(): Promise<unknown>;
  disconnect?(): Promise<unknown> | void;
  /** Optional atomic counter ops used by the rate limiter. */
  incr?(key: string): Promise<number>;
  expire?(key: string, seconds: number): Promise<unknown>;
}

export interface RedisCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  ready(): Promise<boolean>;
  /**
   * Atomically increment a counter with an initial TTL. Returns the new value,
   * or null when the backing store cannot serve it. Used by the rate limiter so
   * the check-and-increment is atomic (no lost updates under concurrency).
   */
  incrementAndExpire?(key: string, ttlSeconds: number): Promise<number | null>;
}

/**
 * A bounded in-memory fallback used when Redis is unavailable.
 *
 * Bound is deliberate: Redis is the scalable ephemeral store; the process-local
 * fallback exists only for degraded single-node operation. To satisfy "no
 * unbounded caches" it is capacity-capped and TTL-swept so a burst of keys can
 * never grow memory without limit.
 */
export class MemoryCache implements RedisCache {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly maxEntries = 10_000) {}

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    // Opportunistic sweep of expired entries to keep the map small.
    if (this.store.size >= this.maxEntries) {
      const expired: string[] = [];
      const before = Date.now();
      for (const [k, e] of this.store) {
        if (e.expiresAt < before) {
          expired.push(k);
        }
      }
      for (const k of expired) {
        this.store.delete(k);
      }
      // Still over capacity: evict oldest (FIFO) until under the cap.
      if (this.store.size >= this.maxEntries) {
        const over = this.store.size - this.maxEntries + 1;
        const it = this.store.keys();
        for (let i = 0; i < over; i += 1) {
          const k = it.next().value;
          if (k !== undefined) {
            this.store.delete(k);
          }
        }
      }
    }
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : Number.MAX_SAFE_INTEGER,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incrementAndExpire(
    key: string,
    ttlSeconds: number,
  ): Promise<number | null> {
    // Single-threaded JS: read+write on the Map is atomic within one tick, so
    // this is a safe in-process counter for the degraded path.
    const before = Date.now();
    const entry = this.store.get(key);
    const current =
      entry && entry.expiresAt >= before ? Number(entry.value) : 0;
    const next = (Number.isFinite(current) ? current : 0) + 1;
    this.store.set(key, {
      value: String(next),
      expiresAt: before + ttlSeconds * 1000,
    });
    return next;
  }

  async ready(): Promise<boolean> {
    return true;
  }

  get size(): number {
    return this.store.size;
  }
}

/** Redis-backed cache that degrades to in-memory on failure. */
export class RedisCacheImpl implements RedisCache {
  private readonly memory: MemoryCache;
  private client: RedisLike | null;

  constructor(
    client: RedisLike | null,
    private readonly namespace = 'pezhwan',
  ) {
    this.client = client;
    this.memory = new MemoryCache();
  }

  /**
   * Rebind to a (re)connected client without recreating the wrapper. Used by
   * RedisManager when the connection state changes. Idempotent — pass null to
   * fall back to the in-memory cache.
   */
  setClient(client: RedisLike | null): void {
    this.client = client;
  }

  private key(raw: string) {
    return `${this.namespace}:${raw}`;
  }

  async get(key: string): Promise<string | null> {
    try {
      if (!this.client || this.client.status !== 'ready') {
        return this.memory.get(key);
      }
      const raw = await this.client.get(this.key(key));
      return raw ?? null;
    } catch {
      return this.memory.get(key);
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (!this.client || this.client.status !== 'ready') {
        await this.memory.set(key, value, ttlSeconds);
        return;
      }
      if (ttlSeconds) {
        await this.client.set(this.key(key), value, 'EX', ttlSeconds);
      } else {
        await this.client.set(this.key(key), value);
      }
    } catch {
      await this.memory.set(key, value, ttlSeconds);
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (!this.client || this.client.status !== 'ready') {
        await this.memory.del(key);
        return;
      }
      await this.client.del(this.key(key));
    } catch {
      await this.memory.del(key);
    }
  }

  async incrementAndExpire(
    key: string,
    ttlSeconds: number,
  ): Promise<number | null> {
    try {
      if (
        !this.client ||
        this.client.status !== 'ready' ||
        !this.client.incr ||
        !this.client.expire
      ) {
        return this.memory.incrementAndExpire(key, ttlSeconds);
      }
      // Atomic INCR + one-time EXPIRE on real Redis → no lost updates under
      // concurrency. Falls through to the process-local counter if Redis dies.
      const count = await this.client.incr(this.key(key));
      if (count === 1) {
        await this.client.expire(this.key(key), ttlSeconds);
      }
      return count;
    } catch {
      return this.memory.incrementAndExpire(key, ttlSeconds);
    }
  }

  async ready(): Promise<boolean> {
    return Boolean(this.client && this.client.status === 'ready');
  }
}

export function createRedisCache(
  client: RedisLike | null,
  namespace = 'pezhwan',
): RedisCache {
  return new RedisCacheImpl(client, namespace);
}

/** Options for the low-level ioredis client lifecycle. */
export interface RedisManagerOptions {
  /** Full connect string, e.g. `redis://127.0.0.1:6379/0`. */
  url: string;
  /** Namespace prefix for every key. */
  namespace?: string;
  /** ms to wait for an initial connection before failing (default 3000). */
  connectTimeoutMs?: number;
  /** Upper bound on per-command retries (default 2). */
  maxRetriesPerRequest?: number;
  /**
   * Retry backoff. `null` disables retries. The function receives the current
   * attempt number and must return the delay in ms (or an error to stop).
   * Bounded so we never retry forever (default: cap at 5s per attempt, stop
   * after 10 attempts).
   */
  retryStrategy?: (times: number) => number | null;
}

/**
 * RedisManager — owns the ioredis client lifecycle and exposes a `RedisCache`.
 *
 * Design intent (matches "Redis is an optimiser, never a gate"):
 *  - Lazy connection: nothing is opened until `connect()` is called.
 *  - Bounded retry + connect timeout so a dead Redis can never stall requests
 *    indefinitely.
 *  - `ready()` reflects an actually connected client; every RedisCache call
 *    still degrades to the in-memory fallback on any failure.
 *  - Graceful `disconnect()` for SIGTERM/SIGINT clean shutdown.
 */
export class RedisManager {
  readonly cache: RedisCacheImpl;

  private client: RedisLike | null = null;
  private readonly opts: Required<Omit<RedisManagerOptions, 'url'>>;
  private connected = false;

  constructor(private readonly options: RedisManagerOptions) {
    this.opts = {
      namespace: options.namespace ?? 'pezhwan',
      connectTimeoutMs: options.connectTimeoutMs ?? 3000,
      maxRetriesPerRequest: options.maxRetriesPerRequest ?? 2,
      retryStrategy:
        options.retryStrategy ??
        ((times: number) =>
          times > 10 ? null : Math.min(times * 200, 5000)),
    };
    this.cache = new RedisCacheImpl(null, this.opts.namespace);
  }

  /**
   * The underlying connected client, or null until `connect()` succeeds. Pass
   * directly to `createPezhwan({ redis: manager.client })`.
   */
  get connectedClient(): RedisLike | null {
    return this.connected ? this.client : null;
  }

  /**
   * Establish the Redis connection. Safe to call once; throws only if the
   * retry strategy exhausts (i.e. Redis is genuinely unreachable).
   */
  async connect(): Promise<void> {
    if (this.client || this.connected) {
      return;
    }
    const { Redis } = await import('ioredis');
    const client = new Redis(this.options.url, {
      lazyConnect: true,
      connectTimeout: this.opts.connectTimeoutMs,
      maxRetriesPerRequest: this.opts.maxRetriesPerRequest,
      retryStrategy: this.opts.retryStrategy,
    });
    // Guard against ioredis emitting unhandled 'error' events that would
    // otherwise crash the process on connection loss/refusal. Without a
    // listener, a refused connection surfaces as an unhandled error event.
    client.on('error', () => {
      /* connection-level errors are non-fatal: cache degrades to in-memory */
    });
    // Re-bind the cache to the live client once connected.
    this.cache.setClient(client);
    this.client = client;
    await client.connect();
    this.connected = true;
  }

  /**
   * Non-throwing health check. Used by callers that must not block on Redis.
   */
  async isHealthy(): Promise<boolean> {
    try {
      if (!this.client || this.client.status !== 'ready') {
        return false;
      }
      await this.client.set('__pezhwan_health', '1', 'EX', 5);
      return true;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.connected = false;
      if (this.client?.disconnect) {
        await this.client.disconnect();
      }
    } finally {
      this.client = null;
      this.cache.setClient(null);
    }
  }
}

/** Async factory: build the manager and (optionally) connect lazily. */
export function createRedisManager(options: RedisManagerOptions): RedisManager {
  return new RedisManager(options);
}