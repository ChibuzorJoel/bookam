import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_URL } from '../core/api.config';
import { AuthService } from './auth.service';

export type PaymentKind = 'subscription' | 'deposit';

export interface PaymentRow {
  id: string;
  kind: PaymentKind;
  reference: string;
  provider: string;
  amount: number;
  fee: number;
  status: string;
  plan?: string;
  period?: string;
  business: { id: string; name: string; slug: string } | null;
  createdAt: string;
  paidAt?: string;
}

export interface PaymentQuery {
  kind: PaymentKind;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  page: number;
  limit: number;
}

export interface PaymentPage {
  payments: PaymentRow[];
  totals: { amount: number; fees: number; count: number };
  meta: { page: number; pages: number; total: number };
}

export interface BusinessDetail {
  business: {
    _id: string;
    name: string;
    slug: string;
    status: string;
    suspendedReason?: string;
    plan: string;
    planExpiresAt?: string;
    mode: string;
    whatsappNumber?: string;
    createdAt: string;
    owner: { phone?: string; email?: string; emailVerified?: boolean; createdAt?: string; lastLoginAt?: string } | null;
    delivery: { enabled: boolean; zones: number };
  };
  counts: { bookings: number; orders: number; products: number; services: number };
  deposits: { total: number; count: number };
  recentBookings: { _id: string; bookingCode: string; serviceName?: string; customerName: string; startAt: string; status: string; paymentStatus: string; depositAmount: number; price: number }[];
  recentOrders: { _id: string; orderCode: string; customerName: string; total: number; status: string; fulfilment: string; createdAt: string }[];
  subscriptions: { _id: string; plan: string; period: string; amount: number; status: string; startedAt?: string; endsAt?: string; provider?: string; paystackReference: string; createdAt: string }[];
}

export type SupportStatus = 'open' | 'replied' | 'closed';

export interface SupportMessage {
  _id: string;
  name: string;
  contact: string;
  message: string;
  page?: string;
  status: SupportStatus;
  note?: string;
  createdAt: string;
  repliedAt?: string;
}

export interface SupportPage {
  messages: SupportMessage[];
  openCount: number;
  meta: { page: number; pages: number; total: number };
}

interface Envelope<T> {
  status: 'success';
  data: T;
}

/** Admin payments, one-business detail and the support inbox. The public contact form lives here too. */
@Injectable({ providedIn: 'root' })
export class AdminExtraApi {
  private readonly base = `${API_URL}/admin`;

  constructor(private readonly http: HttpClient) {}

  private params(q: PaymentQuery): HttpParams {
    let p = new HttpParams().set('kind', q.kind).set('page', q.page).set('limit', q.limit);
    for (const k of ['status', 'q', 'from', 'to'] as const) {
      if (q[k]) {
        p = p.set(k, q[k] as string);
      }
    }
    return p;
  }

  payments(q: PaymentQuery): Observable<PaymentPage> {
    return this.http.get<Envelope<PaymentPage>>(`${this.base}/payments`, { params: this.params(q) }).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  /** Downloads the CSV with the session cookie. A plain link would not send the cookie to the API host. */
  exportPayments(q: PaymentQuery): Observable<Blob> {
    return this.http.get(`${this.base}/payments/export`, { params: this.params(q), responseType: 'blob' }).pipe(catchError((e) => this.fail(e)));
  }

  business(id: string): Observable<BusinessDetail> {
    return this.http.get<Envelope<BusinessDetail>>(`${this.base}/businesses/${id}`).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  support(status: SupportStatus | '', page: number): Observable<SupportPage> {
    let p = new HttpParams().set('page', page).set('limit', 20);
    if (status) {
      p = p.set('status', status);
    }
    return this.http.get<Envelope<SupportPage>>(`${this.base}/support`, { params: p }).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  updateSupport(id: string, body: { status?: SupportStatus; note?: string }): Observable<SupportMessage> {
    return this.http.patch<Envelope<{ message: SupportMessage }>>(`${this.base}/support/${id}`, body).pipe(
      map((r) => r.data.message),
      catchError((e) => this.fail(e))
    );
  }

  /** Public: the "talk to a person" form in the chat. */
  sendSupport(body: { name: string; contact: string; message: string; page?: string }): Observable<void> {
    return this.http.post<Envelope<unknown>>(`${API_URL}/public/support`, body).pipe(
      map(() => undefined),
      catchError((e) => this.fail(e))
    );
  }

  private fail(err: unknown): Observable<never> {
    return throwError(() => AuthService.toApiError(err));
  }
}