import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import mongoose from 'mongoose';
import { createPezhwan, initKeyPersistence, UserModel, type PezhwanRuntime } from '@pezhwan/core';
import { createAuthenticate, requireAuth, type PezhwanRequest } from '@pezhwan/express';

const PORT = Number(process.env.PORT ?? 5175);
const TENANT_ID = process.env.TENANT_ID ?? 'dev-tenant';
const APPLICATION_ID = process.env.APPLICATION_ID ?? 'dev-app';
const ISSUER = process.env.ISSUER ?? 'http://localhost:4011';
const AUDIENCE = 'pezhwan.clients';
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/pezhwan';
const MFA_ENC_KEY =
  process.env.MFA_ENCRYPTION_KEY ?? 'cGV6aHdhbi1kZW1vLW1mYS1rZXktMDEyMzQ1Njc4OWE=';

await mongoose.connect(MONGODB_URI);
console.log('[basic-auth] connected to MongoDB');

const runtime: PezhwanRuntime = createPezhwan({
  tenantId: TENANT_ID,
  applicationId: APPLICATION_ID,
  issuer: ISSUER,
  audience: AUDIENCE,
  mfaEncryptionKey: MFA_ENC_KEY,
  otpDelivery: {
    sendEmail: async (target: string, code: string) => {
      console.log(`\n=== [basic-auth demo email] To ${target}: your code is ${code} ===\n`);
    },
  },
});

await initKeyPersistence(runtime, { directory: path.resolve(__dirname, 'keys') });
console.log(`[basic-auth] signing keys ready in '${path.resolve(__dirname, 'keys')}'`);

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '.')));

const h =
  (fn: (req: PezhwanRequest, res: express.Response) => Promise<unknown>) =>
  (req: PezhwanRequest, res: express.Response): void => {
    fn(req, res).then(
      (data) => res.json({ success: true, data }),
      (err: { code?: string; message?: string; status?: number }) => {
        const status = err.status ?? (err.code ? 400 : 500);
        console.error(`[basic-auth] ${req.method} ${req.path} failed:`, err);
        res.status(status).json({
          success: false,
          error: { code: err.code ?? 'ERROR', message: err.message ?? 'Unexpected error' },
        });
      },
    );
  };

const emailFrom = async (userId: string, tenantId: string): Promise<string | undefined> => {
  const user = await UserModel.findOne({ _id: userId, tenantId }).select('email').lean();
  return user?.email;
};

const sessionsOf = async (
  userId: string,
): Promise<
  Array<{ sessionId: string; createdAt: Date; lastActiveAt: Date; deviceLabel: string }>
> => {
  const docs = await runtime.sessions.listActive(userId);
  return docs.map((s) => ({
    sessionId: String(s._id),
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    deviceLabel: s.device?.deviceLabel ?? 'Unknown device',
  }));
};

app.post(
  '/api/register',
  h(async (req) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      const err = new Error('email and password are required') as Error & { code: string };
      err.code = 'MISSING_FIELDS';
      throw err;
    }
    const result = await runtime.auth.register({
      tenantId: TENANT_ID,
      applicationId: APPLICATION_ID,
      email,
      password,
    });
    return {
      user: { id: String(result.user._id), email: result.user.email },
      tokens: result.tokens,
    };
  }),
);

app.post(
  '/api/login',
  h(async (req) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      const err = new Error('email and password are required') as Error & { code: string };
      err.code = 'MISSING_FIELDS';
      throw err;
    }
    const result = await runtime.auth.loginPassword({
      applicationId: APPLICATION_ID,
      email,
      password,
    });
    if (result.mfaRequired || !result.tokens || !result.user) {
      return { mfaRequired: true, userId: result.userId };
    }
    return {
      mfaRequired: false,
      user: { id: String(result.user._id), email: result.user.email },
      tokens: result.tokens,
    };
  }),
);

app.get(
  '/api/me',
  createAuthenticate(runtime),
  requireAuth(),
  h(async (req) => {
    const identity = req.pezhwan;
    if (!identity) {
      const err = new Error('Authentication required') as Error & { code: string; status: number };
      err.code = 'UNAUTHENTICATED';
      err.status = 401;
      throw err;
    }
    const email = await emailFrom(identity.userId, identity.tenantId);
    return {
      id: identity.userId,
      email: email ?? null,
      tenantId: identity.tenantId,
      applicationId: identity.applicationId,
      sessionId: identity.sessionId,
      authMethod: identity.authMethod,
      roles: identity.roles,
      permissions: identity.permissions,
    };
  }),
);

app.get(
  '/api/sessions',
  createAuthenticate(runtime),
  requireAuth(),
  h(async (req) => {
    const identity = req.pezhwan;
    if (!identity) {
      const err = new Error('Authentication required') as Error & { code: string; status: number };
      err.code = 'UNAUTHENTICATED';
      err.status = 401;
      throw err;
    }
    return { sessions: await sessionsOf(identity.userId) };
  }),
);

app.post(
  '/api/sessions/:id/revoke',
  createAuthenticate(runtime),
  requireAuth(),
  h(async (req) => {
    const identity = req.pezhwan;
    if (!identity) {
      const err = new Error('Authentication required') as Error & { code: string; status: number };
      err.code = 'UNAUTHENTICATED';
      err.status = 401;
      throw err;
    }
    await runtime.sessions.revoke(req.params.id);
    return { revoked: true, sessions: await sessionsOf(identity.userId) };
  }),
);

app.post(
  '/api/logout',
  createAuthenticate(runtime),
  requireAuth(),
  h(async (req) => {
    const identity = req.pezhwan;
    if (!identity) {
      const err = new Error('Authentication required') as Error & { code: string; status: number };
      err.code = 'UNAUTHENTICATED';
      err.status = 401;
      throw err;
    }
    await runtime.sessions.revoke(identity.sessionId);
    return { loggedOut: true };
  }),
);

app.post(
  '/api/refresh',
  h(async (req) => {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) {
      const err = new Error('refreshToken is required') as Error & { code: string };
      err.code = 'MISSING_FIELDS';
      throw err;
    }
    try {
      const session = await runtime.sessions.refresh(refreshToken, {
        tenantId: TENANT_ID,
        applicationId: APPLICATION_ID,
      });
      const accessToken = runtime.tokens.signAccessToken({
        userId: session.userId,
        tenantId: String(session.tenantId),
        applicationId: String(session.applicationId),
        sessionId: session.sessionId,
        roles: [],
        permissions: [],
        authMethod: 'password',
      });
      console.log(`[basic-auth] refresh: rotating session ${session.sessionId}`);
      return { accessToken, refreshToken: session.refreshToken };
    } catch {
      const err = new Error('Invalid or expired refresh token') as Error & { code: string };
      err.code = 'INVALID_GRANT';
      throw err;
    }
  }),
);

app.listen(PORT, () => {
  console.log(`[basic-auth] demo listening on http://localhost:${PORT}`);
  console.log(
    `[basic-auth] issuer ${ISSUER} · tenant ${TENANT_ID} · application ${APPLICATION_ID}`,
  );
  console.log(`[basic-auth] register/login on /api/register and /api/login`);
});
