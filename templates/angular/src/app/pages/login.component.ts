import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-login',
  template: `
    <main>
      <h1>Sign in</h1>
      <form (ngSubmit)="onSubmit()">
        <label>
          Email
          <input type="email" [(ngModel)]="email" name="email" autocomplete="email" required />
        </label>
        <label>
          Password
          <input
            type="password"
            [(ngModel)]="password"
            name="password"
            autocomplete="current-password"
            required
          />
        </label>
        <button type="submit">Sign in</button>
      </form>
      <p *ngIf="error" role="alert">{{ error }}</p>
    </main>
  `,
})
export class LoginComponent {
  email = '';
  password = '';
  error = '';

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  async onSubmit(): Promise<void> {
    this.error = '';
    try {
      await this.auth.login({ email: this.email, password: this.password });
      await this.router.navigate(['/profile']);
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }
}