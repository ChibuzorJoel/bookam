import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_URL } from '../core/api.config';
import { AuthService } from './auth.service';
import { PlanInfo } from './settings.service';

/** GET /billing/plans is public, so the pricing page works for signed-out visitors. */
@Injectable({ providedIn: 'root' })
export class PricingApi {
  constructor(private readonly http: HttpClient) {}

  plans(): Observable<PlanInfo[]> {
    return this.http.get<{ status: 'success'; data: { plans: PlanInfo[] } }>(`${API_URL}/billing/plans`).pipe(
      map((r) => r.data.plans),
      catchError((e) => throwError(() => AuthService.toApiError(e)))
    );
  }
}