import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import mongoose from 'mongoose';
import {
  createPezhwan,
  initKeyPersistence,
  UserModel,
  type PezhwanRuntime,
} from '@pezhwan/core';
import {
  createAuthenticate,
  requireAuth,
  type PezhwanRequest,
} from '@pezhwan/express';

const PORT = Number(process.env.PORT ?? 5181);
const ISSUER = process.env.ISSUER ?? 'http://localhost:4011';
const AUDIENCE = 'pezhwan.clients';
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/pezhwan';
const MFA_ENC_KEY = process.env.MFA_ENCRYPTION_KEY ?? 'cGV6aHdhbi1kZW1vLW1mYS1rZXktMDEyMzQ1Njc4OWE=';

const TENANT_A_ID = process.env.TENANT_A_ID ?? 'dev-tenant';
const TENANT_A_APP = process.env.TENANT_A_APP ?? 'dev-app';
const TENANT_B_ID = process.env.TENANT_B_ID ?? 'tenant-b';
const TENANT_B_APP = process.env.TENANT_B_APP ?? 'app-b';

await mongoose.connect(MONGODB_URI);
console.log('[multi-tenant] connected to MongoDB');

const buildRuntime = (tenantId: string, applicationId: string): PezhwanRuntime =>
  createPezhwan({
    tenantId,
    applicationId,
    issuer: ISSUER,
    audience: AUDIENCE,
    mfaEncryptionKey: MFA_ENC_KEY,
    otpDelivery: {
      sendEmail: async (target: string, code: string) => {
        console.log(`\n[multi-tenant] OTP to ${target}: ${code}\n`);
      },
    },
  });

const runtimeA = buildRuntime(TENANT_A_ID, TENANT_A_APP);
const runtimeB = buildRuntime(TENANT_B_ID, TENANT_B_APP);

await initKeyPersistence(runtimeA, { directory: path.resolve(__dirname, 'keys-a') });
await initKeyPersistence(runtimeB, { directory: path.resolve(__dirname, 'keys-b') });
console.log('[multi-tenant] signing keys ready');

const authA = createAuthenticate(runtimeA);
const authB = createAuthenticate(runtimeB);

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '.')));

const h = (fn: (req: PezhwanRequest, res: express.Response) => Promise<unknown>) => (
  req: PezhwanRequest,
  res: express.Response,
): void => {
  fn(req, res).then(
    (data) => res.json({ success: true, data }),
    (err: { code?: string; message?: string; status?: number }) => {
      const status = err.status ?? (err.code ? 400 : 500);
      console.error(`[multi-tenant] ${req.method} ${req.path} failed:`, err);
      res.status(status).json({
        success: false,
        error: { code: err.code ?? 'ERROR', message: err.message ?? 'Unexpected error' },
      });
    },
  );
};

// ---------------------------------------------------------------------------
// Tenant route helpers
// ---------------------------------------------------------------------------

type TenantKey = 'a' | 'b';

interface TenantConfig {
  runtime: PezhwanRuntime;
  auth: ReturnType<typeof createAuthenticate>;
  tenantId: string;
  applicationId: string;
}

const tenants: Record<TenantKey, TenantConfig> = {
  a: { runtime: runtimeA, auth: authA, tenantId: TENANT_A_ID, applicationId: TENANT_A_APP },
  b: { runtime: runtimeB, auth: authB, tenantId: TENANT_B_ID, applicationId: TENANT_B_APP },
};

const resolveTenant = (key: string): TenantConfig | undefined =>
  key === 'a' || key === 'b' ? tenants[key] : undefined;

// Register
app.post(
  '/api/tenants/:tenant/register',
  h(async (req) => {
    const tc = resolveTenant(req.params.tenant);
    if (!tc) {
      const err = new Error('Invalid tenant') as Error & { code: string };
      err.code = 'INVALID_TENANT';
      throw err;
    }
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      const err = new Error('email and password are required') as Error & { code: string };
      err.code = 'MISSING_FIELDS';
      throw err;
    }
    const result = await tc.runtime.auth.register({
      tenantId: tc.tenantId,
      applicationId: tc.applicationId,
      email,
      password,
    });
    return {
      user: { id: String(result.user._id), email: result.user.email },
      tokens: result.tokens,
    };
  }),
);

// Login
app.post(
  '/api/tenants/:tenant/login',
  h(async (req) => {
    const tc = resolveTenant(req.params.tenant);
    if (!tc) {
      const err = new Error('Invalid tenant') as Error & { code: string };
      err.code = 'INVALID_TENANT';
      throw err;
    }
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      const err = new Error('email and password are required') as Error & { code: string };
      err.code = 'MISSING_FIELDS';
      throw err;
    }
    const result = await tc.runtime.auth.loginPassword({
      applicationId: tc.applicationId,
      email,
      password,
    });
    if (result.mfaRequired) {
      return { mfaRequired: true, userId: result.userId };
    }
    if (!result.tokens || !result.user) {
      const err = new Error('Login failed') as Error & { code: string };
      err.code = 'LOGIN_FAILED';
      throw err;
    }
    return {
      user: { id: String(result.user._id), email: result.user.email },
      tokens: result.tokens,
    };
  }),
);

// Me (auth per-runtime)
for (const [key, tc] of Object.entries(tenants) as [TenantKey, TenantConfig][]) {
  app.get(
    `/api/tenants/${key}/me`,
    tc.auth,
    requireAuth(),
    h(async (req) => {
      const identity = req.pezhwan;
      const user = await UserModel.findOne({
        _id: identity!.userId,
        tenantId: identity!.tenantId,
      })
        .select('email')
        .lean();
      return {
        userId: identity!.userId,
        tenantId: identity!.tenantId,
        applicationId: identity!.applicationId,
        sessionId: identity!.sessionId,
        authMethod: identity!.authMethod,
        email: user?.email ?? null,
      };
    }),
  );

  // Logout (auth per-runtime)
  app.post(
    `/api/tenants/${key}/logout`,
    tc.auth,
    requireAuth(),
    h(async (req) => {
      const identity = req.pezhwan;
      await tc.runtime.sessions.revoke(identity!.sessionId);
      return { loggedOut: true };
    }),
  );
}

// Cross-tenant "me" endpoints — mount tenant-A middleware on /api/tenants/b/*
// and tenant-B middleware on /api/tenants/a/* to demonstrate isolation.
app.get(
  '/api/tenants/:tenant/me/cross',
  h(async (req, res) => {
    // Use the opposite middleware from the route tenant to detect cross-tenant
    const key = req.params.tenant as TenantKey;
    const oppositeKey: TenantKey = key === 'a' ? 'b' : 'a';
    const crossMiddleware = tenants[oppositeKey].auth;

    // Run the cross middleware in a sub-call to check the token
    crossMiddleware(req, res, (err?: unknown) => {
      if (err) {
        res.status(401).json({
          success: false,
          error: {
            code: 'CROSS_TENANT_REJECTED',
            message: 'Token rejected by opposite tenant runtime',
          },
        });
        return;
      }
      if (!req.pezhwan) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
        });
        return;
      }
      res.json({
        success: true,
        data: {
          userId: req.pezhwan.userId,
          tenantId: req.pezhwan.tenantId,
          applicationId: req.pezhwan.applicationId,
          email: req.pezhwan.userId,
          authMethod: req.pezhwan.authMethod,
        },
      });
    });
  }),
);

// The client calls /api/tenants/b/me with a tenant-A token.
// tenant-B's middleware runs and rejects it → 401.
// We also provide a simple /api/tenants/:tenant/me that uses the
// correct runtime middleware, so the client just sends its token
// to the route and the server decides acceptance.

app.listen(PORT, () => {
  console.log(`[multi-tenant] demo listening on http://localhost:${PORT}`);
  console.log(`[multi-tenant] tenant A: ${TENANT_A_ID} / ${TENANT_A_APP}`);
  console.log(`[multi-tenant] tenant B: ${TENANT_B_ID} / ${TENANT_B_APP}`);
});
