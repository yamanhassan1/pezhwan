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
import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';
import { SessionError } from '@pezhwan/shared';
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
    ctx: {
      ip?: string;
      userAgent?: string;
      deviceLabel?: string;
      tenantId?: string;
      applicationId?: string;
    },
  ): Promise<CreatedSession> {
    const hash = this.tokens.hashRefreshToken(presentedRefreshToken);

    // Atomic single-use claim: transition the active parent to the transient
    // `rotating` state. Only one concurrent rotation can do this for a given
    // hash; every other caller sees a non-active session below.
    const session = await SessionModel.findOneAndUpdate(
      {
        currentRefreshTokenHash: hash,
        status: 'active',
        ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
        ...(ctx.applicationId ? { applicationId: ctx.applicationId } : {}),
      },
      { $set: { status: 'rotating', revokedAt: new Date() } },
      { new: true },
    );

    if (!session) {
      // Either the token is unknown, or it was already consumed by a
      // concurrent rotation (status is no longer 'active').
      const existing = await SessionModel.findOne({
        currentRefreshTokenHash: hash,
        ...(ctx.tenantId ? { tenantId: ctx.tenantId } : {}),
        ...(ctx.applicationId ? { applicationId: ctx.applicationId } : {}),
      });
      if (!existing) {
        throw new SessionError('Refresh token is not recognized', 'REFRESH_TOKEN_UNKNOWN');
      }
      // A token in a settled non-active state presented again is the signature
      // of a stolen or replayed token — revoke the whole family. However, the
      // transient `rotating` state means a genuine rotation is still in-flight
      // (with transactions the commit takes longer). Revoking the family at
      // this point would kill the genuine winner, so a duplicate presented
      // while the parent is in `rotating` simply fails closed without revoking
      // the family — the loser gets no token and the winner completes safely.
      const isSettled = ['replaced', 'revoked', 'expired'].includes(existing.status);
      if (isSettled) {
        await this.revokeFamily(existing.familyId);
      }
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

    const childData = {
      userId: session.userId,
      tenantId: session.tenantId,
      applicationId: session.applicationId,
      status: 'active' as const,
      familyId,
      currentRefreshTokenHash: newPair.refreshTokenHash,
      device: {
        ip: ctx.ip ?? session.device?.ip ?? '',
        userAgent: ctx.userAgent ?? session.device?.userAgent ?? '',
        deviceLabel: ctx.deviceLabel ?? session.device?.deviceLabel ?? 'Unknown device',
      },
      lastActiveAt: new Date(),
      expiresAt,
    };

    const parentId = session._id;

    // The child creation and parent finalization are wrapped in a MongoDB
    // transaction so there is NO window in which a child exists but the parent
    // is not yet marked `replaced`. If the process crashes (or the transaction
    // rolls back) between these steps, neither effect persists — the rotation
    // is atomic. The parent slot was already atomically claimed `active →
    // rotating` above, which is what makes concurrent presentations serialize
    // to exactly one winner.
    //
    // Replica-set requirement: multi-document transactions require MongoDB to
    // run as a replica set (standalone servers do not support them). When
    // transactions are unavailable we degrade to the previous do-two-steps
    // behaviour (still protected by the atomic claim + replay re-check) so
    // development and test environments without a replica set keep working.
    const txBody = async (
      txSession: ClientSession | null,
    ): Promise<{ sessionId: string; expiresAt: Date }> => {
      const [newSession] = await SessionModel.create([childData], {
        ...(txSession ? { session: txSession } : {}),
      });
      const childId = newSession?._id;

      // A concurrent replay may have revoked the family while the child was
      // being created. Never leave that child active after such a revocation —
      // abort the transaction so neither effect persists.
      const parentState = await SessionModel.findById(parentId)
        .select('status')
        .session(txSession ?? null)
        .lean();
      if (!parentState || parentState.status !== 'rotating') {
        throw new SessionError(
          'Refresh token reuse detected — session revoked',
          'REFRESH_TOKEN_REUSE',
        );
      }

      await SessionModel.updateOne(
        { _id: parentId },
        {
          status: 'replaced',
          replacedBySessionId: childId,
          revokedAt: new Date(),
        },
        { ...(txSession ? { session: txSession } : {}) },
      );

      return { sessionId: String(childId), expiresAt };
    };

    const result = await this.withTransaction(
      txBody,
      // Reuse detection throws a SessionError we must NOT retry.
      (err) => err instanceof SessionError,
    );

    if (!result) {
      throw new SessionError('Refresh rotation could not be committed', 'REFRESH_ROTATION_FAILED');
    }

    await this.cacheLiveness(String(parentId));
    await this.cacheLiveness(result.sessionId);

    return {
      sessionId: result.sessionId,
      userId: String(session.userId),
      tenantId: String(session.tenantId),
      applicationId: String(session.applicationId),
      familyId,
      refreshToken: newPair.refreshToken,
      refreshTokenHash: newPair.refreshTokenHash,
      expiresAt: result.expiresAt,
    };
  }

  /**
   * Run `work` inside a MongoDB transaction when the connected server supports
   * them (replica set / sharded cluster). Falls back to running `work` without
   * an explicit session on standalone servers and other unsupported topologies.
   *
   * `isNonRetryable` lets callers mark domain errors (e.g. reuse detection) that
   * must not be re-run, avoiding accidentally re-executing a security decision
   * after a transient write conflict. Transient errors (write conflicts,
   * deadlocks, network blips, snapshot/vote failures) are retried a bounded
   * number of times with backoff.
   */
  private async withTransaction<T>(
    work: (session: ClientSession | null) => Promise<T>,
    isNonRetryable?: (err: unknown) => boolean,
  ): Promise<T> {
    const conn = mongoose.connection;
    const MAX_ATTEMPTS = 3;
    const baseDelayMs = 25;

    // Standalone MongoDB (the dev/test topology) cannot run multi-document
    // transactions. Detect this early and fall back to a no-session run so the
    // SDK degrades gracefully instead of failing.
    if (!transactionsSupported(conn)) {
      return work(null);
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let session: ClientSession | null = null;
      try {
        session = await conn.startSession();
        let out: T | undefined;
        await session.withTransaction(async (txSession) => {
          out = await work(txSession);
          return txSession;
        });
        return out as T;
      } catch (err) {
        if (isNonRetryable?.(err)) {
          throw err;
        }
        if (attempt >= MAX_ATTEMPTS || !isTransientTransactionError(err)) {
          // A non-transient failure (or out of retries): if the topology cannot
          // support transactions after all, degrade to a no-session run rather
          // than surfacing a hard error in a dev/test topology.
          if (attempt >= MAX_ATTEMPTS && !isTransientTransactionError(err)) {
            return work(null);
          }
          throw err;
        }
      } finally {
        session?.endSession().catch(() => {
          /* best effort */
        });
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
    // Unreachable: the loop either returns, throws, or falls back above.
    return work(null);
  }

  /** Enforce a cap on concurrently active sessions per user+application. */
  private async enforceSessionLimit(userId: string, applicationId: string): Promise<void> {
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
    await SessionModel.updateMany({ familyId }, { status: 'revoked', revokedAt: new Date() });
    for (const s of sessions) {
      await this.cache.del(this.cacheKey(String(s._id)));
    }
  }

  /** Revoke a single session. */
  async revoke(sessionId: string): Promise<void> {
    await SessionModel.updateOne({ _id: sessionId }, { status: 'revoked', revokedAt: new Date() });
    await this.cache.del(this.cacheKey(sessionId));
  }

  /** Revoke ALL sessions for a user (optionally scoped to an application). */
  async revokeAll(userId: string, applicationId?: string, tenantId?: string): Promise<void> {
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
  async listActive(userId: string, applicationId?: string): Promise<SessionDoc[]> {
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
    const doc = await SessionModel.findById(sessionId).select('status expiresAt').lean();
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
    await SessionModel.updateOne({ _id: sessionId }, { lastActiveAt: new Date() });
    await this.cacheLiveness(sessionId);
  }
}

/**
 * Best-effort detection of whether the connected MongoDB topology supports
 * multi-document transactions. Standalone mongod instances do not; replica
 * sets and sharded clusters do.
 */
function transactionsSupported(conn: mongoose.Connection): boolean {
  try {
    const client = conn.getClient() as unknown as {
      topology?: { description?: { type?: string } };
    };
    const type = client.topology?.description?.type ?? '';
    // ReplicaSetWithPrimary / ReplicaSetNoPrimary / Sharded describe
    // transaction-capable topologies. Standalone and single (direct
    // connection to one mongod without replica-set options) do not.
    return /replicaset|sharded/i.test(type);
  } catch {
    return false;
  }
}

/**
 * MongoDB error codes that are safe to retry on a write conflict / transient
 * transaction failure. See the driver's `MongoServerError` code reference.
 */
function isTransientTransactionError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: number }).code;
    // 112 WriteConflict · 245 Deadlock · 262 snapshot too old ·
    // 24 LockTimeout · 103/116/133 network-ish · 251 NoSuchTransaction
    switch (code) {
      case 112:
      case 245:
      case 262:
      case 249:
      case 251:
      case 24:
      case 103:
      case 116:
      case 133:
      case 13:
        return true;
      default:
        return false;
    }
  }
  // Transport/connection-level errors (e.g. "session was already ended",
  // topology closed during retry) are transient by default.
  if (err instanceof Error && /session|topology|close|network|socket/i.test(err.message)) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
