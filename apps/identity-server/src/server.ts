/**
 * PEZHWAN — Identity Server (development reference implementation).
 *
 * Stands up the Pezhwan auth stack as a standalone Express server exposing:
 *   /v1/auth/*      — register/login/refresh/logout/otp/password/email-verify
 *   /v1/sessions/*  — list/revoke/revoke-all
 *   /v1/mfa/*       — TOTP setup/enable/verify/disable + login completion
 *   /v1/verify/*    — password-reset / email-verify / magic-link token flows
 *   /v1/oauth/*     — authorization-code + PKCE + token + client registration
 *   /.well-known/openid-configuration, /.well-known/jwks.json
 *
 * In production, applications consume the SDK directly; this server is the
 * reference host and the future OAuth/OIDC + admin-console service.
 */

import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load env from this file's directory so it works regardless of cwd.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Centralized config — validates ALL env vars at startup. Exits on failure.
import { config } from './config/index.ts';

import './bootstrap.ts';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import {
  createPezhwan,
  initKeyPersistence,
  createRedisManager,
  UserModel,
  type PezhwanRuntime,
} from '@pezhwan/core';
import {
  createAuthenticate,
  requireAuth,
  requireRole,
  buildRouters,
  jwksHandler,
  securityHeaders,
  requestContext,
  csrfProtection,
  corsAllowlist,
  createAuthenticateApiKey,
  type PezhwanRequest,
} from '@pezhwan/express';

// ---------------------------------------------------------------------------
// Bootstrap: connect Mongo + construct the runtime, then wire the app
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  await mongoose.connect(config.database.mongodbUri);
  console.log(`[pezhwan] connected to MongoDB`);

  // Optional Redis client for distributed state. Redis is an optimiser, never
  // a gate: on any connection failure the cache degrades to in-memory and all
  // services fall through to MongoDB (the source of truth).
  let redisManager: ReturnType<typeof createRedisManager> | null = null;
  if (config.redis.enabled && config.redis.url) {
    redisManager = createRedisManager({ url: config.redis.url });
    await redisManager.connect().catch((err) => {
      console.warn(`[pezhwan] redis unavailable — operating degraded: ${err?.message ?? err}`);
    });
    if (!(await redisManager.isHealthy())) {
      console.warn('[pezhwan] redis health probe failed — operating degraded');
    }
  }

  const redis = redisManager?.connectedClient ?? null;

  const runtime = createPezhwan({
    tenantId: config.tenantId,
    applicationId: config.applicationId,
    issuer: config.issuer,
    audience: 'pezhwan.clients',
    accessTokenTtlMs: config.tokens.accessTokenTtlMs,
    redis,
    mfaEncryptionKey: config.mfaEncryptionKey,
    rateLimits: config.rateLimit.rules,
    otpDelivery: {
      sendEmail: async (target: string, code: string) => {
        if (config.env === 'production') {
          throw new Error(`Email OTP delivery is not configured for ${target}`);
        }
        console.log(`[pezhwan:otp] email ${target} => code ${code}`);
      },
      sendSms: async (target: string, code: string) => {
        if (config.env === 'production') {
          throw new Error(`SMS OTP delivery is not configured for ${target}`);
        }
        console.log(`[pezhwan:otp] sms ${target} => code ${code}`);
      },
    },
  });

  // Durable signing keys: restore the persisted key set (or generate + persist
  // on first boot) and schedule rotation. Must complete BEFORE the server
  // starts verifying tokens, so tokens minted by an earlier process verify.
  await initKeyPersistence(runtime, {
    directory: config.signingKeys.path,
    rotationIntervalMs: config.signingKeys.rotationIntervalMs,
  });
  console.log(`[pezhwan] signing keys ready in '${config.signingKeys.path}'`);

  wireApp(runtime, redisManager);
}

function wireApp(
  runtime: PezhwanRuntime,
  redisManager: ReturnType<typeof createRedisManager> | null = null,
): void {
  const app = express();
  let httpServer: ReturnType<typeof app.listen> | undefined;
  app.set('trust proxy', 1);
  app.use(cookieParser());
  // Explicit body cap (DO NOT remove): prevents oversized-payload/parser abuse.
  app.use(express.json({ limit: config.server.bodyLimit }));

  // Defense-in-depth: request IDs, hardened headers, strict CORS.
  app.use(requestContext(runtime));
  app.use(securityHeaders());
  app.use(corsAllowlist({
    allowedOrigins: config.cors.allowedOrigins,
    // Public, credential-free discovery metadata must be readable by any
    // origin (browser demo, health probes) without being allowlisted.
    publicPaths: ['/.well-known'],
  }));

  app.get('/health/live', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  app.get('/health/ready', (_req, res) => {
    const mongoReady = mongoose.connection.readyState === 1;
    const ready = mongoReady;
    res.status(ready ? 200 : 503).json({
      ok: ready,
      dependencies: {
        mongodb: mongoReady ? 'ready' : 'unavailable',
        redis: redisManager ? (redisManager.connectedClient ? 'ready' : 'degraded') : 'disabled',
      },
    });
  });

  const routers = buildRouters(runtime);

  // Auth endpoints (optional auth where needed; hard gates below).
  app.use('/v1/auth', createAuthenticate(runtime), csrfProtection());
  // Expose the double-submit CSRF token (sets the cookie if absent) so
  // cross-origin browser clients can obtain a token for state-changing calls.
  app.get('/v1/auth/csrf', (req, res) => {
    const token = (req.cookies as Record<string, string | undefined> | undefined)?.['pezhwan_csrf'] ?? '';
    res.json({ success: true, csrfToken: token });
  });
  app.use('/v1/mfa', createAuthenticate(runtime), requireAuth(), csrfProtection());
  app.use('/v1/verify', createAuthenticate(runtime), csrfProtection());
  app.use('/v1/sessions', createAuthenticate(runtime));
  app.use('/v1/oauth', createAuthenticate(runtime));

  app.use('/v1/auth', routers.auth);
  app.use('/v1/mfa', routers.mfa);
  app.use('/v1/verify', routers.verification);
  app.use('/v1/sessions', requireAuth(), routers.sessions);
  app.use('/v1/oauth', routers.oauth);

  // Authenticated user profile — scoped to the identity's tenant. The React
  // SDK reads this at bootstrap via GET /v1/users/me.
  app.get(
    '/v1/users/me',
    createAuthenticate(runtime),
    requireAuth(),
    async (req: PezhwanRequest, res) => {
      const identity = req.pezhwan;
      if (!identity) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
        });
        return;
      }
      try {
        const user = await UserModel.findOne({
          _id: identity.userId,
          tenantId: identity.tenantId,
        })
          .select('tenantId email phone emailVerified phoneVerified isActive')
          .lean();
        if (!user) {
          res.status(404).json({
            success: false,
            error: { code: 'USER_NOT_FOUND', message: 'User not found' },
          });
          return;
        }
        res.json({
          success: true,
          data: {
            id: String(user._id),
            tenantId: identity.tenantId,
            applicationId: identity.applicationId,
            email: user.email,
            phone: user.phone,
            emailVerified: user.emailVerified,
            isActive: user.isActive,
            roles: identity.roles,
          },
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
            detail: err instanceof Error ? err.message : undefined,
          },
        });
      }
    },
  );


  // Admin-protected example + API-key-protected service example.
  app.get(
    '/v1/admin/health',
    requireAuth(),
    requireRole('ADMIN'),
    (_req, res) => res.json({ ok: true }),
  );
  app.get(
    '/v1/services/ping',
    createAuthenticateApiKey(runtime),
    requireAuth(),
    (_req, res) => res.json({ ok: true }),
  );

  // Public JWKS + OIDC discovery.
  app.get('/.well-known/jwks.json', jwksHandler(runtime));
  app.get('/.well-known/openid-configuration', (_req, res) => {
    res.json(runtime.oauth.discovery());
  });

  // Serve the browser demo from / (after all API routes).
  const demoDir = path.resolve(__dirname, '../../../demo');
  app.use(express.static(demoDir));

  // Error handler — never expose internals in production.
  app.use(
    (
      err: Error & { code?: string; status?: number; requestId?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = err.status ?? 500;
      res.status(status).json({
        success: false,
        error: {
          code: err.code ?? 'INTERNAL_ERROR',
          message: status >= 500 ? 'Internal server error' : err.message,
          requestId: err.requestId,
        },
      });
    },
  );

  httpServer = app.listen(config.server.port, () => {
    console.log(`[pezhwan] identity server listening on :${config.server.port}`);
    console.log(`[pezhwan] issuer ${config.issuer} — use /v1/auth/login`);
    console.log(`[pezhwan] JWKS at /.well-known/jwks.json`);
    console.log(`[pezhwan] OIDC discovery at /.well-known/openid-configuration`);
  });

  // Graceful shutdown: close Redis + Mongo on SIGINT/SIGTERM.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`[pezhwan] ${signal} received — shutting down`);
    try {
      await new Promise<void>((resolve, reject) => {
        if (!httpServer) {
          resolve();
          return;
        }
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    } catch (err) {
      console.warn(`[pezhwan] http shutdown error: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      await redisManager?.disconnect();
    } catch (err) {
      console.warn(`[pezhwan] redis shutdown error: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      await mongoose.disconnect();
    } catch (err) {
      console.warn(`[pezhwan] mongo shutdown error: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
