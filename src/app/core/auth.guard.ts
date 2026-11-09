import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';

import { AuthService } from '../services/auth.service';
import { DASHBOARD_ROUTE } from './api.config';

/**
 * Protects the dashboard. Signed-out visitors go to /login and come back afterwards.
 * The dashboard is client-rendered, so the server pass lets it through and the browser decides.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return true;
  }
  const router = inject(Router);
  return inject(AuthService)
    .ensureSession()
    .pipe(map((ok) => (ok ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } }))));
};

/** For /login: people who are already signed in skip straight to the dashboard. */
export const guestGuard: CanActivateFn = () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return true;
  }
  const router = inject(Router);
  return inject(AuthService)
    .ensureSession()
    .pipe(map((ok) => (ok ? router.createUrlTree([DASHBOARD_ROUTE]) : true)));
};

/** Admin pages: signed in AND role admin. Owners are sent to their own dashboard. */
export const adminGuard: CanActivateFn = (_route, state) => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return true;
  }
  const router = inject(Router);
  const auth = inject(AuthService);
  return auth.ensureSession().pipe(
    map((ok) => {
      if (!ok) {
        return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
      }
      return auth.session?.user.role === 'admin' ? true : router.createUrlTree([DASHBOARD_ROUTE]);
    })
  );
};