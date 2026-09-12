import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { createPezhwan } from '@pezhwan/core';
import {
  buildRouters,
  corsAllowlist,
  createAuthenticate,
  jwksHandler,
  requestContext,
  requireAuth,
  securityHeaders,
} from '@pezhwan/express';
import { createAuthMiddleware } from './middleware/auth';
import { createAuthDemoRouter } from './routes/auth';

const PORT = Number(process.env.PORT ?? 4000);
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/pezhwan-api';
const TENANT_ID = process.env.PEZHWAN_TENANT_ID ?? 'dev-tenant';
const APPLICATION_ID = process.env.PEZHWAN_APPLICATION_ID ?? 'dev-app';
const ISSUER = process.env.PEZHWAN_ISSUER ?? 'http://localhost:4011';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:4000').split(',');

async function main(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  console.log(`[template] connected to MongoDB`);

  const runtime = createPezhwan({
    tenantId: TENANT_ID,
    applicationId: APPLICATION_ID,
    issuer: ISSUER,
    audience: 'pezhwan.clients',
    otpDelivery: {
      sendEmail: async (to, code) => console.log(`[template] OTP for ${to}: ${code}`),
      sendSms: async (to, code) => console.log(`[template] OTP SMS for ${to}: ${code}`),
    },
  });

  const app = express();
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(express.json());
  app.use(requestContext(runtime));
  app.use(securityHeaders());
  app.use(corsAllowlist({ allowedOrigins: ALLOWED_ORIGINS }));

  const auth = createAuthMiddleware(runtime);
  const routers = buildRouters(runtime);

  // Pre-built PEZHWAN surface (same endpoints as the reference identity server).
  app.use('/v1/auth', createAuthenticate(runtime), routers.auth);
  app.use('/v1/sessions', createAuthenticate(runtime), requireAuth(), routers.sessions);
  app.get('/.well-known/jwks.json', jwksHandler(runtime));

  // App-level demo routes wired to the runtime engine + auth middleware.
  app.use('/auth', createAuthDemoRouter(runtime, auth));

  app.get('/health/live', (_req, res) => res.json({ ok: true }));

  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = (err as { status?: number }).status ?? 500;
      res.status(status).json({
        success: false,
        error: {
          code: (err as { code?: string }).code ?? 'INTERNAL_ERROR',
          message: status >= 500 ? 'Internal server error' : (err as Error).message,
        },
      });
    },
  );

  app.listen(PORT, () => {
    console.log(`[template] express-api listening on :${PORT}`);
    console.log(`[template] demo routes at /auth (register, login, me)`);
    console.log(`[template] PEZHWAN surface at /v1/auth and /v1/sessions`);
  });
}

void main();