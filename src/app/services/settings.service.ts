import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_URL } from '../core/api.config';
import { AuthService, BusinessMode } from './auth.service';
import { StartedPayment } from '../core/payaza';

/* Money is in kobo everywhere (₦1,500 = 150000). */

export type PlanKey = 'free' | 'starter' | 'pro';
export type ThemeKey = 'classic' | 'sunset' | 'ocean' | 'forest' | 'royal' | 'noir';

export interface HourRow {
  weekday: number; // 0 = Sunday
  openTime?: string;
  closeTime?: string;
  isClosed: boolean;
}

export interface BlockedDate {
  _id: string;
  date: string; // YYYY-MM-DD
  startTime?: string;
  endTime?: string;
  reason?: string;
}

export interface OwnerBusiness {
  _id: string;
  name: string;
  slug: string;
  tagline?: string;
  description?: string;
  logoUrl?: string;
  whatsappNumber?: string;
  instagram?: string;
  address?: string;
  area?: string;
  theme: ThemeKey;
  mode: BusinessMode;
  customDomain?: string;
  plan: PlanKey;
  effectivePlan: PlanKey;
  planExpiresAt?: string;
  hours: HourRow[];
  exceptions: BlockedDate[];
  bank?: { bankCode?: string; bankName?: string; accountName?: string; accountLast4?: string };
  planLimits: { maxProducts: number | null; features: PlanFeatures };
}

export interface PlanFeatures {
  booking: boolean;
  deposits: boolean;
  removeBadge: boolean;
  customDomain: boolean;
  reminders: boolean;
  analytics: boolean;
}

export interface BusinessPatch {
  name?: string;
  slug?: string;
  tagline?: string;
  description?: string;
  whatsappNumber?: string;
  instagram?: string;
  address?: string;
  area?: string;
  theme?: ThemeKey;
  mode?: BusinessMode;
  customDomain?: string;
}

export interface Bank {
  name: string;
  code: string;
}

export interface BankInfo {
  bankCode?: string;
  bankName?: string;
  accountName?: string;
  accountLast4?: string;
}

export interface PaymentsOverview {
  bank?: BankInfo;
  payoutsEnabled: boolean;
  totals: { gross: number; fees: number; count: number };
  payments: {
    _id: string;
    amount: number;
    status: string;
    paidAt?: string;
    createdAt: string;
    bookingId?: { bookingCode: string; customerName: string; serviceName?: string; startAt: string } | null;
  }[];
}

export interface PlanInfo {
  key: PlanKey;
  name: string;
  priceKobo: number;
  /** Price for 12 months (10 months charged). 0 on the free plan. */
  annualPriceKobo: number;
  annualSavingKobo: number;
  maxProducts: number | null;
  features: PlanFeatures;
}

export type BillingPeriod = 'monthly' | 'annual';

export interface BillingStatus {
  plan: PlanKey;
  planExpiresAt: string | null;
  active: boolean;
  limits: { maxProducts: number | null; features: PlanFeatures };
  history: { plan: PlanKey; period?: BillingPeriod; amount: number; status: string; startedAt?: string; endsAt?: string; paystackReference: string }[];
  plans: PlanInfo[];
}

interface Envelope<T> {
  status: 'success';
  data: T;
}

/** Everything on the owner's Settings page: profile, hours, payout bank and plan. */
@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly me = `${API_URL}/me`;

  constructor(private readonly http: HttpClient) {}

  /* ---------------- Profile ---------------- */
  business(): Observable<OwnerBusiness> {
    return this.http.get<Envelope<{ business: OwnerBusiness }>>(`${this.me}/business`).pipe(
      map((r) => r.data.business),
      catchError((e) => this.fail(e))
    );
  }

  updateBusiness(patch: BusinessPatch): Observable<OwnerBusiness> {
    return this.http.patch<Envelope<{ business: OwnerBusiness }>>(`${this.me}/business`, patch).pipe(
      map((r) => r.data.business),
      catchError((e) => this.fail(e))
    );
  }

  uploadLogo(file: File): Observable<string> {
    const form = new FormData();
    form.append('logo', file, file.name);
    return this.http.post<Envelope<{ logoUrl: string }>>(`${this.me}/business/logo`, form).pipe(
      map((r) => r.data.logoUrl),
      catchError((e) => this.fail(e))
    );
  }

  /* ---------------- Hours ---------------- */
  saveHours(hours: HourRow[]): Observable<HourRow[]> {
    return this.http.put<Envelope<{ hours: HourRow[] }>>(`${this.me}/hours`, { hours }).pipe(
      map((r) => r.data.hours),
      catchError((e) => this.fail(e))
    );
  }

  addBlocked(body: { date: string; startTime?: string; endTime?: string; reason?: string }): Observable<BlockedDate[]> {
    return this.http.post<Envelope<{ exceptions: BlockedDate[] }>>(`${this.me}/exceptions`, body).pipe(
      map((r) => r.data.exceptions),
      catchError((e) => this.fail(e))
    );
  }

  removeBlocked(id: string): Observable<BlockedDate[]> {
    return this.http.delete<Envelope<{ exceptions: BlockedDate[] }>>(`${this.me}/exceptions/${id}`).pipe(
      map((r) => r.data.exceptions),
      catchError((e) => this.fail(e))
    );
  }

  /* ---------------- Payments ---------------- */
  banks(): Observable<Bank[]> {
    return this.http.get<Envelope<{ banks: Bank[] }>>(`${this.me}/payments/banks`).pipe(
      map((r) => r.data.banks),
      catchError((e) => this.fail(e))
    );
  }

  saveBank(bankCode: string, accountNumber: string): Observable<BankInfo> {
    return this.http.put<Envelope<{ bank: BankInfo }>>(`${this.me}/payments/bank`, { bankCode, accountNumber }).pipe(
      map((r) => r.data.bank),
      catchError((e) => this.fail(e))
    );
  }

  payments(): Observable<PaymentsOverview> {
    return this.http.get<Envelope<PaymentsOverview>>(`${this.me}/payments`).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  /* ---------------- Plan ---------------- */
  billing(): Observable<BillingStatus> {
    return this.http.get<Envelope<BillingStatus>>(`${API_URL}/billing/status`).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  /** Starts a plan payment: either a checkout address to send the owner to (Paystack) or a popup config (Payaza). */
  subscribe(plan: 'starter' | 'pro', period: BillingPeriod = 'monthly'): Observable<StartedPayment> {
    return this.http.post<Envelope<StartedPayment>>(`${API_URL}/billing/subscribe`, { plan, period }).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  /**
   * Asks the server to re-check a plan payment with Paystack right now, so the plan activates even when the
   * webhook is late or cannot reach this environment (localhost). Safe to call repeatedly.
   */
  verifyPlanPayment(reference: string): Observable<boolean> {
    return this.http
      .get<Envelope<{ kind: string; subscriptionStatus?: string }>>(`${API_URL}/payments/verify/${encodeURIComponent(reference)}`)
      .pipe(
        map((r) => r.data.kind === 'subscription' && r.data.subscriptionStatus === 'active'),
        catchError((e) => this.fail(e))
      );
  }

  private fail(err: unknown): Observable<never> {
    return throwError(() => AuthService.toApiError(err));
  }
}