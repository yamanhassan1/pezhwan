/**
 * PEZHWAN — Angular auth service.
 *
 * Owns the authenticated user state (rx `BehaviorSubject`), the access-token
 * storage used by the HTTP interceptor, and the login/logout actions backed by
 * the PEZHWAN REST API. The token is kept in localStorage; refresh uses the
 * httpOnly cookie carried by the browser.
 */

import { Injectable, InjectionToken, inject } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged, map, type Observable } from 'rxjs';

export interface PezhwanAuthConfig {
  baseUrl: string;
  /** localStorage key holding the raw access token (default `pezhwan.access_token`). */
  tokenKey?: string;
}

export const PEZHWAN_CONFIG = new InjectionToken<PezhwanAuthConfig>('PEZHWAN_CONFIG');

export interface PezhwanUser {
  id: string;
  tenantId?: string;
  applicationId?: string;
  email?: string;
  phone?: string;
  roles?: string[];
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly config: PezhwanAuthConfig;
  private readonly tokenKey: string;
  private readonly userSubject = new BehaviorSubject<PezhwanUser | null>(null);

  readonly user$: Observable<PezhwanUser | null>;
  readonly isAuthenticated$: Observable<boolean>;

  constructor() {
    this.config = inject(PEZHWAN_CONFIG);
    this.tokenKey = this.config.tokenKey ?? 'pezhwan.access_token';
    this.user$ = this.userSubject.asObservable();
    this.isAuthenticated$ = this.userSubject.pipe(
      map((user) => user !== null),
      distinctUntilChanged(),
    );
    const cached = this.readToken();
    if (cached) {
      this.restore(cached);
    }
  }

  get isAuthenticated(): boolean {
    return this.userSubject.value !== null;
  }

  user(): PezhwanUser | null {
    return this.userSubject.value;
  }

  accessToken(): string | null {
    return this.readToken();
  }

  private readToken(): string | null {
    try {
      return localStorage.getItem(this.tokenKey);
    } catch {
      return null;
    }
  }

  private writeToken(token: string | null): void {
    try {
      if (token) {
        localStorage.setItem(this.tokenKey, token);
      } else {
        localStorage.removeItem(this.tokenKey);
      }
    } catch {
      /* storage unavailable */
    }
  }

  /** Restore a session from a stored token (best-effort profile fetch). */
  private async restore(_token: string): Promise<void> {
    try {
      const profile = (await this.api('/v1/users/me')) as { data?: PezhwanUser };
      this.userSubject.next(profile.data ?? null);
    } catch {
      this.userSubject.next(null);
    }
  }

  async login(input: { email?: string; phone?: string; password: string }): Promise<PezhwanUser> {
    const body = (await this.api('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    })) as { data?: { user?: PezhwanUser; accessToken?: string } };
    const user = body.data?.user ?? null;
    const token = body.data?.accessToken ?? null;
    this.writeToken(token);
    this.userSubject.next(user);
    if (!user) {
      throw new Error('Login response did not include a user');
    }
    return user;
  }

  async logout(): Promise<void> {
    try {
      await this.api('/v1/auth/logout', { method: 'POST' });
    } catch {
      /* best-effort */
    }
    this.writeToken(null);
    this.userSubject.next(null);
  }

  private async api(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(this.accessToken() ? { Authorization: `Bearer ${this.accessToken()}` } : {}),
        ...(init?.headers ?? {}),
      },
      credentials: 'include',
    });
    const payload = (await res.json().catch(() => ({}))) as {
      data?: unknown;
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(payload.error?.message ?? `Request failed (${res.status})`);
    }
    return payload;
  }
}