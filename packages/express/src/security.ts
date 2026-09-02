/**
 * PEZHWAN — Express security middleware.
 *
 * Provides defense-in-depth HTTP hardening:
 *   - securityHeaders(): HSTS, CSP, X-Content-Type-Options, Referrer-Policy,
 *     Permissions-Policy
 *   - csrfProtection(): same-site double-submit cookie for state-changing requests
 *   - corsAllowlist(): strict origin allowlist for credentialed requests
 *   - requestContext(): requestId / correlationId propagation
 *
 * Never emits `Access-Control-Allow-Origin: *` with credentials.
 */

import type {
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from 'express';
import { SecurityEventError, ValidationError } from '@pezhwan/shared';
import { newRequestId } from '@pezhwan/core';

export interface SecurityHeadersOptions {
  hstsMaxAge?: number;
  includeSubdomains?: boolean;
  csp?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
  frameOptions?: string;
}

const DEFAULT_CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self'",
].join('; ');

export interface CorsOptions {
  /** Exact origins allowed (no wildcards). */
  allowedOrigins: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  allowCredentials?: boolean;
  maxAge?: number;
  /**
   * Credential-free public paths (string prefixes or RegExp) such as
   * `/.well-known/*` discovery metadata. Safe GET/HEAD/OPTIONS requests to
   * these paths echo the requester origin instead of being hard-rejected, so
   * health probes and browser demo pages can read them cross-origin. The
   * response never sets credentials and never uses a wildcard. All other paths
   * retain the strict origin allowlist.
   */
  publicPaths?: Array<string | RegExp>;
}

export interface PezhwanRequestHeaders extends Request {
  requestId?: string;
  correlationId?: string;
  /** Child logger carrying the requestId for downstream handlers. */
  log?: {
    info(msg: string, fields?: Record<string, unknown>): void;
    warn(msg: string, fields?: Record<string, unknown>): void;
    error(msg: string, fields?: Record<string, unknown>): void;
  };
}

/**
 * Set hardened security headers on every response.
 */
export function securityHeaders(
  options: SecurityHeadersOptions = {},
): RequestHandler {
  const hstsMaxAge = options.hstsMaxAge ?? 31_536_000;
  const includeSubdomains = options.includeSubdomains ?? true;
  const csp = options.csp ?? DEFAULT_CSP;
  const referrerPolicy = options.referrerPolicy ?? 'strict-origin-when-cross-origin';
  const permissionsPolicy = options.permissionsPolicy ?? 'camera=(), microphone=(), geolocation=()';
  const frameOptions = options.frameOptions ?? 'DENY';

  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', referrerPolicy);
    res.setHeader('Permissions-Policy', permissionsPolicy);
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Frame-Options', frameOptions);
    const hsts = includeSubdomains ? 'includeSubDomains' : '';
    res.setHeader(
      'Strict-Transport-Security',
      `max-age=${hstsMaxAge}; ${hsts}`.trim(),
    );
    return next();
  };
}

/**
 * Assign a requestId (from the X-Request-Id header or generated) and keep the
 * correlationId (downstream) in sync. Makes the whole pipeline traceable.
 */
export function requestContext(
  runtime: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logger?: any;
  },
  headerName = 'x-request-id',
): RequestHandler {
  return (req: PezhwanRequestHeaders, res: Response, next: NextFunction) => {
    const inbound = req.headers[headerName] as string | undefined;
    const requestId = typeof inbound === 'string' && inbound.length > 0
      ? inbound
      : newRequestId();
    const startedAt = Date.now();
    req.requestId = requestId;
    req.correlationId = requestId;
    res.setHeader(headerName, requestId);
    if (runtime.logger) {
      const child = (runtime.logger as { child?: (f: Record<string, unknown>) => unknown })
        .child?.({ requestId });
      const log = child as
        | { info?: (m: string, f?: Record<string, unknown>) => void; warn?: (m: string, f?: Record<string, unknown>) => void; error?: (m: string, f?: Record<string, unknown>) => void }
        | undefined;
      req.log = {
        info: (m, f) => void (log?.info ?? ((_m: string, _f?: Record<string, unknown>) => {})).call(log, m, f),
        warn: (m, f) => void (log?.warn ?? ((_m: string, _f?: Record<string, unknown>) => {})).call(log, m, f),
        error: (m, f) => void (log?.error ?? ((_m: string, _f?: Record<string, unknown>) => {})).call(log, m, f),
      };
    }
    // Inject X-Response-Time at the moment headers are written (patching
    // writeHead) so we never mutate headers after they are flushed — setting
    // them from a 'finish' listener throws ERR_HTTP_HEADERS_SENT.
    const originalWriteHead = res.writeHead.bind(res);
    res.writeHead = ((statusCode: number, reasonOrHeaders?: unknown, headers?: unknown) => {
      res.setHeader('X-Response-Time', String(Date.now() - startedAt));
      if (headers !== undefined) {
        return originalWriteHead(
          statusCode,
          reasonOrHeaders as string,
          headers as import('node:http').OutgoingHttpHeaders,
        );
      }
      return originalWriteHead(
        statusCode,
        reasonOrHeaders as import('node:http').OutgoingHttpHeaders,
      );
    }) as typeof res.writeHead;
    return next();
  };
}

/**
 * Same-site cookie double-submit CSRF protection for state-changing requests.
 * Requires a non-cookie header (`X-CSRF-Token`) matching the `pezhwan_csrf`
 * cookie. Safe methods (GET/HEAD/OPTIONS/TRACE) pass; on a safe request the
 * cookie is issued (if absent) and any caller can read it for future
 * state-changing calls — standard double-submit cookie pattern.
 */
export function csrfProtection(options: { cookieName?: string; headerName?: string; secure?: boolean } = {}): RequestHandler {
  const CSRF_COOKIE = options.cookieName ?? 'pezhwan_csrf';
  const CSRF_HEADER = options.headerName ?? 'x-csrf-token';
  const secure = options.secure ?? false;
  const safe = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

  return (req: PezhwanRequestHeaders, res: Response, next: NextFunction) => {
    if (safe.has(req.method)) {
      // Issue the double-submit cookie on first contact so browser clients can
      // echo it back via X-CSRF-Token on state-changing requests.
      if (req.cookies?.[CSRF_COOKIE] === undefined) {
        const token = newRequestId().replace(/-/g, '');
        res.cookie(CSRF_COOKIE, token, {
          httpOnly: false,
          sameSite: 'lax',
          secure,
          path: '/',
          maxAge: 60 * 60 * 1000,
        });
      }
      return next();
    }
    const cookie = req.cookies?.[CSRF_COOKIE];
    const header = req.headers[CSRF_HEADER];
    if (
      typeof cookie !== 'string' ||
      !cookie ||
      typeof header !== 'string' ||
      header !== cookie
    ) {
      return next(
        new SecurityEventError(
          'CSRF token mismatch',
          'CSRF_REJECTED',
          { requestId: req.requestId },
        ),
      );
    }
    return next();
  };
}

/**
 * Strict CORS allowlist for credentialed cross-origin requests. Exits 403 for
 * disallowed origins and never emits `Access-Control-Allow-Origin: *` with
 * `Allow-Credentials: true`.
 */
export function corsAllowlist(options: CorsOptions): RequestHandler {
  const allowedMethods = options.allowedMethods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const allowedHeaders = options.allowedHeaders ?? ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'];
  const allowCredentials = options.allowCredentials ?? true;
  const maxAge = options.maxAge ?? 600;
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);
  const publicPaths = options.publicPaths ?? [];

  const isPublicPath = (pathname: string): boolean =>
    publicPaths.some((p) =>
      typeof p === 'string' ? pathname === p || pathname.startsWith(p) : p.test(pathname),
    );

  return (req: PezhwanRequestHeaders, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    const pathname = req.path ?? req.url ?? '';
    const isPublic = isPublicPath(pathname);
    const allowed =
      options.allowedOrigins.includes(origin as string) || (isPublic && safeMethods.has(req.method));

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(', '));
      res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
      res.setHeader('Access-Control-Max-Age', String(maxAge));
      if (origin && allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        // Never echo credentials on public paths.
        if (allowCredentials && !isPublic) {
          res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
      }
      return res.sendStatus(204);
    }

    if (!origin) {
      return next();
    }

    // Public, credential-free safe reads echo the origin (never wildcard,
    // never credentials). All other origins must be explicitly allowlisted.
    if (isPublic && safeMethods.has(req.method)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      return next();
    }

    if (!options.allowedOrigins.includes(origin)) {
      return next(
        new SecurityEventError(
          'Origin is not allowed',
          'ORIGIN_REJECTED',
          { requestId: req.requestId },
        ),
      );
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (allowCredentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    return next();
  };
}