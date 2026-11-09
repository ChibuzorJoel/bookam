import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_URL } from '../core/api.config';
import { AuthService } from './auth.service';

export interface DayCount {
  date: string; // YYYY-MM-DD (Lagos)
  count: number;
}

export interface Analytics {
  bookingsPerDay: DayCount[];
  ordersPerDay: DayCount[];
  bookingsByStatus: Record<string, number>;
  topServices: { name: string; count: number }[];
  deposits: { total: number; count: number };
}

/** GET /me/analytics. Pro plan only: other plans get 403 PLAN_UPGRADE_REQUIRED. Last 30 days. */
@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  constructor(private readonly http: HttpClient) {}

  get(): Observable<Analytics> {
    return this.http.get<{ status: 'success'; data: Analytics }>(`${API_URL}/me/analytics`).pipe(
      map((r) => r.data),
      catchError((e) => throwError(() => AuthService.toApiError(e)))
    );
  }
}