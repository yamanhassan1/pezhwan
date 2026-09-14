import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService as PezhwanAuthService, type PezhwanUser } from '@pezhwan/angular';

/**
 * App-level auth facade over the PEZHWAN Angular SDK. Thin on purpose —
 * all session handling lives in the SDK's AuthService.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user$: Observable<PezhwanUser | null>;
  readonly isAuthenticated$: Observable<boolean>;

  constructor(private readonly pezhwan: PezhwanAuthService) {
    this.user$ = this.pezhwan.user$;
    this.isAuthenticated$ = this.pezhwan.isAuthenticated$;
  }

  get isAuthenticated(): boolean {
    return this.pezhwan.isAuthenticated;
  }

  user(): PezhwanUser | null {
    return this.pezhwan.user();
  }

  async login(input: { email: string; password: string }): Promise<PezhwanUser> {
    return this.pezhwan.login(input);
  }

  async logout(): Promise<void> {
    await this.pezhwan.logout();
  }
}
