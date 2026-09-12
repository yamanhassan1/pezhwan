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
  FederatedIdentityService,
  type PezhwanRuntime,
} from '@pezhwan/core';
import {
  createAuthenticate,
  requireAuth,
  type PezhwanRequest,
} from '@pezhwan/express';

const PORT = Number(process.env.PORT ?? 5179);
const TENANT_ID = process.env.TENANT_ID ?? 'dev-tenant';
const APPLICATION_ID = process.env.APPLICATION_ID ?? 'dev-app';
const ISSUER = process.env.ISSUER ?? 'http://localhost:4011';
const AUDIENCE = 'pezhwan.clients';
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/pezhwan';
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

function mintTokens(userId: string, authMethod: 'oidc' | 'password' | 'oauth') {
  return Promise.resolve().then(async () => {
    const sessions = await runtime.sessions.create({ userId, tenantId: TENANT_ID, applicationId: APPLICATION_ID });
    return {
      accessToken: runtime.tokens.signAccessToken({
        userId,
        tenantId: TENANT_ID,
        applicationId: APPLICATION_ID,
        sessionId: sessions.sessionId,
        roles: [],
        permissions: [],
        authMethod,
      }),
      refreshToken: sessions.refreshToken,
      session: sessions,
    };
  });
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(__dirname, '.')));

const h = (fn: (req: PezhwanRequest, res: express.Response) => Promise<unknown>) => (
  req: PezhwanRequest,
  res: express.Response,
): void => {
  fn(req, res).then(
    (data) => res.json({ success: true, data }),
    (err: { code?: string; message?: string; status?: number }) => {
      const status = err.status ?? (err.code ? 400 : 500);
      res.status(status).json({ success: false, error: { code: err.code ?? 'ERROR', message: err.message ?? 'Unexpected error' } });
    },
  );
};

const googleSubject = (email: string): string => email.trim().toLowerCase();

app.post('/api/password/register', h(async (req) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) throw { code: 'MISSING_FIELDS', message: 'email and password are required', status: 400 };
  const { user, tokens } = await runtime.auth.register({
    tenantId: TENANT_ID,
    applicationId: APPLICATION_ID,
    email: email.trim(),
    password,
  });
  return {
    user: { id: String(user._id), email: user.email ?? email },
    tokens,
  };
}));

app.post('/api/password/login', h(async (req) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) throw { code: 'MISSING_FIELDS', message: 'email and password are required', status: 400 };
  const result = await runtime.auth.loginPassword({ applicationId: APPLICATION_ID, email: email.trim(), password });
  if (result.mfaRequired || !result.tokens) {
    throw { code: 'MFA_REQUIRED', message: 'MFA is enabled on this account', status: 400 };
  }
  return {
    user: { id: String((result.user as { _id: unknown })._id ?? result.userId), email: result.user?.email ?? email },
    tokens: result.tokens,
  };
}));

app.get('/mock-idp/authorize', (req, res) => {
  const email = String(req.query.email ?? '');
  const state = String(req.query.state ?? '');
  res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Mock Google IdP — PEZHWAN demo</title>
<style>
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    background:#f4f6fb;display:flex;align-items:center;justify-content:center;min-height:100vh;}
  .card{background:#fff;border:1px solid #dfe7f3;border-radius:14px;box-shadow:0 18px 38px rgba(15,23,42,.08);
    max-width:420px;width:100%;margin:20px;padding:28px 26px;text-align:center;}
  h1{font-size:1.25rem;margin:0 0 6px;color:#0f172a;}
  .sub{color:#64748b;font-size:.8rem;margin-bottom:22px;}
  .logo{width:52px;height:52px;border-radius:50%;background:#2563eb;color:#fff;font-weight:700;
    display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:1.5rem;}
  label{display:block;text-align:left;font-size:.78rem;color:#475569;font-weight:600;margin-bottom:6px;}
  input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #ccd9ec;border-radius:10px;
    font-size:.9rem;margin-bottom:18px;font-family:monospace;}
  button{width:100%;padding:12px;border:none;border-radius:10px;background:#2563eb;color:#fff;
    font-weight:600;font-size:.9rem;cursor:pointer;}
  button:hover{background:#1d4ed8;}
  .note{margin-top:16px;font-size:.7rem;color:#94a3b8;}
</style>
</head>
<body>
  <form method="POST" action="/mock-idp/consent" class="card">
    <div class="logo">G</div>
    <h1>Sign in with Mock Google</h1>
    <div class="sub">This consent screen simulates the external IdP. It is running inside the demo server, so no external network is used.</div>
    <label for="email">Google account email</label>
    <input name="email" id="email" type="email" value="${email}" placeholder="you@gmail.com" required />
    <input name="state" type="hidden" value="${state}" />
    <button type="submit">Continue to PEZHWAN demo</button>
    <div class="note">PEZHWAN demo — simulated OIDC provider</div>
  </form>
</body>
</html>`);
});

app.post('/mock-idp/consent', async (req, res) => {
  const email = String((req.body as { email?: string })?.email ?? '').trim().toLowerCase();
  const state = String((req.body as { state?: string })?.state ?? '');
  try {
    if (!email) throw { code: 'EMAIL_REQUIRED', message: 'Email is required' };
    const profile = {
      provider: 'google',
      subject: email,
      email,
      name: email.split('@')[0],
    };
    const federated = new FederatedIdentityService();
    const resolved = await federated.resolve({
      tenantId: TENANT_ID,
      provider: 'google',
      subject: profile.subject,
      profile,
      autoProvision: true,
    });
    if (!resolved.user) {
      throw { code: 'IDENTITY_UNLINKED', message: `No matching local user for ${email}` };
    }
    const tokens = await mintTokens(String(resolved.user._id), 'oidc');
    const qs = `token=${encodeURIComponent(tokens.accessToken)}&refresh=${encodeURIComponent(tokens.refreshToken)}&state=${encodeURIComponent(state)}${state ? '&provider=google' : ''}`;
    res.redirect(`/social/callback?${qs}`);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    res.status(400).send(`<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Mock Google IdP — error</title>
<style>
  body{margin:0;font-family:-apple-system,'Segoe UI',sans-serif;background:#f4f6fb;display:flex;align-items:center;justify-content:center;min-height:100vh;}
  .card{background:#fff;border:1px solid #dfe7f3;border-radius:14px;padding:26px;max-width:420px;text-align:center;}
  .code{color:#dc2626;font-family:monospace;font-size:.8rem;}
</style></head>
<body><div class="card">
<h1>Sign-in failed</h1>
<p class="code">${e.code ?? 'ERROR'} — ${e.message ?? 'Unexpected error'}</p>
<p><a href="/">Back to demo</a></p>
</div></body></html>`);
  }
});

app.get('/social/callback', (_req, res) => {
  res.sendFile(path.resolve(__dirname, 'index.html'));
});

app.get('/api/me', createAuthenticate(runtime), requireAuth(), h(async (req) => {
  const userId = String(req.pezhwan!.userId);
  const user = await UserModel.findById(userId).select('email identities').lean();
  if (!user) throw { code: 'USER_NOT_FOUND', message: 'User not found', status: 404 };
  const googleId = (user.identities ?? []).find((i) => i.provider === 'google');
  return {
    ...req.pezhwan,
    email: user.email,
    googleSubject: googleId?.subject ?? null,
    linked: Boolean(googleId),
  };
}));

app.post('/api/link', createAuthenticate(runtime), requireAuth(), h(async (req) => {
  const email = String((req.body as { email?: string })?.email ?? '');
  if (!email) throw { code: 'MISSING_FIELDS', message: 'email is required', status: 400 };
  const subject = googleSubject(email);
  await new FederatedIdentityService().link(String(req.pezhwan!.userId), 'google', subject);
  return { linked: true, provider: 'google', subject };
}));

app.post('/api/unlink', createAuthenticate(runtime), requireAuth(), h(async (req) => {
  const email = String((req.body as { email?: string })?.email ?? '');
  if (!email) throw { code: 'MISSING_FIELDS', message: 'email is required', status: 400 };
  await new FederatedIdentityService().unlink(String(req.pezhwan!.userId), 'google', googleSubject(email));
  return { unlinked: true };
}));

app.post('/api/logout', createAuthenticate(runtime), requireAuth(), h(async (req) => {
  await runtime.sessions.revoke(String(req.pezhwan!.sessionId));
  return { loggedOut: true };
}));

app.use(
  (err: { status?: number; code?: string; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status ?? 500;
    res.status(status).json({ success: false, error: { code: err.code ?? 'ERROR', message: err.message ?? 'Unexpected error' } });
  },
);

app.listen(PORT, () => console.log(`social-login demo listening on http://localhost:${PORT}`));