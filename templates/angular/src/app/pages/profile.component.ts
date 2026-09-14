import { Component } from '@angular/core';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-profile',
  template: `
    <main>
      <h1>Profile</h1>
      <ng-container *ngIf="user$ | async as user; else notSignedIn">
        <dl>
          <dt>ID</dt>
          <dd>{{ user.id }}</dd>
          <dt>Email</dt>
          <dd>{{ user.email }}</dd>
          <dt>Roles</dt>
          <dd>{{ user.roles?.join(', ') ?? '—' }}</dd>
        </dl>
      </ng-container>
      <ng-template #notSignedIn><p>Not signed in</p></ng-template>
      <button type="button" (click)="logout()">Sign out</button>
    </main>
  `,
})
export class ProfileComponent {
  readonly user$ = this.auth.user$;

  constructor(private readonly auth: AuthService) {}

  logout(): void {
    void this.auth.logout();
  }
}
