import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_URL } from '../core/api.config';
import { AuthService } from './auth.service';
import { BookingAction, BookingStatus, DashBooking, DashOrder, OrderStatus } from './dashboard.service';

export interface Page<T> {
  items: T[];
  /** True when another page probably exists. */
  more: boolean;
}

interface Envelope<T> {
  status: 'success';
  data: T;
}

export const PAGE_SIZE = 20;

/** Full bookings and orders lists (GET /me/bookings, /me/orders). Status changes reuse DashboardService. */
@Injectable({ providedIn: 'root' })
export class RecordsApi {
  private readonly me = `${API_URL}/me`;

  constructor(private readonly http: HttpClient) {}

  bookings(page: number, status?: BookingStatus): Observable<Page<DashBooking>> {
    return this.list<DashBooking>('bookings', ['bookings', 'items', 'results'], page, status);
  }

  orders(page: number, status?: OrderStatus): Observable<Page<DashOrder>> {
    return this.list<DashOrder>('orders', ['orders', 'items', 'results'], page, status);
  }

  private list<T>(path: string, keys: string[], page: number, status?: string): Observable<Page<T>> {
    let params = new HttpParams().set('page', page).set('limit', PAGE_SIZE);
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<Envelope<Record<string, unknown>>>(`${this.me}/${path}`, { params }).pipe(
      map((r) => {
        const d = r.data;
        const items = ((Array.isArray(d) ? d : keys.map((k) => d[k]).find(Array.isArray)) ?? []) as T[];
        const meta = d['meta'] as { pages?: number } | undefined;
        const more = meta?.pages !== undefined ? page < meta.pages : items.length === PAGE_SIZE;
        return { items, more };
      }),
      catchError((e) => throwError(() => AuthService.toApiError(e)))
    );
  }
}

export type { BookingAction };