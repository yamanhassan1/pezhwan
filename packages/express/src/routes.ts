/**
 * PEZHWAN — pre-built Express routers.
 *
 * Wire the AuthEngine + SessionService into standard Express routes:
 *   /register /login /logout /refresh /otp/send /otp/verify /password/change
 *   /password/reset /email/verify   (auth router)
 *   /   (list) /:id/revoke  /all/revoke   (session router)
 *
 * Responses use a consistent { success, data, error } envelope. Errors are
 * thrown as PezhwanError subclasses and handled by the app's error handler.
 */

import { Router, type Request, type Response } from 'express';
import {
  AuthenticationError,
  ValidationError,
} from '@pezhwan/shared';
import type { PezhwanRequest } from './index.ts';
import type { PezhwanRuntime } from '@pezhwan/core';
import { rateLimit } from './rateLimit.ts';

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

const deviceFrom = (req: Request) => ({
  ip: req.ip ?? req.socket?.remoteAddress ?? '',
  userAgent: req.headers['user-agent'] ?? '',
});

export function createAuthRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const engine = runtime.auth;
  const byUser = (req: Request) =>
    (req as PezhwanRequest).pezhwan?.userId ?? req.ip ?? '';

  router.post(
    '/register',
    rateLimit(runtime, { type: 'register' }),
    async (req: PezhwanRequest, res: Response) => {
    const { email, phone, password, metadata } = (req.body ?? {}) as Record<
      string,
      unknown
    >;
    const { user, tokens } = await engine.register({
      tenantId: runtime.config.tenantId,
      applicationId: runtime.config.applicationId,
      email: typeof email === 'string' ? email : undefined,
      phone: typeof phone === 'string' ? phone : undefined,
      password: typeof password === 'string' ? password : undefined,
      metadata: (metadata as Record<string, unknown>) ?? {},
      device: deviceFrom(req),
    });
    ok(res, { user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }, 201);
  });

  router.post(
    '/login',
    rateLimit(runtime, { type: 'login' }),
    async (req: PezhwanRequest, res: Response) => {
    const { email, phone, password } = (req.body ?? {}) as Record<string, string>;
    if (typeof password !== 'string') {
      throw new ValidationError('Password is required', 'PASSWORD_REQUIRED');
    }
    const result = await engine.loginPassword({
      applicationId: runtime.config.applicationId,
      email: typeof email === 'string' ? email : undefined,
      phone: typeof phone === 'string' ? phone : undefined,
      password,
      device: deviceFrom(req),
    });
    if (result.mfaRequired) {
      ok(res, { mfaRequired: true, userId: result.userId });
      return;
    }
    ok(res, { user: result.user, accessToken: result.tokens!.accessToken, refreshToken: result.tokens!.refreshToken });
  });

  router.post(
    '/logout',
    rateLimit(runtime, { type: 'api', scope: byUser }),
    async (req: PezhwanRequest, res: Response) => {
    const sessionId = req.pezhwan?.sessionId;
    if (sessionId) {
      await runtime.sessions.revoke(sessionId);
    }
    ok(res, { message: 'Logged out' });
  });

  router.post(
    '/refresh',
    rateLimit(runtime, { type: 'refresh' }),
    async (req: PezhwanRequest, res: Response) => {
    const { refreshToken } = (req.body ?? {}) as { refreshToken?: string };
    if (typeof refreshToken !== 'string' || !refreshToken) {
      throw new AuthenticationError(
        'Refresh token is required',
        'REFRESH_TOKEN_REQUIRED',
      );
    }
    const result = await engine.refreshSession(refreshToken, deviceFrom(req));
    ok(res, {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  });

  router.post(
    '/otp/send',
    rateLimit(runtime, { type: 'otp' }),
    async (req: PezhwanRequest, res: Response) => {
    const { channel, target, purpose } = (req.body ?? {}) as Record<string, string>;
    if (!channel || !target || !purpose) {
      throw new ValidationError(
        'channel, target and purpose are required',
        'OTP_PARAMS_REQUIRED',
      );
    }
    const result = await engine.requestOtp({
      applicationId: runtime.config.applicationId,
      channel: channel as 'email' | 'phone',
      target,
      purpose: purpose as 'login' | 'password_reset' | 'verify_email',
    });
    ok(res, result);
  });

  router.post(
    '/otp/verify',
    rateLimit(runtime, { type: 'otp' }),
    async (req: PezhwanRequest, res: Response) => {
    const { channel, target, purpose, code } = (req.body ?? {}) as Record<string, string>;
    if (!channel || !target || !purpose || !code) {
      throw new ValidationError(
        'channel, target, purpose and code are required',
        'OTP_PARAMS_REQUIRED',
      );
    }
    // OTP verify returns { verified }. For purpose-specific flows
    // the caller uses login/password-reset/email-verify endpoints instead.
    const { verified } = await engine.verifyOtp({
      channel: channel as 'email' | 'phone',
      target,
      purpose: purpose as 'login' | 'password_reset' | 'verify_email',
      code,
    });
    ok(res, { verified });
  });

  router.post(
    '/otp/login',
    rateLimit(runtime, { type: 'otp' }),
    async (req: PezhwanRequest, res: Response) => {
    const { channel, target, code } = (req.body ?? {}) as Record<string, string>;
    if (!channel || !target || !code) {
      throw new ValidationError(
        'channel, target and code are required',
        'OTP_PARAMS_REQUIRED',
      );
    }
    const result = await engine.loginOtp({
      applicationId: runtime.config.applicationId,
      channel: channel as 'email' | 'phone',
      target,
      code,
      device: deviceFrom(req),
    });
    if (result.mfaRequired) {
      ok(res, { mfaRequired: true, userId: result.userId });
      return;
    }
    ok(res, {
      user: result.user,
      accessToken: result.tokens!.accessToken,
      refreshToken: result.tokens!.refreshToken,
    });
  });

  router.post(
    '/password/change',
    rateLimit(runtime, { type: 'api', scope: byUser }),
    async (req: PezhwanRequest, res: Response) => {
    const { currentPassword, newPassword } = (req.body ?? {}) as Record<string, string>;
    if (!req.pezhwan) {
      throw new AuthenticationError('Authentication required', 'UNAUTHENTICATED');
    }
    await engine.changePassword({
      userId: req.pezhwan.userId,
      applicationId: runtime.config.applicationId,
      currentPassword: currentPassword ?? '',
      newPassword: newPassword ?? '',
    });
    ok(res, { message: 'Password changed' });
  });

  router.post(
    '/password/reset',
    rateLimit(runtime, { type: 'otp' }),
    async (req: PezhwanRequest, res: Response) => {
    const { channel, target, code, newPassword } = (req.body ?? {}) as Record<string, string>;
    const result = await engine.resetPassword({
      applicationId: runtime.config.applicationId,
      channel: (channel as 'email' | 'phone') ?? 'email',
      target: target ?? '',
      code: code ?? '',
      newPassword: newPassword ?? '',
      device: deviceFrom(req),
    });
    ok(res, { refreshToken: result.tokens.refreshToken });
  });

  router.post(
    '/password/forgot',
    rateLimit(runtime, { type: 'otp' }),
    async (req: PezhwanRequest, res: Response) => {
    const { email, redirectUri } = (req.body ?? {}) as Record<string, string>;
    if (!email || typeof email !== 'string') {
      throw new ValidationError('email is required', 'EMAIL_REQUIRED');
    }
    const result = await engine.forgotPassword({
      applicationId: runtime.config.applicationId,
      email,
      redirectUri: typeof redirectUri === 'string' ? redirectUri : undefined,
    });
    ok(res, result);
  });

  router.post(
    '/email/verify',
    rateLimit(runtime, { type: 'otp' }),
    async (req: PezhwanRequest, res: Response) => {
    const { email, code } = (req.body ?? {}) as Record<string, string>;
    await engine.verifyEmail({
      applicationId: runtime.config.applicationId,
      email: email ?? '',
      code: code ?? '',
    });
    ok(res, { message: 'Email verified' });
  });

  return router;
}

export function createSessionRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const byUser = (req: Request) =>
    (req as PezhwanRequest).pezhwan?.userId ?? req.ip ?? '';

  router.get(
    '/',
    rateLimit(runtime, { type: 'api', scope: byUser }),
    async (req: PezhwanRequest, res: Response) => {
    if (!req.pezhwan) {
      throw new AuthenticationError('Authentication required', 'UNAUTHENTICATED');
    }
    const sessions = await runtime.sessions.listActive(
      req.pezhwan.userId,
      runtime.config.applicationId,
    );
    ok(res, { sessions });
  });

  router.post(
    '/all/revoke',
    rateLimit(runtime, { type: 'api', scope: byUser }),
    async (req: PezhwanRequest, res: Response) => {
    if (!req.pezhwan) {
      throw new AuthenticationError('Authentication required', 'UNAUTHENTICATED');
    }
    await runtime.sessions.revokeAll(
      req.pezhwan.userId,
      runtime.config.applicationId,
    );
    ok(res, { message: 'All sessions revoked' });
  });

  router.post(
    '/:id/revoke',
    rateLimit(runtime, { type: 'api', scope: byUser }),
    async (req: PezhwanRequest, res: Response) => {
    if (!req.pezhwan) {
      throw new AuthenticationError('Authentication required', 'UNAUTHENTICATED');
    }
    const { id: rawId } = req.params;
    if (!rawId || Array.isArray(rawId)) {
      throw new ValidationError('Session id is required', 'SESSION_ID_REQUIRED');
    }
    const id: string = rawId;
    const sessions = await runtime.sessions.listActive(
      req.pezhwan.userId,
      runtime.config.applicationId,
    );
    const mine = sessions.some((s) => String(s._id) === id);
    if (!mine) {
      throw new AuthenticationError(
        'Session not found',
        'SESSION_NOT_FOUND',
      );
    }
    await runtime.sessions.revoke(id);
    ok(res, { message: 'Session revoked' });
  });

  return router;
}