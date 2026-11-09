import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { finalize } from 'rxjs/operators';

import { ApiError } from '../../services/auth.service';
import { Analytics, AnalyticsApi } from '../../services/analytics.service';

const LAGOS = 'Africa/Lagos';
const DAYS = 30;

interface Bar {
  date: string;
  label: string;
  bookings: number;
  orders: number;
  bookingsPct: number;
  ordersPct: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Done',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent implements OnInit {
  loading = true;
  error = '';
  needsUpgrade = false;

  data: Analytics | null = null;
  bars: Bar[] = [];
  totalBookings = 0;
  totalOrders = 0;
  statuses: { key: string; label: string; count: number; pct: number }[] = [];
  topMax = 1;

  private readonly isBrowser: boolean;
  private readonly money = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

  constructor(
    private readonly api: AnalyticsApi,
    private readonly cdr: ChangeDetectorRef,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.title.setTitle('Analytics | LagosPages');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (this.isBrowser) {
      this.load();
    }
  }

  naira(kobo: number): string {
    return `₦${this.money.format((kobo ?? 0) / 100)}`;
  }

  trackByDate(_: number, b: Bar): string {
    return b.date;
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.needsUpgrade = false;
    this.cdr.markForCheck();
    this.api
      .get()
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (d) => {
          this.data = d;
          this.build(d);
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          if (e.code === 'PLAN_UPGRADE_REQUIRED') {
            this.needsUpgrade = true;
          } else {
            this.error = e.message;
          }
          this.cdr.markForCheck();
        },
      });
  }

  /** The API only returns days that had activity, so fill all 30 days (Lagos time) with zeros. */
  private build(d: Analytics): void {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: LAGOS }).format(new Date());
    const base = new Date(`${today}T00:00:00Z`).getTime();
    const bk = new Map(d.bookingsPerDay.map((x) => [x.date, x.count]));
    const od = new Map(d.ordersPerDay.map((x) => [x.date, x.count]));
    const fmt = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: 'UTC' });

    const rows: Omit<Bar, 'bookingsPct' | 'ordersPct'>[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const t = new Date(base - i * 86400000);
      const date = t.toISOString().slice(0, 10);
      rows.push({ date, label: fmt.format(t), bookings: bk.get(date) ?? 0, orders: od.get(date) ?? 0 });
    }
    const max = Math.max(1, ...rows.map((r) => Math.max(r.bookings, r.orders)));
    this.bars = rows.map((r) => ({ ...r, bookingsPct: (r.bookings / max) * 100, ordersPct: (r.orders / max) * 100 }));
    this.totalBookings = rows.reduce((n, r) => n + r.bookings, 0);
    this.totalOrders = rows.reduce((n, r) => n + r.orders, 0);

    const entries = Object.entries(d.bookingsByStatus);
    const sum = Math.max(1, entries.reduce((n, [, c]) => n + c, 0));
    this.statuses = entries
      .map(([key, count]) => ({ key, label: STATUS_LABEL[key] ?? key, count, pct: (count / sum) * 100 }))
      .sort((a, b) => b.count - a.count);
    this.topMax = Math.max(1, ...d.topServices.map((s) => s.count));
  }
}