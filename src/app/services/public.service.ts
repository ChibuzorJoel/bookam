import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_URL } from '../core/api.config';
import { AuthService, BusinessMode } from './auth.service';
import { StartedPayment } from '../core/payaza';

/* Money is in kobo everywhere (₦1,500 = 150000). */

export interface PublicHour {
  weekday: number; // 0 = Sunday
  openTime?: string;
  closeTime?: string;
  isClosed: boolean;
}

export interface PublicBusiness {
  id: string;
  name: string;
  slug: string;
  tagline?: string;
  description?: string;
  logoUrl?: string;
  whatsappNumber?: string;
  instagram?: string;
  address?: string;
  area?: string;
  theme: string;
  mode: BusinessMode;
  hours: PublicHour[];
  showBadge: boolean;
  acceptsDeposits: boolean;
}

export interface PublicProduct {
  _id: string;
  name: string;
  description?: string;
  category?: string;
  price: number;
  imageUrls: string[];
  inStock: boolean;
}

export interface PublicServiceItem {
  _id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  depositAmount: number;
}

export interface PublicPage {
  business: PublicBusiness;
  products: PublicProduct[];
  services: PublicServiceItem[];
}

export interface BookingView {
  bookingCode: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  paymentStatus: string;
  serviceName?: string;
  startAt: string;
  endAt: string;
  price: number;
  depositAmount: number;
  holdExpiresAt?: string;
  customerName: string;
  customerPhone: string;
  business: { name: string; slug: string; whatsappNumber?: string; address?: string; area?: string };
  whatsappLink: string | null;
}

export interface BookingCreated {
  booking: BookingView;
  payment: (StartedPayment & { accessCode?: string | null; amount: number; holdExpiresAt: string }) | null;
}

export interface BookingRequest {
  serviceId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  notes?: string;
}

export interface OrderRequest {
  customerName: string;
  customerPhone: string;
  note?: string;
  items: { productId: string; qty: number }[];
}

export interface OrderCreated {
  order: { orderCode: string; items: { name: string; price: number; qty: number }[]; total: number; status: string };
  whatsappLink: string;
}

interface Envelope<T> {
  status: 'success';
  data: T;
}

/** Everything the customer-facing page calls. No login, no cookies. */
@Injectable({ providedIn: 'root' })
export class PublicService {
  private readonly base = `${API_URL}/public`;

  constructor(private readonly http: HttpClient) {}

  page(slug: string): Observable<PublicPage> {
    return this.http.get<Envelope<PublicPage>>(`${this.base}/${encodeURIComponent(slug)}`).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  /** Open times such as ["09:00","10:30"] for one service on one day. */
  availability(slug: string, serviceId: string, date: string): Observable<string[]> {
    const params = new HttpParams().set('service_id', serviceId).set('date', date);
    return this.http
      .get<Envelope<{ slots: string[] }>>(`${this.base}/${encodeURIComponent(slug)}/availability`, { params })
      .pipe(
        map((r) => r.data.slots),
        catchError((e) => this.fail(e))
      );
  }

  createBooking(slug: string, body: BookingRequest): Observable<BookingCreated> {
    return this.http.post<Envelope<BookingCreated>>(`${this.base}/${encodeURIComponent(slug)}/bookings`, body).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  createOrder(slug: string, body: OrderRequest): Observable<OrderCreated> {
    return this.http.post<Envelope<OrderCreated>>(`${this.base}/${encodeURIComponent(slug)}/orders`, body).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  booking(code: string): Observable<BookingView> {
    return this.http.get<Envelope<{ booking: BookingView }>>(`${this.base}/bookings/${encodeURIComponent(code)}`).pipe(
      map((r) => r.data.booking),
      catchError((e) => this.fail(e))
    );
  }

  /** Asks the server to re-check a Paystack payment, so the customer is confirmed even if the webhook is late. */
  verifyPayment(reference: string): Observable<void> {
    return this.http.get<unknown>(`${API_URL}/payments/verify/${encodeURIComponent(reference)}`).pipe(
      map(() => undefined),
      catchError((e) => this.fail(e))
    );
  }

  private fail(err: unknown): Observable<never> {
    return throwError(() => AuthService.toApiError(err));
  }
}