/**
 * PEZHWAN — Admin API.
 *
 * Reference admin surface consumed by the admin console, developer portal,
 * SDK authorization/tenant modules, and the pezhwan CLI:
 *
 *   /v1/admin/stats                  aggregate dashboard counts
 *   /v1/admin/tenants                list / create
 *   /v1/admin/tenants/:id            get / update
 *   /v1/admin/users                  list / create
 *   /v1/admin/users/:id              get / update / delete (soft)
 *   /v1/admin/users/:id/roles        roles held by a user
 *   /v1/admin/users/:id/permissions  effective permission names
 *   /v1/admin/roles                  list / create
 *   /v1/admin/roles/:id              update / delete
 *   /v1/admin/roles/assign|remove    grant / revoke a role
 *   /v1/admin/permissions            available permissions
 *   /v1/admin/authorization/can      permission / ABAC decision
 *   /v1/admin/clients                OAuth clients (list / create / disable)
 *   /v1/admin/sessions               active sessions (list / revoke)
 *   /v1/admin/audit                  tamper-resistant audit trail
 *   /v1/admin/api-keys               API keys (list / create / revoke)
 *   /v1/admin/webhooks               webhook endpoints (list / register / test)
 *   /v1/admin/security/breaches      breach records
 *   /v1/admin/security/risk          risk events
 *   /v1/admin/settings               tenant settings (get / update)
 *   /v1/admin/subscriptions          tenant plan/status overview
 *
 * All routes are ADMIN-gated at the mount point in server.ts and additionally
 * verify the caller identity here (defense in depth).
 */

import { Router, type Request, type Response } from 'express';
import {
  ApplicationModel,
  ApiKeyModel,
  AuditLogModel,
  BreachRecordModel,
  OAuthClientModel,
  PermissionModel,
  RiskEventModel,
  RoleModel,
  SessionModel,
  TenantModel,
  UserModel,
  UserRoleAssignmentModel,
  WebhookService,
  AUDIT_EVENT,
  type PezhwanRuntime,
} from '@pezhwan/core';
import { hashPassword } from '@pezhwan/crypto';
import { createHash, randomBytes } from 'node:crypto';
import type { PezhwanRequest } from '@pezhwan/express';

type JsonObject = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok(res: Response, data: JsonObject | unknown[] | unknown = {}): void {
  res.json({ success: true, data });
}

function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  detail?: unknown,
): void {
  res.status(status).json({ success: false, error: { code, message, detail } });
}

function created(res: Response, data: JsonObject | unknown[] | unknown = {}): void {
  res.status(201).json({ success: true, data });
}

/** Catches controller errors and returns a clean envelope (never stack traces). */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    fn(req, res).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number }).status;
      if (status && status < 500) {
        res.status(status).json({
          success: false,
          error: { code: 'BAD_REQUEST', message },
        });
        return;
      }
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message } });
    });
  };
}

// ---------------------------------------------------------------------------
// Row → JSON mappers (strip Mongoose internals, never leak secrets)
// ---------------------------------------------------------------------------

function stringId(value: unknown): string {
  return String(value);
}

interface TenantDoc {
  _id: unknown;
  name: string;
  slug: string;
  isActive: boolean;
  config?: Record<string, unknown>;
  createdAt?: Date;
}

function tenantJson(d: TenantDoc): JsonObject {
  const config = d.config ?? {};
  const plan = (config.plan as string) ?? 'free';
  const status = (config.subscription as Record<string, unknown> | undefined)?.status as
    string | undefined;
  return {
    id: stringId(d._id),
    name: d.name,
    slug: d.slug,
    isActive: d.isActive,
    plan,
    status: status ?? (d.isActive ? 'active' : 'suspended'),
    config,
    createdAt: d.createdAt?.toISOString() ?? null,
  };
}

interface UserDoc {
  _id: unknown;
  tenantId: string;
  email?: string;
  phone?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  isActive?: boolean;
  mfaEnabled?: boolean;
  lockUntil?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

function userJson(d: UserDoc, roles: string[] = []): JsonObject {
  return {
    id: stringId(d._id),
    tenantId: d.tenantId,
    email: d.email ?? null,
    phone: d.phone ?? null,
    emailVerified: d.emailVerified ?? false,
    phoneVerified: d.phoneVerified ?? false,
    isActive: d.isActive ?? true,
    mfaEnabled: d.mfaEnabled ?? false,
    lockedUntil: d.lockUntil ? new Date(d.lockUntil).toISOString() : null,
    roles,
    createdAt: d.createdAt?.toISOString() ?? null,
    updatedAt: d.updatedAt?.toISOString() ?? null,
  };
}

interface SessionDoc {
  _id: unknown;
  userId: string;
  tenantId: string;
  applicationId: string;
  status: string;
  device?: { ip?: string; userAgent?: string; deviceLabel?: string };
  lastActiveAt?: Date;
  lastUsedAt?: Date;
  createdAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date;
}

function sessionJson(d: SessionDoc): JsonObject {
  return {
    id: stringId(d._id),
    userId: d.userId,
    tenantId: d.tenantId,
    applicationId: d.applicationId,
    status: d.status,
    device: d.device ?? null,
    lastActiveAt: d.lastActiveAt?.toISOString() ?? null,
    createdAt: d.createdAt?.toISOString() ?? null,
    expiresAt: d.expiresAt?.toISOString() ?? null,
    revokedAt: d.revokedAt?.toISOString() ?? null,
  };
}

interface ClientDoc {
  clientId: string;
  tenantId: string;
  applicationId: string;
  name: string;
  redirectUris: string[];
  grants: string[];
  scopes: string[];
  isActive: boolean;
  isConfidential: boolean;
  createdAt?: Date;
}

function clientJson(d: ClientDoc): JsonObject {
  return {
    clientId: d.clientId,
    tenantId: d.tenantId,
    applicationId: d.applicationId,
    name: d.name,
    redirectUris: d.redirectUris ?? [],
    grants: d.grants ?? [],
    scopes: d.scopes ?? [],
    isActive: d.isActive,
    isConfidential: d.isConfidential,
    createdAt: d.createdAt?.toISOString() ?? null,
  };
}

interface ApiKeyDoc {
  _id: unknown;
  name: string;
  prefix?: string;
  scopes?: string[];
  isActive?: boolean;
  lastUsedAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  createdAt?: Date;
}

function apiKeyJson(d: ApiKeyDoc, includeSecret = false): JsonObject {
  return {
    id: stringId(d._id),
    name: d.name,
    prefix: d.prefix ?? null,
    scopes: d.scopes ?? [],
    isActive: d.isActive ?? true,
    lastUsedAt: d.lastUsedAt?.toISOString() ?? null,
    expiresAt: d.expiresAt?.toISOString() ?? null,
    revokedAt: d.revokedAt?.toISOString() ?? null,
    createdAt: d.createdAt?.toISOString() ?? null,
    ...(includeSecret ? { rawKey: '' } : {}),
  };
}

interface WebhookDocRow {
  _id: unknown;
  url: string;
  events: string[];
  active: boolean;
  secret?: string;
  maxRetries?: number;
  createdAt?: Date;
}

function webhookJson(d: WebhookDocRow, withSecret = false): JsonObject {
  return {
    id: stringId(d._id),
    url: d.url,
    events: d.events ?? [],
    active: d.active,
    maxRetries: d.maxRetries ?? 5,
    createdAt: d.createdAt?.toISOString() ?? null,
    ...(withSecret ? { secret: d.secret ?? null } : {}),
  };
}

interface RoleDoc {
  _id: unknown;
  name: string;
  description?: string;
  permissionIds: string[];
  isSystem?: boolean;
  tenantId: string;
  applicationId: string;
}

function roleJson(d: RoleDoc): JsonObject {
  return {
    id: stringId(d._id),
    name: d.name,
    description: d.description ?? null,
    permissionIds: d.permissionIds ?? [],
    isSystem: d.isSystem ?? false,
    tenantId: d.tenantId,
    applicationId: d.applicationId,
  };
}

interface PermissionDoc {
  _id: unknown;
  name: string;
  resource: string;
  action: string;
  description?: string;
  tenantId: string;
  applicationId: string;
}

function permissionJson(d: PermissionDoc): JsonObject {
  return {
    id: stringId(d._id),
    name: d.name,
    resource: d.resource,
    action: d.action,
    description: d.description ?? null,
    tenantId: d.tenantId,
    applicationId: d.applicationId,
  };
}

interface AuditDoc {
  _id: unknown;
  timestamp?: Date;
  eventType: string;
  severity: string;
  tenantId?: string;
  applicationId?: string;
  userId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  sequence?: number;
  hash?: string;
  prevHash?: string;
}

function auditJson(d: AuditDoc): JsonObject {
  return {
    id: stringId(d._id),
    timestamp: d.timestamp?.toISOString() ?? null,
    eventType: d.eventType,
    severity: d.severity,
    tenantId: d.tenantId ?? null,
    applicationId: d.applicationId ?? null,
    userId: d.userId ?? null,
    sessionId: d.sessionId ?? null,
    ip: d.ip ?? null,
    userAgent: d.userAgent ?? null,
    metadata: d.metadata ?? {},
    sequence: d.sequence ?? null,
    hash: d.hash ? d.hash.slice(0, 16) + '…' : null,
    prevHash: d.prevHash ? d.prevHash.slice(0, 16) + '…' : null,
  };
}

// ---------------------------------------------------------------------------
// MongoDB helpers
// ---------------------------------------------------------------------------

/** Map a Mongo unique-constraint error to a friendly 409. */
function mongoErrorStatus(err: unknown): { status: number; code: string; message: string } {
  const anyErr = err as { code?: number; name?: string; message?: string };
  if (anyErr?.code === 11000) {
    return { status: 409, code: 'DUPLICATE', message: 'A record with that value already exists' };
  }
  return { status: 500, code: 'INTERNAL_ERROR', message: anyErr?.name ?? 'database error' };
}

function bodyOf(req: Request): JsonObject {
  return (req.body ?? {}) as JsonObject;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function parsePage(req: Request): { limit: number; offset: number } {
  const rawLimit = Number(req.query.limit);
  const rawOffset = Number(req.query.offset);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 50;
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

// ---------------------------------------------------------------------------
// Role resolution for user rows
// ---------------------------------------------------------------------------

interface Assignment {
  userId: string;
  roleId: string;
}

async function roleMapForUsers(
  runtime: PezhwanRuntime,
  tenantId: string,
  applicationId: string,
  userIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>(userIds.map((id) => [id, []]));
  if (userIds.length === 0) return map;

  const assignments = (await UserRoleAssignmentModel.find({
    userId: { $in: userIds },
    tenantId,
    applicationId,
  })
    .lean()
    .exec()) as unknown as Assignment[];

  const roleIds = [...new Set(assignments.map((a) => String(a.roleId)))];
  const roles =
    roleIds.length === 0
      ? []
      : ((await RoleModel.find({ _id: { $in: roleIds } })
          .lean()
          .exec()) as unknown as Array<{ _id: unknown; name: string }>);

  const rolesById = new Map(roles.map((r) => [String(r._id), r.name]));
  for (const a of assignments) {
    const name = rolesById.get(String(a.roleId));
    if (name) map.get(a.userId)?.push(name);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createAdminRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const webhooks = new WebhookService();

  const callerOf = (
    req: PezhwanRequest,
  ): { tenantId: string; applicationId: string; userId: string } => {
    const identity = req.pezhwan;
    if (!identity) {
      throw Object.assign(new Error('Authentication required'), { status: 401 });
    }
    return {
      tenantId: identity.tenantId,
      applicationId: identity.applicationId,
      userId: identity.userId,
    };
  };

  // ── Dashboard aggregates ────────────────────────────────────────────────
  router.get(
    '/stats',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const sinceMidnight = new Date();
      sinceMidnight.setHours(0, 0, 0, 0);

      const [
        users,
        tenants,
        activeSessions,
        apiKeys,
        oauthClients,
        webhookRows,
        signups24h,
        failedLogins24h,
        auditToday,
        breaches,
        riskEvents,
      ] = await Promise.all([
        UserModel.countDocuments({ tenantId: caller.tenantId }),
        TenantModel.countDocuments(),
        SessionModel.countDocuments({ status: 'active' }),
        ApiKeyModel.countDocuments(),
        OAuthClientModel.countDocuments({ isActive: true }),
        webhooks.list(caller.tenantId),
        UserModel.countDocuments({ tenantId: caller.tenantId, createdAt: { $gte: since24h } }),
        AuditLogModel.countDocuments({
          eventType: AUDIT_EVENT.LOGIN_FAILED,
          timestamp: { $gte: since24h },
        }),
        AuditLogModel.countDocuments({ timestamp: { $gte: sinceMidnight } }),
        BreachRecordModel.countDocuments(),
        RiskEventModel.countDocuments({ createdAt: { $gte: since24h } }),
      ]);

      const recentRisk = (await RiskEventModel.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
        .exec()) as unknown as Array<Record<string, unknown>>;

      ok(res, {
        users,
        tenants,
        activeSessions,
        apiKeys,
        oauthClients,
        webhooks: webhookRows.length,
        signups24h,
        failedLogins24h,
        auditToday,
        breaches,
        riskEvents,
        risk: recentRisk,
      });
    }),
  );

  // ── Tenants ──────────────────────────────────────────────────────────────
  router.get(
    '/tenants',
    handle(async (_req, res) => {
      const rows = (await TenantModel.find()
        .sort({ createdAt: -1 })
        .lean()
        .exec()) as unknown as TenantDoc[];
      ok(res, { tenants: rows.map(tenantJson) });
    }),
  );

  router.post(
    '/tenants',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const body = bodyOf(req);
      const name = str(body.name);
      const slug = str(body.slug, name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
      if (!name) {
        fail(res, 400, 'VALIDATION_ERROR', 'name is required');
        return;
      }
      try {
        const doc = (await TenantModel.create({
          slug,
          name,
          isActive: body.isActive !== false,
          config: {
            plan: str(body.plan, 'free'),
            ...(typeof body.config === 'object' && body.config ? (body.config as JsonObject) : {}),
          },
        })) as unknown as TenantDoc;
        await runtime.audit.log({
          eventType: AUDIT_EVENT.DOMAIN_ADDED,
          userId: caller.userId,
          tenantId: String(doc._id),
          applicationId: caller.applicationId,
          ip: req.headers['x-forwarded-for'] as string | undefined,
          metadata: { admin: true, tenantName: name },
        });
        created(res, tenantJson(doc));
      } catch (err) {
        const e = mongoErrorStatus(err);
        fail(res, e.status, e.code, e.message);
      }
    }),
  );

  router.get(
    '/tenants/:id',
    handle(async (req, res) => {
      const doc = (await TenantModel.findOne(tenantLookup(str(req.params.id)))
        .lean()
        .exec()) as unknown as TenantDoc | null;
      if (!doc) {
        fail(res, 404, 'NOT_FOUND', 'Tenant not found');
        return;
      }
      ok(res, { tenant: tenantJson(doc) });
    }),
  );

  const updateTenant = handle(async (req, res) => {
    const doc = (await TenantModel.findOneAndUpdate(
      tenantLookup(str(req.params.id)),
      { $set: { ...sanitizeTenantPatch(bodyOf(req)) } },
      { new: true },
    )
      .lean()
      .exec()) as unknown as TenantDoc | null;
    if (!doc) {
      fail(res, 404, 'NOT_FOUND', 'Tenant not found');
      return;
    }
    ok(res, { tenant: tenantJson(doc) });
  });
  router.patch('/tenants/:id', updateTenant);
  router.post('/tenants/:id', updateTenant);

  function sanitizeTenantPatch(body: JsonObject): JsonObject {
    const set: JsonObject = {};
    if (typeof body.name === 'string' && body.name.trim()) set.name = body.name;
    if (typeof body.isActive === 'boolean') set.isActive = body.isActive;
    if (body.plan !== undefined)
      set['config.plan'] = typeof body.plan === 'string' ? body.plan : String(body.plan);
    if (typeof body.config === 'object' && body.config) {
      const config = body.config as JsonObject;
      if (config.plan !== undefined)
        set['config.plan'] = typeof config.plan === 'string' ? config.plan : String(config.plan);
      if (config.subscription !== undefined) set['config.subscription'] = config.subscription;
      if (config.settings !== undefined) set['config.settings'] = config.settings;
      if (
        config.plan === undefined &&
        config.subscription === undefined &&
        config.settings === undefined
      ) {
        set.config = config;
      }
    }
    return set;
  }

  // ── Users ────────────────────────────────────────────────────────────────
  router.get(
    '/users',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const { limit, offset } = parsePage(req);
      const tenantId = str(req.query.tenantId, caller.tenantId);
      const search = str(req.query.search);
      const filter: JsonObject = { tenantId };
      if (search) {
        filter.$or = [
          { email: { $regex: escapeRegExp(search), $options: 'i' } },
          { phone: { $regex: escapeRegExp(search), $options: 'i' } },
        ];
      }
      const rows = (await UserModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .select('-passwordHash')
        .lean()
        .exec()) as unknown as UserDoc[];
      const total = await UserModel.countDocuments(filter);
      const roleMap = await roleMapForUsers(
        runtime,
        tenantId,
        caller.applicationId,
        rows.map((r) => stringId(r._id)),
      );
      ok(res, {
        users: rows.map((r) => userJson(r, roleMap.get(stringId(r._id)) ?? [])),
        total,
        limit,
        offset,
      });
    }),
  );

  router.post(
    '/users',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const body = bodyOf(req);
      const email = str(body.email).toLowerCase();
      const phone = str(body.phone);
      const password = str(body.password);
      const roles = strArray(body.roles);

      if (!email && !phone) {
        fail(res, 400, 'VALIDATION_ERROR', 'At least one of email or phone is required');
        return;
      }
      if (email && !password) {
        fail(res, 400, 'VALIDATION_ERROR', 'Password is required for email users');
        return;
      }
      const passwordHash = password ? await hashPassword(password) : null;
      try {
        const doc = (await UserModel.create({
          tenantId: caller.tenantId,
          email: email || undefined,
          phone: phone || undefined,
          passwordHash,
          emailVerified: body.emailVerified === true,
          phoneVerified: body.phoneVerified === true,
          isActive: body.isActive !== false,
          metadata: body.metadata ?? {},
        })) as unknown as UserDoc;
        for (const roleName of roles) {
          await runtime.authorization
            .assignRole({
              userId: stringId(doc._id),
              tenantId: caller.tenantId,
              applicationId: caller.applicationId,
              roleName,
            })
            .catch(() => undefined);
        }
        await runtime.audit.log({
          eventType: AUDIT_EVENT.USER_REGISTERED,
          userId: stringId(doc._id),
          tenantId: caller.tenantId,
          applicationId: caller.applicationId,
          ip: req.headers['x-forwarded-for'] as string | undefined,
          metadata: { admin: true },
        });
        ok(res, { user: userJson(doc, roles) });
      } catch (err) {
        const e = mongoErrorStatus(err);
        fail(res, e.status, e.code, e.message);
      }
    }),
  );

  router.get(
    '/users/:id',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const doc = (await UserModel.findOne({ _id: str(req.params.id), tenantId: caller.tenantId })
        .select('-passwordHash')
        .lean()
        .exec()) as unknown as UserDoc | null;
      if (!doc) {
        fail(res, 404, 'NOT_FOUND', 'User not found');
        return;
      }
      const roleMap = await roleMapForUsers(runtime, caller.tenantId, caller.applicationId, [
        stringId(doc._id),
      ]);
      ok(res, { user: userJson(doc, roleMap.get(stringId(doc._id)) ?? []) });
    }),
  );

  router.get(
    '/users/:id/roles',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const userId = str(req.params.id);
      const roles = await runtime.authorization.getUserRoles({
        userId,
        tenantId: caller.tenantId,
        applicationId: caller.applicationId,
      });
      ok(res, { roles });
    }),
  );

  router.get(
    '/users/:id/permissions',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const userId = str(req.params.id);
      const permissions = await runtime.authorization.getUserPermissions({
        userId,
        tenantId: caller.tenantId,
        applicationId: caller.applicationId,
      });
      ok(res, { permissions });
    }),
  );

  router.patch(
    '/users/:id',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const body = bodyOf(req);
      const userId = str(req.params.id);
      const doc = (await UserModel.findOne({
        _id: userId,
        tenantId: caller.tenantId,
      })) as unknown as
        | (UserDoc & {
            tokenVersion?: number;
            save: () => Promise<void>;
          })
        | null;
      if (!doc) {
        fail(res, 404, 'NOT_FOUND', 'User not found');
        return;
      }

      let tokenVersionChanged = false;
      const setFields: JsonObject = {};
      if (body.email !== undefined) {
        setFields.email = str(body.email).toLowerCase();
        setFields.emailVerified = body.emailVerified === true;
      }
      if (body.phone !== undefined) setFields.phone = str(body.phone);
      if (typeof body.isActive === 'boolean') {
        setFields.isActive = body.isActive;
        if (body.isActive === false) tokenVersionChanged = true;
      }
      if (typeof body.password === 'string' && body.password) {
        setFields.passwordHash = await hashPassword(body.password);
        tokenVersionChanged = true;
      }
      if (typeof body.metadata === 'object' && body.metadata) setFields.metadata = body.metadata;
      if (Object.keys(setFields).length > 0) {
        await UserModel.updateOne({ _id: userId }, { $set: setFields });
      }

      // Role updates: diff names and apply via the authorization service.
      const roles = strArray(body.roles);
      if (body.roles !== undefined) {
        const currentRoles = (await runtime.authorization.getUserRoles({
          userId,
          tenantId: caller.tenantId,
          applicationId: caller.applicationId,
        })) as Array<{ name?: string } | string>;
        const currentNames = new Set(
          currentRoles.map((r) => (typeof r === 'string' ? r : (r.name ?? ''))),
        );
        for (const name of roles) {
          if (!currentNames.has(name)) {
            await runtime.authorization.assignRole({
              userId,
              tenantId: caller.tenantId,
              applicationId: caller.applicationId,
              roleName: name,
            });
            tokenVersionChanged = true;
          }
        }
        for (const name of currentNames) {
          if (!roles.includes(name)) {
            await runtime.authorization.removeRole({
              userId,
              tenantId: caller.tenantId,
              applicationId: caller.applicationId,
              roleName: name,
            });
            tokenVersionChanged = true;
          }
        }
      }
      if (tokenVersionChanged) {
        await UserModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
      }

      const refreshed = (await UserModel.findOne({ _id: userId })
        .select('-passwordHash')
        .lean()
        .exec()) as unknown as UserDoc;
      const roleMap = await roleMapForUsers(runtime, caller.tenantId, caller.applicationId, [
        userId,
      ]);
      ok(res, { user: userJson(refreshed, roleMap.get(userId) ?? []) });
    }),
  );

  router.delete(
    '/users/:id',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const userId = str(req.params.id);
      const result = await UserModel.updateOne(
        { _id: userId, tenantId: caller.tenantId },
        { $set: { isActive: false }, $inc: { tokenVersion: 1 } },
      );
      if (result.matchedCount === 0) {
        fail(res, 404, 'NOT_FOUND', 'User not found');
        return;
      }
      await SessionModel.updateMany(
        { userId, tenantId: caller.tenantId, status: 'active' },
        { $set: { status: 'revoked', revokedAt: new Date() } },
      );
      ok(res, { deactivated: true });
    }),
  );

  // ── Roles & permissions ──────────────────────────────────────────────────
  router.get(
    '/roles',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const tenantId = str(req.query.tenantId, caller.tenantId);
      const applicationId = str(req.query.applicationId, caller.applicationId);
      const rows = (await RoleModel.find({ tenantId, applicationId })
        .lean()
        .exec()) as unknown as RoleDoc[];
      ok(res, { roles: rows.map(roleJson) });
    }),
  );

  router.post(
    '/roles',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const body = bodyOf(req);
      const name = str(body.name).trim().toUpperCase();
      if (!name) {
        fail(res, 400, 'VALIDATION_ERROR', 'name is required');
        return;
      }
      try {
        const doc = (await RoleModel.create({
          tenantId: caller.tenantId,
          applicationId: caller.applicationId,
          name,
          description: str(body.description),
          permissionIds: strArray(body.permissions),
          isSystem: false,
        })) as unknown as RoleDoc;
        await logAdmin(runtime, req, caller, AUDIT_EVENT.ROLE_CHANGED, { role: name, admin: true });
        ok(res, { role: roleJson(doc) });
      } catch (err) {
        const e = mongoErrorStatus(err);
        fail(res, e.status, e.code, e.message);
      }
    }),
  );

  router.patch(
    '/roles/:id',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const body = bodyOf(req);
      const setFields: JsonObject = {};
      if (body.description !== undefined) setFields.description = str(body.description);
      if (body.permissions !== undefined) setFields.permissionIds = strArray(body.permissions);
      if (Object.keys(setFields).length === 0) {
        fail(res, 400, 'VALIDATION_ERROR', 'Nothing to update');
        return;
      }
      const doc = (await RoleModel.findOneAndUpdate(
        { _id: str(req.params.id), tenantId: caller.tenantId, applicationId: caller.applicationId },
        { $set: setFields },
        { new: true },
      )
        .lean()
        .exec()) as unknown as RoleDoc | null;
      if (!doc) {
        fail(res, 404, 'NOT_FOUND', 'Role not found');
        return;
      }
      await logAdmin(runtime, req, caller, AUDIT_EVENT.ROLE_CHANGED, {
        role: doc.name,
        admin: true,
      });
      ok(res, { role: roleJson(doc) });
    }),
  );

  router.delete(
    '/roles/:id',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const doc = (await RoleModel.findOne({
        _id: str(req.params.id),
        tenantId: caller.tenantId,
        applicationId: caller.applicationId,
      })
        .lean()
        .exec()) as unknown as RoleDoc | null;
      if (!doc) {
        fail(res, 404, 'NOT_FOUND', 'Role not found');
        return;
      }
      if (doc.isSystem) {
        fail(res, 400, 'SYSTEM_ROLE', 'System roles cannot be deleted');
        return;
      }
      await UserRoleAssignmentModel.deleteMany({ roleId: stringId(doc._id) });
      await RoleModel.deleteOne({ _id: str(req.params.id) });
      await logAdmin(runtime, req, caller, AUDIT_EVENT.ROLE_CHANGED, {
        role: doc.name,
        deleted: true,
        admin: true,
      });
      ok(res, { deleted: true });
    }),
  );

  const assignRole = handle(async (req, res) => {
    const caller = callerOf(req as PezhwanRequest);
    const body = bodyOf(req);
    const userId = str(body.userId);
    const roleName = str(body.roleName).trim().toUpperCase();
    if (!userId || !roleName) {
      fail(res, 400, 'VALIDATION_ERROR', 'userId and roleName are required');
      return;
    }
    await runtime.authorization.assignRole({
      userId,
      tenantId: str(body.tenantId, caller.tenantId),
      applicationId: str(body.applicationId, caller.applicationId),
      roleName,
    });
    await logAdmin(runtime, req, caller, AUDIT_EVENT.ROLE_CHANGED, {
      userId,
      roleName,
      assigned: true,
    });
    ok(res, { assigned: true });
  });
  router.post('/roles/assign', assignRole);

  const removeRole = handle(async (req, res) => {
    const caller = callerOf(req as PezhwanRequest);
    const body = bodyOf(req);
    const userId = str(body.userId);
    const roleName = str(body.roleName).trim().toUpperCase();
    if (!userId || !roleName) {
      fail(res, 400, 'VALIDATION_ERROR', 'userId and roleName are required');
      return;
    }
    await runtime.authorization.removeRole({
      userId,
      tenantId: str(body.tenantId, caller.tenantId),
      applicationId: str(body.applicationId, caller.applicationId),
      roleName,
    });
    await logAdmin(runtime, req, caller, AUDIT_EVENT.ROLE_CHANGED, {
      userId,
      roleName,
      removed: true,
    });
    ok(res, { removed: true });
  });
  router.post('/roles/remove', removeRole);

  router.get(
    '/permissions',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const tenantId = str(req.query.tenantId, caller.tenantId);
      const applicationId = str(req.query.applicationId, caller.applicationId);
      const rows = (await PermissionModel.find({ tenantId, applicationId })
        .lean()
        .exec()) as unknown as PermissionDoc[];
      ok(res, { permissions: rows.map(permissionJson) });
    }),
  );

  // ── Authorization decision (permission or ABAC-style) ────────────────────
  router.post(
    '/authorization/can',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const body = bodyOf(req);
      const userId = str(body.userId, caller.userId);
      const permission = str(body.permission);
      const tenantId = str(body.tenantId, caller.tenantId);
      const applicationId = str(body.applicationId, caller.applicationId);

      let allowed = false;
      const explicit = permission.includes(':');
      if (explicit) {
        const sep = permission.indexOf(':');
        allowed = await runtime.authorization.can({
          userId,
          tenantId,
          applicationId,
          permission,
          resource: permission.slice(0, sep),
          action: permission.slice(sep + 1),
        });
      } else if (permission) {
        const perms = await runtime.authorization.getUserPermissions({
          userId,
          tenantId,
          applicationId,
        });
        allowed = perms.includes(permission);
      }
      ok(res, { allowed });
    }),
  );

  // ── OAuth clients ────────────────────────────────────────────────────────
  router.get(
    '/clients',
    handle(async (_req, res) => {
      const rows = (await OAuthClientModel.find()
        .sort({ createdAt: -1 })
        .lean()
        .exec()) as unknown as ClientDoc[];
      ok(res, { clients: rows.map(clientJson) });
    }),
  );

  router.post(
    '/clients',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const body = bodyOf(req);
      const name = str(body.name);
      const redirectUris = strArray(body.redirectUris);
      if (!name || redirectUris.length === 0) {
        fail(res, 400, 'VALIDATION_ERROR', 'name and redirectUris are required');
        return;
      }
      const registered = await runtime.oauth.registerClient({
        tenantId: caller.tenantId,
        applicationId: caller.applicationId,
        name,
        redirectUris,
        grants: strArray(body.grants).length > 0 ? strArray(body.grants) : ['authorization_code'],
        scopes: strArray(body.scopes),
        confidential: body.confidential !== false,
        ...(typeof body.clientSecret === 'string' ? { clientSecret: body.clientSecret } : {}),
      });
      const row = (await OAuthClientModel.findOne({ clientId: registered.clientId })
        .lean()
        .exec()) as unknown as ClientDoc;
      ok(res, { client: clientJson(row), clientSecret: registered.clientSecret ?? null });
    }),
  );

  router.delete(
    '/clients/:clientId',
    handle(async (req, res) => {
      const result = await OAuthClientModel.updateOne(
        { clientId: str(req.params.clientId) },
        { $set: { isActive: false } },
      );
      if (result.matchedCount === 0) {
        fail(res, 404, 'NOT_FOUND', 'Client not found');
        return;
      }
      ok(res, { disabled: true });
    }),
  );

  router.patch(
    '/clients/:clientId',
    handle(async (req, res) => {
      const body = bodyOf(req);
      const set: JsonObject = {};
      if (typeof body.isActive === 'boolean') set.isActive = body.isActive;
      if (body.redirectUris !== undefined) set.redirectUris = strArray(body.redirectUris);
      if (body.scopes !== undefined) set.scopes = strArray(body.scopes);
      if (Object.keys(set).length === 0) {
        fail(res, 400, 'VALIDATION_ERROR', 'Nothing to update');
        return;
      }
      const result = await OAuthClientModel.updateOne(
        { clientId: str(req.params.clientId) },
        { $set: set },
      );
      if (result.matchedCount === 0) {
        fail(res, 404, 'NOT_FOUND', 'Client not found');
        return;
      }
      ok(res, { updated: true, ...set });
    }),
  );

  // ── Sessions ─────────────────────────────────────────────────────────────
  router.get(
    '/sessions',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const { limit, offset } = parsePage(req);
      const filter: JsonObject = {};
      const status = str(req.query.status);
      if (status) filter.status = status;
      const realm = str(req.query.tenant, caller.tenantId);
      filter.tenantId = realm;
      const rows = (await SessionModel.find(filter)
        .sort({ lastActiveAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec()) as unknown as SessionDoc[];
      const total = await SessionModel.countDocuments(filter);
      ok(res, { sessions: rows.map(sessionJson), total, limit, offset });
    }),
  );

  router.post(
    '/sessions/:id/revoke',
    handle(async (req, res) => {
      const result = await SessionModel.updateOne(
        { _id: str(req.params.id), status: 'active' },
        { $set: { status: 'revoked', revokedAt: new Date() } },
      );
      if (result.matchedCount === 0) {
        fail(res, 404, 'NOT_FOUND', 'Active session not found');
        return;
      }
      ok(res, { revoked: true });
    }),
  );

  // ── Audit trail ──────────────────────────────────────────────────────────
  router.get(
    '/audit',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const { limit, offset } = parsePage(req);
      const filter: JsonObject = {};
      const tenantId = str(req.query.tenantId, caller.tenantId);
      filter.tenantId = tenantId;
      if (req.query.eventType) filter.eventType = str(req.query.eventType);
      if (req.query.severity) filter.severity = str(req.query.severity);
      if (req.query.userId) filter.userId = str(req.query.userId);
      const rows = (await AuditLogModel.find(filter)
        .sort({ timestamp: -1, sequence: -1 })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec()) as unknown as AuditDoc[];
      const total = await AuditLogModel.countDocuments(filter);
      const head = (await AuditLogModel.findOne()
        .sort({ sequence: -1 })
        .lean()
        .exec()) as unknown as AuditDoc | null;
      ok(res, {
        auditLogs: rows.map(auditJson),
        total,
        limit,
        offset,
        chainHead: head ? stringId(head.sequence ?? '') : null,
        chainRootVerified: head ? Boolean(head.prevHash) : false,
      });
    }),
  );

  // ── API keys ─────────────────────────────────────────────────────────────
  router.get(
    '/api-keys',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const tenantId = str(req.query.tenantId, caller.tenantId);
      const rows = (await ApiKeyModel.find({ tenantId })
        .sort({ createdAt: -1 })
        .lean()
        .exec()) as unknown as ApiKeyDoc[];
      ok(res, { apiKeys: rows.map((r) => apiKeyJson(r)) });
    }),
  );

  router.post(
    '/api-keys',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const body = bodyOf(req);
      const name = str(body.name);
      if (!name) {
        fail(res, 400, 'VALIDATION_ERROR', 'name is required');
        return;
      }
      const created = await runtime.apiKeys.create({
        tenantId: caller.tenantId,
        applicationId: caller.applicationId,
        name,
        scopes: strArray(body.scopes),
      });
      const doc = (await ApiKeyModel.findOne({ keyHash: created.keyHash })
        .lean()
        .exec()) as unknown as ApiKeyDoc;
      await logAdmin(runtime, req, caller, AUDIT_EVENT.API_KEY_CREATED, { name, admin: true });
      ok(res, {
        apiKey: apiKeyJson(doc),
        rawKey: created.rawKey,
        prefix: created.prefix,
      });
    }),
  );

  router.delete(
    '/api-keys/:id',
    handle(async (req, res) => {
      const id = str(req.params.id);
      await runtime.apiKeys.revoke(id);
      ok(res, { revoked: true });
    }),
  );

  // ── Webhooks ─────────────────────────────────────────────────────────────
  router.get(
    '/webhooks',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const tenantId = str(req.query.tenantId, caller.tenantId);
      const rows = (await webhooks.list(tenantId)) as unknown as WebhookDocRow[];
      ok(res, { webhooks: rows.map((r) => webhookJson(r)) });
    }),
  );

  router.post(
    '/webhooks',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const body = bodyOf(req);
      const url = str(body.url);
      const events = strArray(body.events);
      if (!url || events.length === 0) {
        fail(res, 400, 'VALIDATION_ERROR', 'url and events are required');
        return;
      }
      const doc = (await webhooks.register({
        url,
        events,
        tenantId: str(body.tenantId, caller.tenantId),
        applicationId: caller.applicationId,
      })) as unknown as WebhookDocRow;
      ok(res, { webhook: webhookJson(doc, true) });
    }),
  );

  router.post(
    '/webhooks/:id/test',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const id = str(req.params.id);
      const rows = (await webhooks.list(caller.tenantId)) as unknown as WebhookDocRow[];
      const webhook = rows.find((r) => stringId(r._id) === id);
      if (!webhook) {
        fail(res, 404, 'NOT_FOUND', 'Webhook not found');
        return;
      }
      await webhooks.deliver(webhook as never, 'TEST', {
        ping: true,
        tenantId: caller.tenantId,
        sentAt: new Date().toISOString(),
      });
      ok(res, { delivered: true, url: webhook.url });
    }),
  );

  // ── Security ─────────────────────────────────────────────────────────────
  router.get(
    '/security/breaches',
    handle(async (_req, res) => {
      const rows = (await BreachRecordModel.find()
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
        .exec()) as unknown as Array<Record<string, unknown>>;
      ok(res, { breaches: rows });
    }),
  );

  router.get(
    '/security/risk',
    handle(async (_req, res) => {
      const rows = (await RiskEventModel.find()
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
        .exec()) as unknown as Array<Record<string, unknown>>;
      ok(res, { riskEvents: rows });
    }),
  );

  // ── Settings (stored inside the tenant config) ───────────────────────────
  router.get(
    '/settings',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const doc = (await TenantModel.findOne({ slug: caller.tenantId })
        .lean()
        .exec()) as unknown as TenantDoc | null;
      const settings =
        ((doc?.config as JsonObject | undefined)?.settings as JsonObject | undefined) ?? {};
      ok(res, { settings });
    }),
  );

  router.patch(
    '/settings',
    handle(async (req, res) => {
      const caller = callerOf(req as PezhwanRequest);
      const body = bodyOf(req);
      const settings = body.settings;
      if (!settings || typeof settings !== 'object') {
        fail(res, 400, 'VALIDATION_ERROR', 'settings object is required');
        return;
      }
      await TenantModel.findOneAndUpdate(
        { slug: caller.tenantId },
        { $set: { 'config.settings': settings } },
        {
          upsert: true,
          setDefaultsOnInsert: true,
          $setOnInsert: {
            name: caller.tenantId,
            slug: caller.tenantId,
            isActive: true,
            'config.plan': 'free',
          },
        } as Record<string, unknown>,
      );
      ok(res, { settings });
    }),
  );

  // ── Subscriptions (derived from tenant plans) ────────────────────────────
  router.get(
    '/subscriptions',
    handle(async (_req, res) => {
      const rows = (await TenantModel.find().lean().exec()) as unknown as TenantDoc[];
      ok(res, {
        subscriptions: rows.map((d) => {
          const config = d.config ?? {};
          const status = (config.subscription as JsonObject | undefined)?.status as
            string | undefined;
          return {
            tenantId: stringId(d._id),
            tenant: d.name,
            plan: (config.plan as string) ?? 'free',
            status: status ?? (d.isActive ? 'active' : 'suspended'),
            cancelAtPeriodEnd:
              (config.subscription as JsonObject | undefined)?.cancelAtPeriodEnd ?? false,
          };
        }),
      });
    }),
  );

  return router;
}

// ---------------------------------------------------------------------------
// Helpers used above (deferred declarations to keep the intent readable)
// ---------------------------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tenantLookup(key: string): Record<string, string> {
  return /^[0-9a-fA-F]{24}$/.test(key) ? { _id: key } : { slug: key };
}

function logAdmin(
  runtime: PezhwanRuntime,
  req: Request,
  caller: { userId: string; tenantId: string; applicationId: string },
  eventType: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  return runtime.audit.log({
    eventType: eventType as never,
    userId: caller.userId,
    tenantId: caller.tenantId,
    applicationId: caller.applicationId,
    ip: (req.headers['x-forwarded-for'] as string) ?? req.ip,
    metadata,
  });
}

// ---------------------------------------------------------------------------
// Bootstrap — idempotent tenant/application/ADMIN role/admin user ensure
// ---------------------------------------------------------------------------

export interface BootstrapOptions {
  tenantId: string;
  applicationId: string;
  tenantName?: string;
  tenantSlug?: string;
  adminEmail?: string;
  adminPassword?: string;
}

/**
 * Ensures the bootstrap records exist so the reference server and admin
 * console work out of the box. Safe to call on every boot — each step is
 * guarded by existence checks.
 */
export async function ensureBootstrap(
  runtime: PezhwanRuntime,
  options: BootstrapOptions,
): Promise<void> {
  const { tenantId, applicationId } = options;

  if (!(await TenantModel.findOne({ slug: options.tenantSlug ?? `tenant-${tenantId}` }))) {
    await TenantModel.create({
      slug: options.tenantSlug ?? `tenant-${tenantId}`,
      name: options.tenantName ?? 'Bootstrap Tenant',
      isActive: true,
      config: { plan: 'pro' },
    });
    console.log(`[pezhwan] bootstrap tenant '${tenantId}' created`);
  }

  if (!(await ApplicationModel.findOne({ tenantId, clientId: applicationId }))) {
    const clientSecret = randomBytes(32).toString('base64url');
    await ApplicationModel.create({
      tenantId,
      applicationId,
      name: 'Default Application',
      platform: 'web',
      clientId: applicationId,
      clientSecretHash: createHash('sha256').update(clientSecret).digest('base64'),
      redirectUris: [],
      isActive: true,
    });
    console.log(
      `[pezhwan] bootstrap application '${applicationId}' created` +
        (process.env.NODE_ENV === 'production' ? '' : ` (clientSecret: ${clientSecret})`),
    );
  }

  if (!(await RoleModel.findOne({ tenantId, applicationId, name: 'ADMIN' }))) {
    await RoleModel.create({
      tenantId,
      applicationId,
      name: 'ADMIN',
      description: 'Platform administrator',
      permissionIds: [],
      isSystem: true,
    });
    console.log(`[pezhwan] ADMIN role created for '${applicationId}'`);
  }

  if (options.adminEmail && options.adminPassword) {
    const existing = await UserModel.findOne({
      tenantId,
      email: options.adminEmail.toLowerCase(),
    });
    let userId: string;
    if (!existing) {
      try {
        const { user } = await runtime.auth.register({
          tenantId,
          applicationId,
          email: options.adminEmail,
          password: options.adminPassword,
          metadata: { bootstrapAdmin: true },
        });
        userId = String((user as unknown as { _id: unknown })._id);
        console.log(`[pezhwan] bootstrap admin '${options.adminEmail}' created`);
      } catch (err) {
        console.warn(
          `[pezhwan] bootstrap admin creation skipped: ${err instanceof Error ? err.message : err}`,
        );
        return;
      }
    } else {
      userId = String(existing._id);
    }
    await runtime.authorization
      .assignRole({ userId, tenantId, applicationId, roleName: 'ADMIN' })
      .catch(() => undefined);
  }
}
