import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_URL } from '../core/api.config';
import { AuthService } from './auth.service';
import { PlanKey } from './settings.service';

export type BusinessStatus = 'pending' | 'active' | 'suspended';

export interface AdminBusiness {
  _id: string;
  name: string;
  slug: string;
  status: BusinessStatus;
  suspendedReason?: string;
  plan: PlanKey;
  planExpiresAt?: string;
  mode: string;
  whatsappNumber?: string;
  createdAt: string;
  ownerId?: { phone?: string; email?: string; createdAt?: string; lastLoginAt?: string; status?: string } | null;
}

export interface AdminPage {
  businesses: AdminBusiness[];
  page: number;
  pages: number;
  total: number;
}

export interface AdminStats {
  totals: { verifiedOwners: number; bookings: number; orders: number };
  businessesByPlan: Record<string, number>;
  businessesByStatus: Record<string, number>;
  signupsPerDay: { date: string; count: number }[];
  revenue: {
    subscriptionsTotal: number;
    subscriptionPayments: number;
    monthlyRecurring: number;
    depositVolume: number;
    depositCount: number;
    paystackFees: number;
  };
}

export interface AdminQuery {
  q?: string;
  status?: BusinessStatus;
  plan?: PlanKey;
  page: number;
  limit: number;
}

export interface AdminPatch {
  status?: BusinessStatus;
  suspendedReason?: string;
  plan?: PlanKey;
  planExpiresAt?: string | null;
}

interface Envelope<T> {
  status: 'success';
  data: T;
}

/** /admin/* endpoints. The backend rejects anyone who is not an admin. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly base = `${API_URL}/admin`;

  constructor(private readonly http: HttpClient) {}

  stats(): Observable<AdminStats> {
    return this.http.get<Envelope<AdminStats>>(`${this.base}/stats`).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  businesses(query: AdminQuery): Observable<AdminPage> {
    let params = new HttpParams().set('page', query.page).set('limit', query.limit);
    if (query.q) {
      params = params.set('q', query.q);
    }
    if (query.status) {
      params = params.set('status', query.status);
    }
    if (query.plan) {
      params = params.set('plan', query.plan);
    }
    return this.http
      .get<Envelope<{ businesses: AdminBusiness[]; meta: { page: number; pages: number; total: number } }>>(`${this.base}/businesses`, { params })
      .pipe(
        map((r) => ({ businesses: r.data.businesses, page: r.data.meta.page, pages: r.data.meta.pages, total: r.data.meta.total })),
        catchError((e) => this.fail(e))
      );
  }

  update(id: string, patch: AdminPatch): Observable<AdminBusiness> {
    return this.http.patch<Envelope<{ business: AdminBusiness }>>(`${this.base}/businesses/${id}`, patch).pipe(
      map((r) => r.data.business),
      catchError((e) => this.fail(e))
    );
  }

  private fail(err: unknown): Observable<never> {
    return throwError(() => AuthService.toApiError(err));
  }
}