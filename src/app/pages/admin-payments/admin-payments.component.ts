import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { finalize } from 'rxjs/operators';

import { ApiError } from '../../services/auth.service';
import { AdminExtraApi, PaymentKind, PaymentPage, PaymentQuery } from '../../services/admin-extra.service';

const STATUSES: Record<PaymentKind, string[]> = {
  subscription: ['active', 'expired', 'pending', 'failed'],
  deposit: ['success', 'pending', 'failed', 'abandoned', 'amount_mismatch'],
};

/** Admin > Payments: plan payments and customer deposits, with filters and a CSV download. */
@Component({
  selector: 'app-admin-payments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-payments.component.html',
  styleUrls: ['./admin-payments.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminPaymentsComponent implements OnInit {
  kind: PaymentKind = 'subscription';
  status = '';
  q = '';
  from = '';
  to = '';
  page = 1;

  data: PaymentPage | null = null;
  loading = true;
  exporting = false;
  error = '';

  private readonly isBrowser: boolean;
  private readonly money = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });
  private readonly dateFmt = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

  constructor(
    private readonly api: AdminExtraApi,
    private readonly cdr: ChangeDetectorRef,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  get statuses(): string[] {
    return STATUSES[this.kind];
  }

  ngOnInit(): void {
    this.title.setTitle('Payments | Bookam admin');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (this.isBrowser) {
      this.load();
    }
  }

  setKind(k: PaymentKind): void {
    if (k === this.kind) {
      return;
    }
    this.kind = k;
    this.status = '';
    this.page = 1;
    this.load();
  }

  search(): void {
    this.page = 1;
    this.load();
  }

  go(delta: number): void {
    this.page += delta;
    this.load();
  }

  private query(): PaymentQuery {
    return { kind: this.kind, status: this.status, q: this.q.trim(), from: this.from, to: this.to, page: this.page, limit: 20 };
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.api
      .payments(this.query())
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (d) => (this.data = d),
        error: (e: ApiError) => (this.error = e.message),
      });
  }

  download(): void {
    if (this.exporting || !this.isBrowser) {
      return;
    }
    this.exporting = true;
    this.cdr.markForCheck();
    this.api
      .exportPayments(this.query())
      .pipe(
        finalize(() => {
          this.exporting = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bookam-${this.kind}-payments.csv`;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: (e: ApiError) => (this.error = e.message),
      });
  }

  naira(kobo: number): string {
    return `₦${this.money.format((kobo || 0) / 100)}`;
  }

  date(iso?: string): string {
    return iso ? this.dateFmt.format(new Date(iso)) : '-';
  }

  label(s: string): string {
    return s.replace(/_/g, ' ');
  }

  trackId(_: number, r: { id: string }): string {
    return r.id;
  }
}