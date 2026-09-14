import { Component } from '@angular/core';

@Component({
  selector: 'app-home',
  template: `
    <section>
      <h1>Pezhwan Angular</h1>
      <p>Angular starter wired into the PEZHWAN identity platform.</p>
      <a routerLink="/login">Sign in</a> ·
      <a routerLink="/profile">Profile</a>
    </section>
  `,
})
export class HomeComponent {}
