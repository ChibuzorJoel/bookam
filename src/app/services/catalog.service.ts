import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { API_URL } from '../core/api.config';
import { AuthService } from './auth.service';

/* Money is in kobo everywhere (₦1,500 = 150000). */

export interface CatalogProduct {
  _id: string;
  name: string;
  description?: string;
  category?: string;
  price: number;
  imageUrls: string[];
  inStock: boolean;
  active: boolean;
}

export interface CatalogService {
  _id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  depositAmount: number;
  bufferMinutes: number;
  active: boolean;
}

export interface ServiceInput {
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  depositAmount: number;
  bufferMinutes: number;
  active: boolean;
}

interface Envelope<T> {
  status: 'success';
  message?: string;
  data: T;
}

/** The owner's catalog: products (with photos) and bookable services. */
@Injectable({ providedIn: 'root' })
export class CatalogApi {
  private readonly base = `${API_URL}/me`;

  constructor(private readonly http: HttpClient) {}

  /* ---------------- Products ---------------- */
  listProducts(): Observable<{ products: CatalogProduct[]; limit: number | null }> {
    return this.http.get<Envelope<{ products: CatalogProduct[]; limit: number | null }>>(`${this.base}/products`).pipe(
      map((r) => r.data),
      catchError((e) => this.fail(e))
    );
  }

  /** `form` carries the fields and any new `images` files (multipart). */
  createProduct(form: FormData): Observable<CatalogProduct> {
    return this.http.post<Envelope<{ product: CatalogProduct }>>(`${this.base}/products`, form).pipe(
      map((r) => r.data.product),
      catchError((e) => this.fail(e))
    );
  }

  updateProduct(id: string, form: FormData): Observable<CatalogProduct> {
    return this.http.patch<Envelope<{ product: CatalogProduct }>>(`${this.base}/products/${id}`, form).pipe(
      map((r) => r.data.product),
      catchError((e) => this.fail(e))
    );
  }

  /** Quick switches on a card (in stock, visible) send plain JSON. */
  patchProduct(id: string, body: Partial<Pick<CatalogProduct, 'inStock' | 'active'>>): Observable<CatalogProduct> {
    return this.http.patch<Envelope<{ product: CatalogProduct }>>(`${this.base}/products/${id}`, body).pipe(
      map((r) => r.data.product),
      catchError((e) => this.fail(e))
    );
  }

  deleteProduct(id: string): Observable<void> {
    return this.http.delete<Envelope<unknown>>(`${this.base}/products/${id}`).pipe(
      map(() => undefined),
      catchError((e) => this.fail(e))
    );
  }

  /* ---------------- Services ---------------- */
  listServices(): Observable<CatalogService[]> {
    return this.http.get<Envelope<{ services: CatalogService[] }>>(`${this.base}/services`).pipe(
      map((r) => r.data.services),
      catchError((e) => this.fail(e))
    );
  }

  createService(body: ServiceInput): Observable<CatalogService> {
    return this.http.post<Envelope<{ service: CatalogService }>>(`${this.base}/services`, body).pipe(
      map((r) => r.data.service),
      catchError((e) => this.fail(e))
    );
  }

  updateService(id: string, body: Partial<ServiceInput>): Observable<CatalogService> {
    return this.http.patch<Envelope<{ service: CatalogService }>>(`${this.base}/services/${id}`, body).pipe(
      map((r) => r.data.service),
      catchError((e) => this.fail(e))
    );
  }

  /** `archived` is true when the service had bookings, so the server hid it instead of deleting it. */
  deleteService(id: string): Observable<{ archived: boolean; message: string }> {
    return this.http.delete<Envelope<{ archived: boolean }>>(`${this.base}/services/${id}`).pipe(
      map((r) => ({ archived: !!r.data?.archived, message: r.message ?? 'Done.' })),
      catchError((e) => this.fail(e))
    );
  }

  private fail(err: unknown): Observable<never> {
    return throwError(() => AuthService.toApiError(err));
  }
}