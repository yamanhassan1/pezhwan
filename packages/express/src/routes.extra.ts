/**
 * PEZHWAN — Express MFA + verification-token + magic-link routers.
 *
 *   /mfa/setup        — begin TOTP setup (secret + backup codes)
 *   /mfa/enable       — confirm + enable TOTP
 *   /mfa/verify       — verify a TOTP/backup code (step-up / login completion)
 *   /mfa/disable      — disable MFA (requires current code)
 *   /password/forgot  — issue a password-reset verification token
 *   /password/reset/confirm — complete reset with the token
 *   /email/verify-token       — verify email with a token
 *   /magic/send       — send a magic link
 *   /magic/redeem     — exchange a magic-link token for a session
 */

import { Router, type Request, type Response } from 'express';
import { AuthenticationError, ValidationError } from '@pezhwan/shared';
import type { PezhwanRequest } from './index.ts';
import type { PezhwanRuntime } from '@pezhwan/core';
import { rateLimit } from './rateLimit.ts';

function ok(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ success: true, data });
}

const deviceFrom = (req: PezhwanRequest) => ({
  ip: req.ip ?? req.socket?.remoteAddress ?? '',
  userAgent: req.headers['user-agent'] ?? '',
});

export function createMfaRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const mfa = runtime.mfa;
  const byUser = (req: Request) =>
    (req as PezhwanRequest).pezhwan?.userId ?? req.ip ?? '';

  router.post(
    '/setup',
    rateLimit(runtime, { type: 'api', scope: byUser }),
    async (req: PezhwanRequest, res: Response) => {
    if (!req.pezhwan) {
      throw new AuthenticationError('Authentication required', 'UNAUTHENTICATED');
    }
    const result = await mfa.beginSetup(req.pezhwan.userId);
    ok(res, result);
  });

  router.post(
    '/enable',
    rateLimit(runtime, { type: 'api', scope: byUser }),
    async (req: PezhwanRequest, res: Response) => {
    if (!req.pezhwan) {
      throw new AuthenticationError('Authentication required', 'UNAUTHENTICATED');
    }
    const { code } = (req.body ?? {}) as { code?: string };
    if (!code || typeof code !== 'string') {
      throw new ValidationError('code is required', 'CODE_REQUIRED');
    }
    await mfa.enable(req.pezhwan.userId, code);
    ok(res, { message: 'MFA enabled' });
  });

  router.post(
    '/verify',
    rateLimit(runtime, { type: 'mfa', scope: byUser }),
    async (req: PezhwanRequest, res: Response) => {
    if (!req.pezhwan) {
      throw new AuthenticationError('Authentication required', 'UNAUTHENTICATED');
    }
    const { code } = (req.body ?? {}) as { code?: string };
    if (!code || typeof code !== 'string') {
      throw new ValidationError('code is required', 'CODE_REQUIRED');
    }
    const verified = await mfa.verifyMfa(req.pezhwan.userId, code);
    ok(res, { verified });
  });

  router.post(
    '/disable',
    rateLimit(runtime, { type: 'api', scope: byUser }),
    async (req: PezhwanRequest, res: Response) => {
    if (!req.pezhwan) {
      throw new AuthenticationError('Authentication required', 'UNAUTHENTICATED');
    }
    const { code } = (req.body ?? {}) as { code?: string };
    if (!code || typeof code !== 'string') {
      throw new ValidationError('code is required', 'CODE_REQUIRED');
    }
    await mfa.disable(req.pezhwan.userId, code);
    ok(res, { message: 'MFA disabled' });
  });

  // Complete an MFA-challenged login (after /login returned mfaRequired).
  router.post(
    '/login',
    rateLimit(runtime, { type: 'mfa' }),
    async (req: PezhwanRequest, res: Response) => {
    const { userId, code } = (req.body ?? {}) as { userId?: string; code?: string };
    if (!userId || !code) {
      throw new ValidationError('userId and code are required', 'PARAMS_REQUIRED');
    }
    const result = await runtime.auth.verifyMfaLogin({
      userId,
      applicationId: runtime.config.applicationId,
      code,
      device: deviceFrom(req),
    });
    ok(res, {
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
    });
  });

  return router;
}

export function createVerificationRouter(runtime: PezhwanRuntime): Router {
  const router = Router();
  const engine = runtime.auth;

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
    '/password/reset/confirm',
    rateLimit(runtime, { type: 'otp' }),
    async (req: PezhwanRequest, res: Response) => {
    const { token, newPassword } = (req.body ?? {}) as Record<string, string>;
    if (!token || !newPassword) {
      throw new ValidationError('token and newPassword are required', 'PARAMS_REQUIRED');
    }
    const result = await engine.resetPasswordWithToken({
      applicationId: runtime.config.applicationId,
      token,
      newPassword,
      device: deviceFrom(req),
    });
    ok(res, {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      user: result.user,
    });
  });

  router.post(
    '/email/verify-token',
    rateLimit(runtime, { type: 'otp' }),
    async (req: PezhwanRequest, res: Response) => {
    const { token } = (req.body ?? {}) as { token?: string };
    if (!token || typeof token !== 'string') {
      throw new ValidationError('token is required', 'TOKEN_REQUIRED');
    }
    await engine.verifyEmailToken({
      applicationId: runtime.config.applicationId,
      token,
    });
    ok(res, { message: 'Email verified' });
  });

  router.post(
    '/magic/send',
    rateLimit(runtime, { type: 'otp' }),
    async (req: PezhwanRequest, res: Response) => {
    const { email, redirectUri } = (req.body ?? {}) as Record<string, string>;
    if (!email || typeof email !== 'string') {
      throw new ValidationError('email is required', 'EMAIL_REQUIRED');
    }
    const result = await engine.sendMagicLink({
      applicationId: runtime.config.applicationId,
      email,
      redirectUri: typeof redirectUri === 'string' ? redirectUri : undefined,
    });
    ok(res, result);
  });

  router.post(
    '/magic/redeem',
    rateLimit(runtime, { type: 'otp' }),
    async (req: PezhwanRequest, res: Response) => {
    const { token } = (req.body ?? {}) as { token?: string };
    if (!token || typeof token !== 'string') {
      throw new ValidationError('token is required', 'TOKEN_REQUIRED');
    }
    const result = await engine.redeemMagicLink({
      applicationId: runtime.config.applicationId,
      token,
      device: deviceFrom(req),
    });
    ok(res, {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      user: result.user,
      redirectUri: result.redirectUri,
    });
  });

  return router;
}