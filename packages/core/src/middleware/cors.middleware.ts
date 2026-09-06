/**
 * PEZHWAN — CORS middleware.
 *
 * Deterministic CORS policy builder: allowed origins, methods, headers, and
 * credentials. Multi-origin support with exact + wildcard-subdomain matching.
 */

export interface CorsOptions {
  origins: string | string[];
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  allowCredentials?: boolean;
  maxAge?: number;
}

export interface CorsResult {
  headers: Record<string, string>;
  preflightOk: boolean;
}

export class CorsMiddleware {
  private readonly methods: string[];
  private readonly allowedHeaders: string[];
  private readonly exposedHeaders: string[];
  private readonly allowCredentials: boolean;
  private readonly maxAge: number;

  constructor(private readonly options: CorsOptions) {
    this.methods = options.methods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
    this.allowedHeaders = options.allowedHeaders ?? ['Authorization', 'Content-Type', 'X-Tenant-Id'];
    this.exposedHeaders = options.exposedHeaders ?? ['X-Request-Id', 'X-Rate-Limit-Remaining'];
    this.allowCredentials = options.allowCredentials ?? true;
    this.maxAge = options.maxAge ?? 600;
  }

  resolve(origin: string | undefined, method: string | undefined, requestHeaders: string): CorsResult {
    if (!origin) {
      // Same-origin / non-browser request — no CORS headers required.
      return { headers: {}, preflightOk: true };
    }
    const allowed = this.isAllowed(origin);
    if (!allowed) {
      // Do not echo the origin; browser blocks the response.
      return { headers: {}, preflightOk: false };
    }
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
    };
    if (this.allowCredentials) headers['Access-Control-Allow-Credentials'] = 'true';
    if (method === 'OPTIONS') {
      const requested = requestHeaders;
      const ok =
        !requested ||
        requested
          .split(',')
          .map((h) => h.trim().toLowerCase())
          .every((h) => this.allowedHeaders.some((a) => a.toLowerCase() === h));
      headers['Access-Control-Allow-Methods'] = this.methods.join(', ');
      headers['Access-Control-Allow-Headers'] = this.allowedHeaders.join(', ');
      headers['Access-Control-Max-Age'] = String(this.maxAge);
      return { headers, preflightOk: ok };
    }
    if (this.exposedHeaders.length) headers['Access-Control-Expose-Headers'] = this.exposedHeaders.join(', ');
    return { headers, preflightOk: true };
  }

  private isAllowed(origin: string): boolean {
    const list = Array.isArray(this.options.origins) ? this.options.origins : [this.options.origins];
    return list.some((entry) => {
      if (entry === '*') return true;
      if (entry === origin) return true;
      if (entry.startsWith('*.')) {
        const suffix = entry.slice(1);
        return origin.endsWith(suffix);
      }
      return false;
    });
  }
}