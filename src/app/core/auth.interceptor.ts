import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AuthService } from '../services/auth.service';
import { API_URL } from './api.config';

/**
 * 1. Sends the HttpOnly session cookie with every call to our API (needed because the API is on another origin).
 * 2. If a protected call comes back 401 (session expired or revoked), clears the session and sends the user to /login.
 *    Calls under /auth/ are left alone so a wrong password does not look like an expired session.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_URL)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req.clone({ withCredentials: true })).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !req.url.startsWith(`${API_URL}/auth/`)) {
        auth.clearLocal();
        const returnUrl = router.url.startsWith('/login') ? undefined : router.url;
        router.navigate(['/login'], { queryParams: returnUrl ? { returnUrl } : {} });
      }
      return throwError(() => err);
    })
  );
};