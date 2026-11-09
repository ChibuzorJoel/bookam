import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { adminGuard, authGuard, guestGuard } from './core/auth.guard';
import { HomeComponent } from './pages/home/home.component';

/**
 * Order matters: the catch-all business page `:slug` must stay LAST,
 * otherwise it would swallow /login, /dashboard and /admin.
 */
const routes: Routes = [
  { path: '', component: HomeComponent, pathMatch: 'full' },

  { path: 'pricing', loadComponent: () => import('./pages/pricing/pricing.component').then((m) => m.PricingComponent) },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent) },

  /* ---------- Owner dashboard ---------- */
  { path: 'dashboard', canActivate: [authGuard], loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
  { path: 'dashboard/catalog', canActivate: [authGuard], loadComponent: () => import('./pages/catalog/catalog.component').then((m) => m.CatalogComponent) },
  { path: 'dashboard/bookings', canActivate: [authGuard], loadComponent: () => import('./pages/records/records.component').then((m) => m.RecordsComponent) },
  { path: 'dashboard/orders', canActivate: [authGuard], data: { tab: 'orders' }, loadComponent: () => import('./pages/records/records.component').then((m) => m.RecordsComponent) },
  { path: 'dashboard/analytics', canActivate: [authGuard], loadComponent: () => import('./pages/analytics/analytics.component').then((m) => m.AnalyticsComponent) },
  { path: 'dashboard/account', canActivate: [authGuard], loadComponent: () => import('./pages/account/account.component').then((m) => m.AccountComponent) },
  { path: 'dashboard/settings', canActivate: [authGuard], loadComponent: () => import('./pages/settings/settings.component').then((m) => m.SettingsComponent) },
  // Paystack sends owners back here after they pay for a plan (?reference=...).
  { path: 'dashboard/billing', canActivate: [authGuard], data: { tab: 'plan' }, loadComponent: () => import('./pages/settings/settings.component').then((m) => m.SettingsComponent) },

  /* ---------- Platform admin ---------- */
  { path: 'admin', canActivate: [adminGuard], loadComponent: () => import('./pages/admin/admin.component').then((m) => m.AdminComponent) },

  /* ---------- Public business pages (keep these last) ---------- */
  { path: ':slug/booking/:code', loadComponent: () => import('./pages/booking-confirmation/booking-confirmation.component').then((m) => m.BookingConfirmationComponent) },
  { path: ':slug', loadComponent: () => import('./pages/business/business.component').then((m) => m.BusinessComponent) },

  { path: '**', redirectTo: '' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled', initialNavigation: 'enabledBlocking' })],
  exports: [RouterModule],
})
export class AppRoutingModule {}