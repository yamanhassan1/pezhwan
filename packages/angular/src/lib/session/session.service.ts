/**
 * PEZHWAN — Angular session service.
 *
 * Reactive list of the authenticated user's active sessions with single and
 * bulk revocation against /v1/sessions.
 */

import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, type Observable } from 'rxjs';
import { PEZHWAN_CONFIG, type PezhwanAuthConfig } from '../auth/auth.service.ts';

export interface PezhwanSession {
  _id?: string;
  device?: string;
  ip?: string;
  userAgent?: string;
  createdAt?: string;
  lastActiveAt?: string;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly config: PezhwanAuthConfig;
  private readonly sessionsSubject = new BehaviorSubject<PezhwanSession[]>([]);

  readonly sessions$: Observable<PezhwanSession[]>;

  constructor() {
    this.config = inject(PEZHWAN_CONFIG);
    this.sessions$ = this.sessionsSubject.asObservable();
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const payload = (await this.api('/v1/sessions')) as { data?: { sessions?: PezhwanSession[] } };
      this.sessionsSubject.next(payload.data?.sessions ?? []);
    } catch {
      this.sessionsSubject.next([]);
    }
  }

  async revoke(sessionId: string): Promise<void> {
    await this.api(`/v1/sessions/${sessionId}/revoke`, { method: 'POST' });
    this.sessionsSubject.next(
      this.sessionsSubject.value.filter((s) => String(s._id) !== sessionId),
    );
  }

  async revokeAll(): Promise<void> {
    await this.api('/v1/sessions/all/revoke', { method: 'POST' });
    this.sessionsSubject.next([]);
  }

  private async api(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
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