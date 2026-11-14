import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_URL } from '../core/api.config';
import { ApiError, AuthService } from './auth.service';

export interface DeliveryZone {
  id?: string;
  name: string;
  /** Kobo (₦800 = 80000). */
  fee: number;
}

export interface DeliverySettings {
  /** False on a plan that does not include delivery. */
  available: boolean;
  enabled: boolean;
  allowPickup: boolean;
  zones: DeliveryZone[];
}

interface Envelope<T> {
  status: 'success';
  data: T;
}

/** The business's delivery setup (GET/PUT /me/delivery). */
@Injectable({ providedIn: 'root' })
export class DeliveryApi {
  private readonly url = `${API_URL}/me/delivery`;

  constructor(private readonly http: HttpClient) {}

  get(): Observable<DeliverySettings> {
    return this.http.get<Envelope<DeliverySettings>>(this.url).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  save(body: { enabled: boolean; allowPickup: boolean; zones: { name: string; fee: number }[] }): Observable<DeliverySettings> {
    return this.http.put<Envelope<DeliverySettings>>(this.url, body).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  private fail(err: unknown): Observable<never> {
    return throwError(() => AuthService.toApiError(err) as ApiError);
  }
}