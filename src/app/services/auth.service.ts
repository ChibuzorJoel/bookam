import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { API_URL } from '../core/api.config';

/* ---------------- Types (mirror the backend responses) ---------------- */
export type BusinessMode = 'shop' | 'booking' | 'both';
export type OtpPurpose = 'signup' | 'login' | 'reset';

export interface AuthUser {
  id: string;
  phone: string;
  email?: string;
  emailVerified?: boolean;
  role: 'owner' | 'admin';
  phoneVerified: boolean;
  createdAt: string;
}

export interface AuthBusiness {
  _id: string;
  name: string;
  slug: string;
  mode: BusinessMode;
  [key: string]: unknown;
}

export interface Session {
  user: AuthUser;
  business: AuthBusiness | null;
}

export interface SignupPayload {
  phone: string;
  businessName: string;
  mode: BusinessMode;
  email?: string;
  password?: string;
  slug?: string;
}

/** A normal shape for every failure, so components never touch HttpErrorResponse. */
export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: { field: string; message: string }[];
}

interface Envelope<T> {
  status: 'success';
  message?: string;
  data: T;
}

/** Tiny flag so visitors who never logged in do not hit /auth/me (and log a 401). The cookie is the real session. */
const HINT_KEY = 'lp_session';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = `${API_URL}/auth`;
  private readonly sessionSubject = new BehaviorSubject<Session | null>(null);
  /** True once we know for sure whether a session exists (after login, logout, or a /auth/me answer). */
  private checked = false;

  readonly session$ = this.sessionSubject.asObservable();
  readonly user$ = this.session$.pipe(map((s) => s?.user ?? null));

  constructor(private readonly http: HttpClient) {}

  get session(): Session | null {
    return this.sessionSubject.value;
  }

  get isLoggedIn(): boolean {
    return this.sessionSubject.value !== null;
  }

  /* ---------------- Calls ---------------- */

  /** Creates the account and business, then texts a 6-digit code. Emits the server message. */
  signup(payload: SignupPayload): Observable<string> {
    return this.http.post<Envelope<{ phone: string }>>(`${this.base}/signup`, payload).pipe(
      map((res) => res.message ?? 'We sent a 6-digit code to your phone.'),
      catchError((err) => this.fail(err))
    );
  }

  /** Same reply whether or not the number is registered, so the message is safe to show as is. */
  requestOtp(phone: string, purpose: OtpPurpose): Observable<string> {
    return this.http.post<Envelope<unknown>>(`${this.base}/request-otp`, { phone, purpose }).pipe(
      map((res) => res.message ?? 'If the number is registered, a code has been sent.'),
      catchError((err) => this.fail(err))
    );
  }

  /** Finishes sign-up or SMS login and starts the session (HttpOnly cookie). */
  verifyOtp(phone: string, otp: string, purpose: 'signup' | 'login'): Observable<Session> {
    return this.http
      .post<Envelope<Session & { token?: string }>>(`${this.base}/verify-otp`, { phone, otp, purpose })
      .pipe(
        map((res) => this.toSession(res.data)),
        tap((s) => this.setSession(s)),
        catchError((err) => this.fail(err))
      );
  }

  /** identifier = phone number or email. */
  login(identifier: string, password: string): Observable<Session> {
    return this.http.post<Envelope<Session & { token?: string }>>(`${this.base}/login`, { identifier, password }).pipe(
      map((res) => this.toSession(res.data)),
      tap((s) => this.setSession(s)),
      catchError((err) => this.fail(err))
    );
  }

  resetPassword(phone: string, otp: string, newPassword: string): Observable<string> {
    return this.http
      .post<Envelope<unknown>>(`${this.base}/reset-password`, { phone, otp, newPassword })
      .pipe(
        map((res) => res.message ?? 'Password updated. Please log in.'),
        catchError((err) => this.fail(err))
      );
  }

  /**
   * Signed-in password change. currentPassword may be omitted only by accounts that never set a password.
   * The server signs out every other device and keeps this one signed in with a fresh cookie.
   */
  changePassword(currentPassword: string, newPassword: string): Observable<string> {
    return this.http
      .post<Envelope<unknown>>(`${this.base}/change-password`, { ...(currentPassword ? { currentPassword } : {}), newPassword })
      .pipe(
        map((res) => res.message ?? 'Password updated.'),
        catchError((err) => this.fail(err))
      );
  }

  /** Step 1 of adding an email: sends a 6-digit code to that address. */
  requestEmailCode(email: string): Observable<string> {
    return this.http.post<Envelope<unknown>>(`${this.base}/email/request`, { email }).pipe(
      map((res) => res.message ?? 'We sent a code to your email.'),
      catchError((err) => this.fail(err))
    );
  }

  /** Step 2: confirms the code. The saved, verified address is merged into the cached session. */
  verifyEmailCode(email: string, otp: string): Observable<AuthUser> {
    return this.http.post<Envelope<{ user: AuthUser }>>(`${this.base}/email/verify`, { email, otp }).pipe(
      map((res) => res.data.user),
      tap((user) => {
        const s = this.sessionSubject.value;
        if (s) {
          this.sessionSubject.next({ user: { ...s.user, ...user }, business: s.business });
        }
      }),
      catchError((err) => this.fail(err))
    );
  }

  /** Always clears the local session, even if the network call fails. */
  logout(): Observable<void> {
    return this.http.post<Envelope<unknown>>(`${this.base}/logout`, {}).pipe(
      map(() => undefined),
      catchError(() => of(undefined)),
      tap(() => this.clearLocal())
    );
  }

  /**
   * Resolves true when the browser holds a valid session. Asks the server once, then answers from memory.
   * Network failures resolve false without caching, so the next navigation tries again.
   */
  ensureSession(): Observable<boolean> {
    if (this.sessionSubject.value) {
      return of(true);
    }
    if (this.checked || !this.hasHint()) {
      return of(false);
    }
    return this.http.get<Envelope<Session>>(`${this.base}/me`).pipe(
      map((res) => this.toSession(res.data)),
      tap((s) => this.setSession(s)),
      map(() => true),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401 || err.status === 403) {
          this.clearLocal();
        }
        return of(false);
      })
    );
  }

  /** Keep the cached business fresh after the owner edits it (for example the name shown on the dashboard). */
  patchBusiness(partial: Partial<AuthBusiness>): void {
    const s = this.sessionSubject.value;
    if (s) {
      this.sessionSubject.next({ user: s.user, business: { ...(s.business ?? ({} as AuthBusiness)), ...partial } });
    }
  }

  /** Forget the session in this tab (used after logout and by the interceptor on a 401). */
  clearLocal(): void {
    this.checked = true;
    this.setHint(false);
    this.sessionSubject.next(null);
  }

  /* ---------------- Helpers ---------------- */

  private setSession(session: Session): void {
    this.checked = true;
    this.setHint(true);
    this.sessionSubject.next(session);
  }

  private toSession(data: Session): Session {
    return { user: data.user, business: data.business ?? null };
  }

  private fail(err: unknown): Observable<never> {
    return throwError(() => AuthService.toApiError(err));
  }

  static toApiError(err: unknown): ApiError {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 0) {
        return {
          status: 0,
          code: 'NETWORK',
          message: 'We could not reach the server. Check your internet connection and try again.',
        };
      }
      const body = err.error as Partial<ApiError> | null;
      return {
        status: err.status,
        code: body?.code ?? 'ERROR',
        message: body?.message ?? 'Something went wrong. Please try again.',
        details: body?.details,
      };
    }
    return { status: 0, code: 'ERROR', message: 'Something went wrong. Please try again.' };
  }

  private hasHint(): boolean {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return false;
    }
  }

  private setHint(on: boolean): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      if (on) {
        localStorage.setItem(HINT_KEY, '1');
      } else {
        localStorage.removeItem(HINT_KEY);
      }
    } catch {
      /* private mode or blocked storage: the cookie still works, only the shortcut is lost */
    }
  }
}