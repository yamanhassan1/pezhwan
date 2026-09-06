/**
 * PEZHWAN — multi-region active-active routing and event fan-out.
 *
 * Coordinates an identity deployment spread across multiple regions:
 *   - Geo-aware request routing (nearest region by coordinates or hint)
 *   - Latency-aware best-region selection (probe-driven, briefly cached)
 *   - Region context access (MongoDB/Redis connection targets, health)
 *   - Global event broadcast (session revocation, password/MFA changes,
 *     account locks) with idempotent cross-region delivery
 *
 * Design principles:
 *   - Regions are configuration, never hard-coded.
 *   - Routing is best-effort: when geo/latency data is unavailable the
 *     designated primary region is used instead of failing the request
 *     (routing is an optimiser, never a gate).
 *   - Events travel over an injectable transport (Redis pub/sub, SNS/SQS,
 *     Kafka, ...). The default transport is in-process so single-node
 *     deployments and tests behave identically; multi-region deployments
 *     supply a cross-region transport and get idempotent delivery through
 *     the per-process event-id dedupe window.
 */

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegionGeoPoint {
  /** Latitude in decimal degrees, -90..90. */
  lat: number;
  /** Longitude in decimal degrees, -180..180. */
  long: number;
}

export interface RegionConfig {
  /** Stable region id, e.g. "us-east-1". Must be unique across the deployment. */
  id: string;
  /** Human-readable region name, e.g. "US East (N. Virginia)". */
  name: string;
  /** MongoDB connection URI for the region. */
  mongodbUri: string;
  /** Redis connection URL for the region (cache / pub-sub / rate limits). */
  redisUrl: string;
  /** Designated primary — the default routing target and last-resort fallback. */
  primary: boolean;
  /** Coordinates used for geodesic nearest-region routing (optional). */
  location?: RegionGeoPoint;
  /** Opaque metadata (cloud provider, K8s context, network reachability keys...). */
  tags?: Record<string, string>;
}

export interface UserLocation {
  /** Explicit region hint (highest priority when it names a configured region). */
  regionId?: string;
  /** Latitude/longitude for geodesic routing. */
  lat?: number;
  /** Latitude/longitude for geodesic routing. */
  long?: number;
  /** ISO country code (resolvable through `geoResolver`). */
  countryCode?: string;
  /** Client IP (resolvable through `geoResolver` if present). */
  ip?: string;
}

export interface RegionEvent<T = Record<string, unknown>> {
  /** Idempotency key. Generated when absent; re-delivery within the window is dropped. */
  id?: string;
  /**
   * Event type, e.g. "SESSION_REVOKED" | "PASSWORD_CHANGED" | "MFA_CHANGED" |
   * "ACCOUNT_LOCKED" | "SECURITY_LEVEL_CHANGED".
   */
  type: string;
  /** Region that originated the event (stamped by `broadcastEvent` when absent). */
  sourceRegion?: string;
  /** Epoch milliseconds. Stamped when absent. */
  issuedAt?: number;
  /** Dedupe window in seconds for consumers (defaults to the manager window). */
  ttlSeconds?: number;
  userId?: string;
  sessionId?: string;
  /** Caller-specific payload. */
  data?: T;
}

export type RegionEventHandler = (event: RegionEvent) => void | Promise<void>;

export interface RegionProbeResult {
  /** Whether the region's MongoDB was reachable at probe time. */
  mongo: boolean;
  /** Whether the region's Redis was reachable at probe time. */
  redis: boolean;
  /** Round-trip latency measured by the probe, in milliseconds. */
  rttMs?: number;
  /** false when no real probe is wired (health is reported as "unknown"). */
  probed: boolean;
}

export type RegionProbe = (region: RegionConfig) => Promise<RegionProbeResult>;

export interface RegionHealth {
  regionId: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  mongo: boolean;
  redis: boolean;
  rttMs?: number;
  probed: boolean;
  checkedAt: Date;
}

/** Cross-region delivery channel. Notify returns once accepted for delivery. */
export interface RegionEventTransport {
  readonly name: string;
  publish(event: RegionEvent): Promise<void>;
  /** Registers a receiver and returns an unsubscribe function. */
  subscribe(handler: RegionEventHandler): Promise<() => Promise<void>>;
  disconnect?(): Promise<unknown>;
}

export interface RegionContext {
  config: RegionConfig;
  isPrimary: boolean;
  /** Fresh health assessment for this region (probe result, cached briefly). */
  health(): Promise<RegionHealth>;
}

export interface RegionManagerOptions {
  regions: RegionConfig[];
  /** Optional connectivity probe per region (used for health + latency routing). */
  probe?: RegionProbe;
  /** Optional cross-region event transport. Defaults to an in-process bus. */
  eventTransport?: RegionEventTransport;
  /** Optional resolver mapping a location hint (country/IP) to a region id. */
  geoResolver?: (location: UserLocation) => string | undefined;
  /** Dedupe window for broadcast events, in milliseconds (default 60_000). */
  dedupeWindowMs?: number;
  /** Life of cached probe results used for best-region selection (default 15_000). */
  probeCacheTtlMs?: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/**
 * Probe that reports "unprobed" — used when a deployment has not wired a real
 * connectivity probe, so health is honest rather than guessed.
 */
export const unconfiguredProbe: RegionProbe = async () => ({
  mongo: false,
  redis: false,
  rttMs: undefined,
  probed: false,
});

/**
 * In-process event bus. The default transport: identical observable behaviour
 * on a single node or across processes sharing the same manager instance.
 */
export class LocalRegionEventTransport implements RegionEventTransport {
  readonly name = 'local';
  private readonly subscribers = new Set<RegionEventHandler>();

  async publish(event: RegionEvent): Promise<void> {
    await Promise.all(
      [...this.subscribers].map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          console.error(`[region-manager] ${this.name} handler failed for "${event.type}"`, error);
        }
      }),
    );
  }

  async subscribe(handler: RegionEventHandler): Promise<() => Promise<void>> {
    this.subscribers.add(handler);
    return async () => {
      this.subscribers.delete(handler);
    };
  }
}

// ---------------------------------------------------------------------------
// Region manager
// ---------------------------------------------------------------------------

export class RegionManager {
  private readonly regionsById: Map<string, RegionConfig>;
  private readonly probe: RegionProbe;
  private readonly transport: RegionEventTransport;
  private readonly geoResolver?: (location: UserLocation) => string | undefined;
  private readonly dedupeWindowMs: number;
  private readonly probeCacheTtlMs: number;
  private readonly seenEvents = new Map<string, number>();
  private readonly handlers = new Set<RegionEventHandler>();
  private readonly probeCache = new Map<string, { at: number; health: RegionHealth }>();
  private unsubscribeTransport: (() => Promise<void>) | null = null;

  constructor(options: RegionManagerOptions) {
    if (!Array.isArray(options.regions) || options.regions.length === 0) {
      throw new Error('RegionManager requires at least one region');
    }
    const ids = new Set<string>();
    for (const region of options.regions) {
      if (!region.id) {
        throw new Error('RegionManager requires a unique id per region');
      }
      if (ids.has(region.id)) {
        throw new Error(`RegionManager: duplicate region id "${region.id}"`);
      }
      ids.add(region.id);
    }

    this.regionsById = new Map(options.regions.map((r) => [r.id, r]));
    if (![...this.regionsById.values()].some((r) => r.primary)) {
      // No designated primary: promote the first region so routing still works.
      this.regionsById.values().next().value!.primary = true;
    }

    this.probe = options.probe ?? unconfiguredProbe;
    this.transport = options.eventTransport ?? new LocalRegionEventTransport();
    this.geoResolver = options.geoResolver;
    this.dedupeWindowMs = options.dedupeWindowMs ?? 60_000;
    this.probeCacheTtlMs = options.probeCacheTtlMs ?? 15_000;
  }

  /** Begin receiving events from the transport. Idempotent. */
  async start(): Promise<void> {
    if (this.unsubscribeTransport) {
      return;
    }
    this.unsubscribeTransport = await this.transport.subscribe((event) =>
      this.processIncoming(event),
    );
  }

  /** Stop receiving events; release the transport subscription. Idempotent. */
  async stop(): Promise<void> {
    const unsubscribe = this.unsubscribeTransport;
    this.unsubscribeTransport = null;
    if (unsubscribe) {
      await unsubscribe();
    }
  }

  /**
   * Release transport resources (call on shutdown). Subsequent use of the
   * manager requires `start()` again.
   */
  async disconnect(): Promise<void> {
    await this.stop();
    await this.transport.disconnect?.();
  }

  // -------------------------------------------------------------------------
  // Registry access
  // -------------------------------------------------------------------------

  getRegions(): RegionConfig[] {
    return [...this.regionsById.values()];
  }

  getRegion(id: string): RegionConfig | undefined {
    return this.regionsById.get(id);
  }

  hasRegion(id: string): boolean {
    return this.regionsById.has(id);
  }

  getPrimary(): RegionConfig {
    const primary = [...this.regionsById.values()].find((region) => region.primary);
    const fallback = this.regionsById.values().next().value;
    return primary ?? fallback!;
  }

  getPrimaryId(): string {
    return this.getPrimary().id;
  }

  /**
   * Promote a region to primary (write-default target). Others are demoted.
   */
  async switchPrimary(regionId: string): Promise<RegionConfig> {
    const next = this.regionsById.get(regionId);
    if (!next) {
      throw new Error(`RegionManager: unknown region "${regionId}"`);
    }
    await this.broadcastEvent({
      type: 'PRIMARY_CHANGED',
      sourceRegion: this.getPrimaryId(),
      data: { regionId },
    });
    for (const region of this.regionsById.values()) {
      region.primary = region.id === regionId;
    }
    return next;
  }

  // -------------------------------------------------------------------------
  // Routing
  // -------------------------------------------------------------------------

  /**
   * Nearest region for a caller location, in priority order:
   *   1. explicit location.regionId (when configured)
   *   2. geoResolver(location) → region id (country/IP mapping)
   *   3. geodesic nearest by coordinates
   *   4. the designated primary
   * Never throws for unknown locations/resolvers — routing degrades to primary.
   */
  getNearestRegion(location: UserLocation = {}): RegionConfig {
    if (location.regionId) {
      const explicit = this.regionsById.get(location.regionId);
      if (explicit) {
        return explicit;
      }
    }

    if (this.geoResolver) {
      const resolved = this.geoResolver(location);
      if (resolved) {
        const byResolver = this.regionsById.get(resolved);
        if (byResolver) {
          return byResolver;
        }
      }
    }

    if (
      typeof location.lat === 'number' &&
      typeof location.long === 'number' &&
      isFinite(location.lat) &&
      isFinite(location.long)
    ) {
      const target = { lat: location.lat, long: location.long };
      let nearest: RegionConfig | null = null;
      let nearestKm = Infinity;
      for (const region of this.regionsById.values()) {
        if (!region.location) {
          continue;
        }
        const distance = haversineKm(target, region.location);
        if (distance < nearestKm) {
          nearestKm = distance;
          nearest = region;
        }
      }
      if (nearest) {
        return nearest;
      }
    }

    return this.getPrimary();
  }

  /**
   * Best region by measured round-trip latency (probe results, cached for
   * `probeCacheTtlMs`). Falls back to the nearest-region/primary path when no
   * region reports a probe RTT.
   */
  async pickBestRegion(): Promise<RegionConfig> {
    const health = await this.health();
    let best: RegionConfig | null = null;
    let bestRtt = Infinity;
    for (const entry of health) {
      if (entry.status === 'down' || typeof entry.rttMs !== 'number') {
        continue;
      }
      if (entry.rttMs < bestRtt) {
        bestRtt = entry.rttMs;
        best = this.regionsById.get(entry.regionId) ?? null;
      }
    }
    return best ?? this.getNearestRegion();
  }

  // -------------------------------------------------------------------------
  // Region context
  // -------------------------------------------------------------------------

  /** Connection context for a region: config + live health. Never connects. */
  getClient(regionId: string): RegionContext {
    const config = this.regionsById.get(regionId);
    if (!config) {
      throw new Error(`RegionManager: unknown region "${regionId}"`);
    }
    const isPrimary = config.primary;
    return {
      config,
      isPrimary,
      health: () => this.probeRegion(regionId),
    };
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  /** Aggregate health for every configured region. */
  async health(): Promise<RegionHealth[]> {
    await this.pruneProbeCache();
    const entries: RegionHealth[] = [];
    for (const region of this.regionsById.values()) {
      entries.push(await this.probeRegion(region.id));
    }
    return entries;
  }

  // -------------------------------------------------------------------------
  // Event broadcast (global invalidation)
  // -------------------------------------------------------------------------

  /**
   * Publish an invalidation event to every region. The event is stamped with
   * source region, timestamp, and an idempotency key, then handed to the
   * transport. Consumers in other regions receive it through their own
   * manager and drop duplicate deliveries within the dedupe window.
   */
  async broadcastEvent<T = Record<string, unknown>>(
    input: Omit<RegionEvent<T>, 'sourceRegion' | 'issuedAt' | 'id'> &
      Partial<Pick<RegionEvent<T>, 'sourceRegion' | 'issuedAt' | 'id'>>,
  ): Promise<RegionEvent<T>> {
    const event: RegionEvent<T> = {
      id: input.id ?? randomUUID(),
      issuedAt: input.issuedAt ?? Date.now(),
      sourceRegion: input.sourceRegion ?? this.getPrimaryId(),
      ttlSeconds: input.ttlSeconds,
      type: input.type,
      userId: input.userId,
      sessionId: input.sessionId,
      data: input.data,
    };
    await this.transport.publish(event as RegionEvent);
    return event;
  }

  /**
   * Convenience: revoke a session in every region. `broadcastEvent` with the
   * canonical SESSION_REVOKED type.
   */
  async revokeSession(regionId: string, sessionId: string, userId?: string): Promise<RegionEvent> {
    return this.broadcastEvent({
      type: 'SESSION_REVOKED',
      sourceRegion: regionId,
      sessionId,
      userId,
    });
  }

  /**
   * Register a handler for every broadcast event delivered to this manager.
   * Returns an unsubscribe function.
   */
  async subscribe(handler: RegionEventHandler): Promise<() => Promise<void>> {
    this.handlers.add(handler);
    return async () => {
      this.handlers.delete(handler);
    };
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async processIncoming(event: RegionEvent): Promise<void> {
    if (!this.isNewEvent(event)) {
      return; // already delivered within the dedupe window
    }
    for (const handler of this.handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[region-manager] consumer handler failed for "${event.type}"`, error);
      }
    }
  }

  /** Returns true when this event id has not been processed within the window. */
  private isNewEvent(event: RegionEvent): boolean {
    const id = event.id ?? randomUUID();
    const now = Date.now();
    this.pruneSeen(now);
    const ttlMs =
      (event.ttlSeconds !== undefined ? event.ttlSeconds * 1_000 : this.dedupeWindowMs) ??
      this.dedupeWindowMs;
    const expiresAt = Math.max(now, (event.issuedAt ?? now) + ttlMs);
    if (this.seenEvents.has(id) && this.seenEvents.get(id)! >= now) {
      return false;
    }
    this.seenEvents.set(id, expiresAt);
    return true;
  }

  private pruneSeen(now = Date.now()): void {
    for (const [id, expiresAt] of this.seenEvents) {
      if (expiresAt < now) {
        this.seenEvents.delete(id);
      }
    }
  }

  private async probeRegion(regionId: string): Promise<RegionHealth> {
    const config = this.regionsById.get(regionId);
    if (!config) {
      throw new Error(`RegionManager: unknown region "${regionId}"`);
    }
    const cached = this.probeCache.get(regionId);
    if (cached && cached.at + this.probeCacheTtlMs >= Date.now()) {
      return cached.health;
    }
    let result: RegionProbeResult;
    try {
      result = await this.probe(config);
    } catch (error) {
      result = {
        mongo: false,
        redis: false,
        probed: true,
      };
      console.error(
        `[region-manager] probe failed for "${regionId}"`,
        error instanceof Error ? error.message : error,
      );
    }
    const health: RegionHealth = {
      regionId,
      name: config.name,
      status: statusFromProbe(result),
      mongo: result.mongo,
      redis: result.redis,
      rttMs: result.rttMs,
      probed: result.probed,
      checkedAt: new Date(),
    };
    this.probeCache.set(regionId, { at: Date.now(), health });
    return health;
  }

  private async pruneProbeCache(now = Date.now()): Promise<void> {
    for (const [regionId, entry] of this.probeCache) {
      if (entry.at + this.probeCacheTtlMs < now) {
        this.probeCache.delete(regionId);
      }
    }
  }
}

function statusFromProbe(result: RegionProbeResult): RegionHealth['status'] {
  if (!result.probed) {
    return 'unknown';
  }
  if (result.mongo && result.redis) {
    return 'healthy';
  }
  return result.mongo || result.redis ? 'degraded' : 'down';
}

/** Great-circle distance between two coordinates, in kilometres. */
function haversineKm(a: RegionGeoPoint, b: RegionGeoPoint): number {
  const earthRadiusKm = 6_371;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLong = toRad(b.long - a.long);
  const sinLat = Math.sin(dLat / 2);
  const sinLong = Math.sin(dLong / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLong * sinLong;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createRegionManager(options: RegionManagerOptions): RegionManager {
  const manager = new RegionManager(options);
  void manager.start();
  return manager;
}
