import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_URL } from '../core/api.config';
import { ApiError, AuthService } from './auth.service';

/* Money is in kobo everywhere (₦1,500 = 150000). */
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
export type BookingAction = 'confirm' | 'cancel' | 'complete' | 'no_show';
export type OrderStatus = 'new' | 'contacted' | 'preparing' | 'out_for_delivery' | 'delivered' | 'completed' | 'cancelled';

export interface DashBooking {
  _id: string;
  bookingCode: string;
  serviceName?: string;
  customerName: string;
  customerPhone: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  paymentStatus: string;
  price: number;
  depositAmount: number;
  notes?: string;
}

export interface DashOrder {
  _id: string;
  orderCode: string;
  customerName: string;
  customerPhone: string;
  items: { name: string; price: number; qty: number }[];
  subtotal?: number;
  deliveryFee?: number;
  total: number;
  fulfilment?: 'pickup' | 'delivery';
  delivery?: { zone: string; address: string; landmark?: string };
  status: OrderStatus;
  createdAt: string;
}

export interface DashStats {
  upcomingConfirmed7d: number;
  awaitingPayment: number;
  newOrders: number;
  ordersLast7Days: number;
  depositsThisMonth: number;
}

export interface DashSummary {
  today: string;
  todaysBookings: DashBooking[];
  recentOrders: DashOrder[];
  stats: DashStats;
}

export interface ShareInfo {
  url: string;
  qrDataUrl: string;
  whatsappStatusLink: string;
  templates: string[];
}

interface Envelope<T> {
  status: 'success';
  data: T;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly base = `${API_URL}/me`;

  constructor(private readonly http: HttpClient) {}

  summary(): Observable<DashSummary> {
    return this.http.get<Envelope<DashSummary>>(`${this.base}/dashboard`).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  share(): Observable<ShareInfo> {
    return this.http.get<Envelope<ShareInfo>>(`${this.base}/share`).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  updateBooking(id: string, action: BookingAction): Observable<void> {
    return this.http.patch<unknown>(`${this.base}/bookings/${id}`, { action }).pipe(
      map(() => undefined),
      catchError((e) => this.fail(e))
    );
  }

  /** `code` is the customer's 4-digit delivery code, needed to mark a delivery order Delivered. */
  updateOrder(id: string, status: OrderStatus, code?: string): Observable<void> {
    return this.http.patch<unknown>(`${this.base}/orders/${id}`, code ? { status, code } : { status }).pipe(
      map(() => undefined),
      catchError((e) => this.fail(e))
    );
  }

  private fail(err: unknown): Observable<never> {
    return throwError(() => AuthService.toApiError(err) as ApiError);
  }
}