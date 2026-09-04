/**
 * PEZHWAN — HIBP (Have I Been Pwned) integration.
 *
 * Implements the k-anonymity range protocol: the client hashes the candidate
 * password with SHA-1, sends only the first 5 hex chars, and the provider
 * returns all matching suffix→count pairs. This way the full hash never leaves
 * the server. Ranges are cached in MongoDB so repeated checks do not hit the
 * HIBP API.
 *
 * The network fetch is injected so tests never touch the network and the
 * API key (for `Range` API use) stays behind the secret provider.
 */

import { createHash } from 'node:crypto';
import { BreachRecordModel } from '../../models/index.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HibpRangeFetcher {
  (prefix: string): Promise<string> | string;
}

export interface HibpConfig {
  /** Inject the range fetch (HIBP `Range/:prefix` endpoint). */
  rangeFetcher: HibpRangeFetcher;
  /** Cache ranges locally (default true). */
  useCache?: boolean;
  /** Cache TTL in ms (default 24h). */
  cacheTtlMs?: number;
}

export interface HibpCheckResult {
  /** True when the password's full hash appears in a breach. */
  breached: boolean;
  /** Breach count from the range for a matching exact hash. */
  count: number;
  /** SHA-1 prefix used (privacy — full hash is never logged). */
  prefix: string;
  cached: boolean;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class HibpService {
  private readonly rangeFetcher: HibpRangeFetcher;
  private readonly useCache: boolean;
  private readonly cacheTtlMs: number;

  constructor(config: HibpConfig) {
    this.rangeFetcher = config.rangeFetcher;
    this.useCache = config.useCache ?? true;
    this.cacheTtlMs = config.cacheTtlMs ?? 24 * 60 * 60_000;
  }

  /**
   * Check whether a password has appeared in a known breach using k-anonymity.
   * Only the SHA-1 prefix (5 hex chars) leaves this process / hits the API.
   */
  async isBreached(password: string): Promise<HibpCheckResult> {
    const fullHash = createHash('sha1').update(password, 'utf-8').digest('hex');
    const prefix = fullHash.slice(0, 5);
    const suffix = fullHash.slice(5).toUpperCase();

    const range = await this.fetchRange(prefix);
    if (!range) {
      return { breached: false, count: 0, prefix, cached: false };
    }

    const match = range.find(([s, count]) => s === suffix);
    if (match) {
      return { breached: true, count: match[1], prefix, cached: true };
    }
    return { breached: false, count: 0, prefix, cached: true };
  }

  // ---------------------------------------------------------------------
  // Range cache
  // ---------------------------------------------------------------------

  private async fetchRange(prefix: string): Promise<Array<[string, number]> | null> {
    // 1. Cache hit (not stale).
    if (this.useCache) {
      const cached = await BreachRecordModel.findOne({ hashPrefix: prefix })
        .lean()
        .catch(() => null);
      if (cached) {
        const fetched = cached.fetchedAt.getTime();
        if (Date.now() - fetched < this.cacheTtlMs) {
          return parseRange(cached.suffixes);
        }
      }
    }

    // 2. Network fetch (HIBP Range API).
    try {
      const body = await this.rangeFetcher(prefix);
      const entries = parseRange(body);

      // 3. Cache result.
      if (this.useCache) {
        await BreachRecordModel.updateOne(
          { hashPrefix: prefix },
          { $set: { suffixes: body, fetchedAt: new Date() } },
          { upsert: true },
        ).catch(() => {
          /* cache write is best-effort */
        });
      }
      return entries;
    } catch {
      // Network failure — fall back to any stale cached range (better than
      // failing the login pipeline; the cache is a k-anonymity snapshot).
      if (this.useCache) {
        const stale = await BreachRecordModel.findOne({ hashPrefix: prefix })
          .lean()
          .catch(() => null);
        if (stale) {
          return parseRange(stale.suffixes);
        }
      }
      return null;
    }
  }
}

/** Parse HIBP range body `SUFFIX:count\r\n...` into [suffix, count][] pairs. */
export function parseRange(body: string): Array<[string, number]> {
  if (!body) return [];
  return body
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [suffixRaw, count] = line.split(':');
      const suffix = suffixRaw?.toUpperCase() ?? '';
      return [suffix, Number(count) || 0] as [string, number];
    });
}

/** Default fetcher for the real HIBP API (ASPNET core header recommended). */
export function createHibpRangeFetcher(options: {
  baseUrl?: string;
  apiKey?: string;
  userAgent?: string;
  timeoutMs?: number;
}): HibpRangeFetcher {
  const { baseUrl = 'https://api.pwnedpasswords.com', apiKey, userAgent = 'pezhwan', timeoutMs = 8000 } = options;
  return async (prefix: string): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/range/${prefix}`, {
        headers: {
          'User-Agent': userAgent,
          ...(apiKey ? { 'hibp-api-key': apiKey } : {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HIBP range request failed ${res.status}`);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  };
}