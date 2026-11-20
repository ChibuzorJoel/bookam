import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_URL } from '../core/api.config';
import { ApiError, AuthService } from './auth.service';

export interface OwnerReview {
  _id: string;
  rating: number;
  comment?: string;
  customerName: string;
  serviceName?: string;
  reply?: string;
  hidden: boolean;
  createdAt: string;
}

export interface ReviewList {
  reviews: OwnerReview[];
  summary: { count: number; average: number };
  meta: { page: number; limit: number; total: number; pages?: number; totalPages?: number };
}

@Injectable({ providedIn: 'root' })
export class ReviewsService {
  private readonly base = `${API_URL}/me/reviews`;

  constructor(private readonly http: HttpClient) {}

  list(page = 1): Observable<ReviewList> {
    const params = new HttpParams().set('page', page).set('limit', 20);
    return this.http.get<{ data: ReviewList }>(this.base, { params }).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  update(id: string, body: { reply?: string; hidden?: boolean }): Observable<OwnerReview> {
    return this.http.patch<{ data: { review: OwnerReview } }>(`${this.base}/${encodeURIComponent(id)}`, body).pipe(
      map((r) => r.data.review),
      catchError((e) => this.fail(e))
    );
  }

  private fail(err: unknown): Observable<never> {
    return throwError(() => AuthService.toApiError(err) as ApiError);
  }
}