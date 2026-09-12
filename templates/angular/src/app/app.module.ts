import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AppComponent } from './app.component';
import { authGuard } from './auth/auth.guard';
import { PezhwanFeatureModule } from './shared/pezhwan/pezhwan.module';
import { HomeComponent } from './pages/home.component';
import { LoginComponent } from './pages/login.component';
import { ProfileComponent } from './pages/profile.component';

@NgModule({
  declarations: [AppComponent, HomeComponent, LoginComponent, ProfileComponent],
  imports: [
    BrowserModule,
    CommonModule,
    FormsModule,
    PezhwanFeatureModule,
    RouterModule.forRoot([
      { path: '', component: HomeComponent },
      { path: 'login', component: LoginComponent },
      {
        path: 'profile',
        component: ProfileComponent,
        canActivate: [authGuard],
      },
    ]),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}