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
  WebAuthnService,
  UserModel,
  WebAuthnCredentialModel,
  type PezhwanRuntime,
} from '@pezhwan/core';
import {
  createAuthenticate,
  requireAuth,
  type PezhwanRequest,
} from '@pezhwan/express';

const PORT = Number(process.env.PORT ?? 5178);
const TENANT_ID = process.env.TENANT_ID ?? 'dev-tenant';
const APPLICATION_ID = process.env.APPLICATION_ID ?? 'dev-app';
const ISSUER = process.env.ISSUER ?? 'http://localhost:4011';
const AUDIENCE = 'pezhwan.clients';
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/pezhwan';
// 32 bytes: must decode to exactly 32 bytes for AES-256-GCM (MfaService throws
// INVALID_MFA_ENCRYPTION_KEY otherwise). Override via MFA_ENCRYPTION_KEY in .env.
const MFA_ENC_KEY = process.env.MFA_ENCRYPTION_KEY ?? 'cGV6aHdhbi1kZW1vLW1mYS1rZXktMDEyMzQ1Njc4OWE=';

await mongoose.connect(MONGODB_URI);

const runtime: PezhwanRuntime = createPezhwan({
  tenantId: TENANT_ID,
  applicationId: APPLICATION_ID,
  issuer: ISSUER,
  audience: AUDIENCE,
  mfaEncryptionKey: MFA_ENC_KEY,
  otpDelivery: {
    sendEmail: async (target: string, code: string) => {
      console.log(`\n=== [demo email] To ${target}: code ${code} ===\n`);
    },
  },
});

await initKeyPersistence(runtime, { directory: path.resolve(__dirname, 'keys') });

// WebAuthn / FIDO2 service. rpId 'localhost' matches the demo's own origin so
// the authenticator prompt works on the loopback interface (secure context).
const webauthn = new WebAuthnService({
  rpName: 'PEZHWAN Passkey Demo',
  rpId: 'localhost',
  origins: ['http://localhost:5178'],
  requireUserVerification: false,
  requireResidentKey: false,
  attestation: 'none',
});

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
      res.status(status).json({
        success: false,
        error: {
          code: err.code ?? 'ERROR',
          message: err.message ?? 'Unexpected error',
        },
      });
    },
  );
};

const auth = createAuthenticate(runtime);

// ---------------------------------------------------------------------------
// Password register / login (fallback sign-in for the passkey demo)
// ---------------------------------------------------------------------------

app.post(
  '/api/register',
  h(async (req) => {
    const email = String(req.body?.email ?? '');
    const password = String(req.body?.password ?? '');
    const resp = await runtime.auth.register({
      tenantId: TENANT_ID,
      applicationId: APPLICATION_ID,
      email,
      password,
    });
    const user = resp.user;
    return {
      user: { id: String(user._id), email: user.email },
      tokens: resp.tokens,
    };
  }),
);

app.post(
  '/api/login',
  h(async (req) => {
    const email = String(req.body?.email ?? '');
    const password = String(req.body?.password ?? '');
    const resp = await runtime.auth.loginPassword({
      applicationId: APPLICATION_ID,
      email,
      password,
    });
    if (resp.mfaRequired) {
      return { mfaRequired: true, userId: resp.userId };
    }
    const user = resp.user;
    if (!user || !resp.tokens) {
      throw Object.assign(new Error('Login completed without tokens'), {
        code: 'LOGIN_NO_TOKENS',
      });
    }
    return {
      user: { id: String(user._id), email: user.email },
      tokens: resp.tokens,
    };
  }),
);

// ---------------------------------------------------------------------------
// Profile + passkey management
// ---------------------------------------------------------------------------

app.get(
  '/api/me',
  auth,
  requireAuth(),
  h(async (req) => {
    const identity = req.pezhwan;
    if (!identity) {
      throw Object.assign(new Error('Authentication required'), {
        code: 'UNAUTHENTICATED',
        status: 401,
      });
    }
    const user = await UserModel.findById(identity.userId).select('email').lean();
    return {
      identity,
      email: user?.email ?? null,
      passkeys: await webauthn.listCredentials(identity.userId),
    };
  }),
);

// ---------------------------------------------------------------------------
// Passkey ceremonies
// ---------------------------------------------------------------------------

app.post(
  '/api/passkey/register/begin',
  auth,
  requireAuth(),
  h(async (req) => {
    const identity = req.pezhwan;
    if (!identity) {
      throw Object.assign(new Error('Authentication required'), {
        code: 'UNAUTHENTICATED',
        status: 401,
      });
    }
    const email = String(req.body?.email ?? '');
    const existingIds = (await webauthn.listCredentials(identity.userId)).map(
      (c) => c.credentialId,
    );
    const result = await webauthn.beginRegistration(
      identity.userId,
      email,
      email,
      existingIds,
    );
    return { options: result.options, expectedChallenge: result.expectedChallenge };
  }),
);

app.post(
  '/api/passkey/register/complete',
  auth,
  requireAuth(),
  h(async (req) => {
    const { credential, expectedChallenge, origin } = req.body ?? {};
    const summary = await webauthn.completeRegistration(credential, expectedChallenge, origin);
    return { credentialId: summary.credentialId, createdAt: summary.createdAt };
  }),
);

app.post(
  '/api/passkey/assert/begin',
  h(async (req) => {
    const email = String(req.body?.email ?? '');
    const user = await UserModel.findOne({
      tenantId: TENANT_ID,
      email: email.toLowerCase(),
    }).lean();
    if (!user) {
      throw Object.assign(new Error('User not found'), {
        code: 'USER_NOT_FOUND',
        status: 404,
      });
    }
    const result = await webauthn.beginAuthentication(String(user._id));
    return {
      options: result.options,
      expectedChallenge: result.expectedChallenge,
      userId: String(user._id),
    };
  }),
);

app.post(
  '/api/passkey/assert/complete',
  h(async (req) => {
    const { credential, expectedChallenge, origin } = req.body ?? {};
    const ok = await webauthn.completeAuthentication(credential, expectedChallenge, origin);
    if (!ok) {
      throw Object.assign(new Error('Passkey verification failed'), {
        code: 'PASSKEY_VERIFY_FAILED',
      });
    }
    const credDoc = await WebAuthnCredentialModel.findOne({
      credentialId: credential?.id,
      isRevoked: false,
    }).lean();
    if (!credDoc) {
      throw Object.assign(new Error('Credential owner not found'), {
        code: 'PASSKEY_OWNER_NOT_FOUND',
      });
    }
    const userId = String(credDoc.userId);

    // Sign the passkey identity in like any other auth method: new session +
    // fresh access token carrying the minimal identity claims.
    const session = await runtime.sessions.create({
      userId,
      tenantId: TENANT_ID,
      applicationId: APPLICATION_ID,
    });
    const accessToken = runtime.tokens.signAccessToken({
      userId,
      tenantId: TENANT_ID,
      applicationId: APPLICATION_ID,
      sessionId: session.sessionId,
      roles: [],
      permissions: [],
      authMethod: 'passkey',
    });

    const user = await UserModel.findById(userId).select('email').lean();
    return {
      user: { id: userId, email: user?.email ?? null },
      tokens: { accessToken, refreshToken: session.refreshToken, session },
    };
  }),
);

app.listen(PORT, () => console.log(`demo listening on http://localhost:${PORT}`));