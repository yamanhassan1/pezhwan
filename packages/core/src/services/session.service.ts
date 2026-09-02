/**
 * PEZHWAN — session service.
 *
 * Implements the rotating refresh-token protocol:
 *   - create(): new session + fresh refresh-token family
 *   - rotate(): issue a new refresh-token pair, revoke the parent session,
 *     mark it as "replaced" with replacedBySessionId.
 *   - Reuse detection: if a session that was already replaced is presented as
 *     the "parent" again, the ENTIRE family is revoked (theft suspected).
 *
 * Only SHA-256 hashes of refresh tokens are stored. Redis caches active
 * session liveness but MongoDB is the source of truth.
 */

import { randomUUID } from 'node:crypto';
import { SessionError } from '@pezhwan/shared';
import type { AuthMethod } from '@pezhwan/shared';
import { SessionModel, type SessionDoc } from '../models/index.ts';
import { TokenService } from './token.service.ts';
import type { RedisCache } from './redisCache.ts';

export interface SessionContext {
  userId: string;
  tenantId: string;
  applicationId: string;
  ip?: string;
  userAgent?: string;
  deviceLabel?: string;
}

export interface CreatedSession {
  sessionId: string;
  userId: string;
  tenantId: string;
  applicationId: string;
  familyId: string;
  refreshToken: string;
  refreshTokenHash: string;
  expiresAt: Date;
}

const SESSION_CACHE_TTL_SECONDS = 30;

export class SessionService {
  private readonly tokens: TokenService;
  private readonly cache: RedisCache;
  private readonly refreshTokenTtlMs: number;
  private readonly maxActiveSessions: number;

  constructor(options: {
    tokens: TokenService;
    cache: RedisCache;
    refreshTokenTtlMs: number;
    maxActiveSessions: number;
  }) {
    this.tokens = options.tokens;
    this.cache = options.cache;
    this.refreshTokenTtlMs = options.refreshTokenTtlMs;
    this.maxActiveSessions = options.maxActiveSessions;
  }

  private cacheKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private async cacheLiveness(sessionId: string): Promise<void> {
    await this.cache.set(this.cacheKey(sessionId), '1', SESSION_CACHE_TTL_SECONDS);
  }

  /** Create a brand-new session + refresh-token family. */
  async create(ctx: SessionContext): Promise<CreatedSession> {
    await this.enforceSessionLimit(ctx.userId, ctx.applicationId);

    const familyId = randomUUID().toLowerCase();
    const pair = this.tokens.createRefreshToken();
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlMs);

    const doc = await SessionModel.create({
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      applicationId: ctx.applicationId,
      status: 'active',
      familyId,
      currentRefreshTokenHash: pair.refreshTokenHash,
      device: {
        ip: ctx.ip ?? '',
        userAgent: ctx.userAgent ?? '',
        deviceLabel: ctx.deviceLabel ?? 'Unknown device',
      },
      lastActiveAt: new Date(),
      expiresAt,
    });

    await this.cacheLiveness(String(doc._id));

    return {
      sessionId: String(doc._id),
      userId: String(doc.userId),
      tenantId: String(doc.tenantId),
      applicationId: String(doc.applicationId),
      familyId,
      refreshToken: pair.refreshToken,
      refreshTokenHash: pair.refreshTokenHash,
      expiresAt,
    };
  }

  /**
   * Rotate a refresh token. One-time use: the presented token's session is
   * marked `replaced` and a new session is spun up in the same family.
   *
   * ATOMICITY: reuse detection must hold under concurrency. Two simultaneous
   * refreshes presenting the SAME token would otherwise both read the parent as
   * `active` and both mint a new pair. We therefore CLAIM the parent atomically
   * with findOneAndUpdate (`active` → `rotating`); only one concurrent caller
   * wins, so the same token can never yield two live refresh pairs.
   *
   * If the session was already consumed (reuse of an already-rotated token),
   * the whole family is revoked and we throw a security-critical SessionError.
   */
  async refresh(
    presentedRefreshToken: string,
    ctx: { ip?: string; userAgent?: string; deviceLabel?: string },
  ): Promise<CreatedSession> {
    const hash = this.tokens.hashRefreshToken(presentedRefreshToken);

    // Atomic single-use claim: transition the active parent to the transient
    // `rotating` state. Only one concurrent rotation can do this for a given
    // hash; every other caller sees a non-active session below.
    const session = await SessionModel.findOneAndUpdate(
      { currentRefreshTokenHash: hash, status: 'active' },
      { $set: { status: 'rotating', revokedAt: new Date() } },
      { new: true },
    );

    if (!session) {
      // Either the token is unknown, or it was already consumed by a
      // concurrent rotation (status is no longer 'active').
      const existing = await SessionModel.findOne({ currentRefreshTokenHash: hash });
      if (!existing) {
        throw new SessionError(
          'Refresh token is not recognized',
          'REFRESH_TOKEN_UNKNOWN',
        );
      }
      // A token in any non-active state presented again is the signature of a
      // stolen or replayed token — including a `rotating` parent (a concurrent
      // duplicate presentation during an in-flight rotation): revoke the whole
      // family. Fail closed.
      await this.revokeFamily(existing.familyId);
      throw new SessionError(
        'Refresh token reuse detected — session revoked',
        'REFRESH_TOKEN_REUSE',
      );
    }

    // We hold the atomic claim. Create the child session, then finalise the
    // parent as replaced.
    const familyId = session.familyId;
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlMs);
    const newPair = this.tokens.createRefreshToken();
    const newSession = await SessionModel.create({
      userId: session.userId,
      tenantId: session.tenantId,
      applicationId: session.applicationId,
      status: 'active',
      familyId,
      currentRefreshTokenHash: newPair.refreshTokenHash,
      device: {
        ip: ctx.ip ?? session.device?.ip ?? '',
        userAgent: ctx.userAgent ?? session.device?.userAgent ?? '',
        deviceLabel: ctx.deviceLabel ?? session.device?.deviceLabel ?? 'Unknown device',
      },
      lastActiveAt: new Date(),
      expiresAt,
    });

    // A concurrent replay may have revoked the family while the child was
    // being created. Never leave that child active after such a revocation.
    const parentState = await SessionModel.findById(session._id)
      .select('status')
      .lean();
    if (!parentState || parentState.status !== 'rotating') {
      await SessionModel.updateOne(
        { _id: newSession._id },
        { status: 'revoked', revokedAt: new Date() },
      );
      throw new SessionError(
        'Refresh token reuse detected — session revoked',
        'REFRESH_TOKEN_REUSE',
      );
    }

    await SessionModel.updateOne(
      { _id: session._id },
      {
        status: 'replaced',
        replacedBySessionId: newSession._id,
        revokedAt: new Date(),
      },
    );

    await this.cacheLiveness(String(session._id));
    await this.cacheLiveness(String(newSession._id));

    return {
      sessionId: String(newSession._id),
      userId: String(newSession.userId),
      tenantId: String(newSession.tenantId),
      applicationId: String(newSession.applicationId),
      familyId,
      refreshToken: newPair.refreshToken,
      refreshTokenHash: newPair.refreshTokenHash,
      expiresAt,
    };
  }

  /** Enforce a cap on concurrently active sessions per user+application. */
  private async enforceSessionLimit(
    userId: string,
    applicationId: string,
  ): Promise<void> {
    const count = await SessionModel.countDocuments({
      userId,
      applicationId,
      status: 'active',
    });
    if (count >= this.maxActiveSessions) {
      // Revoke the least-recently-active session to keep the cap.
      const oldest = await SessionModel.findOne({
        userId,
        applicationId,
        status: 'active',
      }).sort({ lastActiveAt: 1 });
      if (oldest) {
        await this.revoke(String(oldest._id));
      }
    }
  }

  /** Revoke the entire refresh-token family (reuse/theft or mass logout). */
  async revokeFamily(familyId: string): Promise<void> {
    const sessions = await SessionModel.find({ familyId });
    await SessionModel.updateMany(
      { familyId },
      { status: 'revoked', revokedAt: new Date() },
    );
    for (const s of sessions) {
      await this.cache.del(this.cacheKey(String(s._id)));
    }
  }

  /** Revoke a single session. */
  async revoke(sessionId: string): Promise<void> {
    await SessionModel.updateOne(
      { _id: sessionId },
      { status: 'revoked', revokedAt: new Date() },
    );
    await this.cache.del(this.cacheKey(sessionId));
  }

  /** Revoke ALL sessions for a user (optionally scoped to an application). */
  async revokeAll(
    userId: string,
    applicationId?: string,
    tenantId?: string,
  ): Promise<void> {
    const filter: Record<string, unknown> = { userId, status: 'active' };
    if (applicationId) {
      filter.applicationId = applicationId;
    }
    if (tenantId) {
      filter.tenantId = tenantId;
    }
    const docs = await SessionModel.find(filter);
    await SessionModel.updateMany(filter, {
      status: 'revoked',
      revokedAt: new Date(),
    });
    for (const d of docs) {
      await this.cache.del(this.cacheKey(String(d._id)));
    }
  }

  /** List active sessions for a user (session-management UI). */
  async listActive(
    userId: string,
    applicationId?: string,
  ): Promise<SessionDoc[]> {
    const filter: Record<string, unknown> = { userId, status: 'active' };
    if (applicationId) {
      filter.applicationId = applicationId;
    }
    return SessionModel.find(filter).sort({ lastActiveAt: -1 }).lean();
  }

  /** Cheap liveness check for the auth pipeline (Redis-cached). */
  async isSessionActive(sessionId: string): Promise<boolean> {
    const cached = await this.cache.get(this.cacheKey(sessionId));
    if (cached === '1') {
      return true;
    }
    const doc = await SessionModel.findById(sessionId)
      .select('status expiresAt')
      .lean();
    if (!doc) {
      return false;
    }
    if (doc.status === 'active' && new Date(doc.expiresAt) > new Date()) {
      await this.cacheLiveness(sessionId);
      return true;
    }
    return false;
  }

  /** Re-issue a session's liveness marker (used after any successful action). */
  async touch(sessionId: string): Promise<void> {
    await SessionModel.updateOne(
      { _id: sessionId },
      { lastActiveAt: new Date() },
    );
    await this.cacheLiveness(sessionId);
  }
}