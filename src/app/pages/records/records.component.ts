import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { finalize } from 'rxjs/operators';

import { ApiError } from '../../services/auth.service';
import { BookingAction, BookingStatus, DashBooking, DashOrder, DashboardService, OrderStatus } from '../../services/dashboard.service';
import { RecordsApi } from '../../services/records.service';

type Tab = 'bookings' | 'orders';

const LAGOS = 'Africa/Lagos';

const BOOKING_FILTERS: { value: BookingStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no_show', label: 'No show' },
];

const ORDER_FILTERS: { value: OrderStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'completed', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_TEXT: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  completed: 'Done',
  cancelled: 'Cancelled',
  no_show: 'No show',
  new: 'New',
  contacted: 'Contacted',
};

@Component({
  selector: 'app-records',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './records.component.html',
  styleUrls: ['./records.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordsComponent implements OnInit, OnDestroy {
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'bookings', label: 'Bookings' },
    { key: 'orders', label: 'Orders' },
  ];
  readonly bookingFilters = BOOKING_FILTERS;
  readonly orderFilters = ORDER_FILTERS;

  tab: Tab = 'bookings';
  bookingFilter: BookingStatus | '' = '';
  orderFilter: OrderStatus | '' = '';

  bookings: DashBooking[] = [];
  orders: DashOrder[] = [];
  bookingsMore = false;
  ordersMore = false;
  private bookingPage = 0;
  private orderPage = 0;

  loading = false;
  error = '';
  toast = '';
  busyId = '';

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly isBrowser: boolean;
  private readonly money = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

  constructor(
    private readonly records: RecordsApi,
    private readonly dash: DashboardService,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.title.setTitle('Bookings and orders | LagosPages');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    const wanted = this.route.snapshot.data['tab'] as Tab | undefined;
    if (wanted === 'orders') {
      this.tab = 'orders';
    }
    if (this.isBrowser) {
      this.reload();
    }
  }

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  /* ---------------- Display ---------------- */
  naira(kobo: number): string {
    return `₦${this.money.format((kobo ?? 0) / 100)}`;
  }

  statusText(s: string): string {
    return STATUS_TEXT[s] ?? s;
  }

  when(iso: string): string {
    return new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: LAGOS }).format(new Date(iso));
  }

  day(iso: string): string {
    return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: LAGOS }).format(new Date(iso));
  }

  /** 234803... or 0803... to a wa.me link. */
  wa(phone: string): string {
    const d = (phone ?? '').replace(/\D/g, '');
    return `https://wa.me/${d.startsWith('0') ? `234${d.slice(1)}` : d}`;
  }

  actionsFor(b: DashBooking): { action: BookingAction; label: string; danger?: boolean }[] {
    switch (b.status) {
      case 'pending':
        return [{ action: 'confirm', label: 'Confirm' }, { action: 'cancel', label: 'Cancel', danger: true }];
      case 'confirmed':
        return [
          { action: 'complete', label: 'Mark done' },
          { action: 'no_show', label: 'No show' },
          { action: 'cancel', label: 'Cancel', danger: true },
        ];
      default:
        return [];
    }
  }

  orderNext(o: DashOrder): { status: OrderStatus; label: string; danger?: boolean }[] {
    switch (o.status) {
      case 'new':
        return [{ status: 'contacted', label: 'Mark contacted' }, { status: 'cancelled', label: 'Cancel', danger: true }];
      case 'contacted':
        return [{ status: 'completed', label: 'Mark done' }, { status: 'cancelled', label: 'Cancel', danger: true }];
      default:
        return [];
    }
  }

  itemsText(o: DashOrder): string {
    return o.items.map((i) => `${i.qty} x ${i.name}`).join(', ');
  }

  trackById(_: number, r: { _id: string }): string {
    return r._id;
  }

  /* ---------------- Loading ---------------- */
  setTab(t: Tab): void {
    this.tab = t;
    if (this.isBrowser && ((t === 'bookings' && !this.bookingPage) || (t === 'orders' && !this.orderPage))) {
      this.reload();
    }
    this.cdr.markForCheck();
  }

  filterBookings(v: BookingStatus | ''): void {
    this.bookingFilter = v;
    this.reload();
  }

  filterOrders(v: OrderStatus | ''): void {
    this.orderFilter = v;
    this.reload();
  }

  /** Starts the current tab's list again from page 1. */
  reload(): void {
    if (this.tab === 'bookings') {
      this.bookings = [];
      this.bookingPage = 0;
    } else {
      this.orders = [];
      this.orderPage = 0;
    }
    this.more();
  }

  more(): void {
    if (this.loading) {
      return;
    }
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();

    const stop = (): void => {
      this.loading = false;
      this.cdr.markForCheck();
    };
    const fail = (e: ApiError): void => {
      this.error = e.message;
      this.cdr.markForCheck();
    };

    if (this.tab === 'bookings') {
      const page = this.bookingPage + 1;
      this.records
        .bookings(page, this.bookingFilter || undefined)
        .pipe(finalize(stop))
        .subscribe({
          next: (p) => {
            this.bookings = [...this.bookings, ...p.items];
            this.bookingsMore = p.more;
            this.bookingPage = page;
            this.cdr.markForCheck();
          },
          error: fail,
        });
    } else {
      const page = this.orderPage + 1;
      this.records
        .orders(page, this.orderFilter || undefined)
        .pipe(finalize(stop))
        .subscribe({
          next: (p) => {
            this.orders = [...this.orders, ...p.items];
            this.ordersMore = p.more;
            this.orderPage = page;
            this.cdr.markForCheck();
          },
          error: fail,
        });
    }
  }

  /* ---------------- Actions ---------------- */
  actOnBooking(b: DashBooking, action: BookingAction): void {
    if (this.busyId) {
      return;
    }
    if (action === 'cancel' && this.isBrowser && !window.confirm(`Cancel ${b.customerName}'s booking? They will not be notified automatically.`)) {
      return;
    }
    this.busyId = b._id;
    this.dash
      .updateBooking(b._id, action)
      .pipe(
        finalize(() => {
          this.busyId = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          const next: Record<BookingAction, BookingStatus> = { confirm: 'confirmed', cancel: 'cancelled', complete: 'completed', no_show: 'no_show' };
          this.patchBooking(b._id, next[action]);
          this.say('Booking updated.');
        },
        error: (e: ApiError) => this.say(e.message),
      });
  }

  actOnOrder(o: DashOrder, status: OrderStatus): void {
    if (this.busyId) {
      return;
    }
    this.busyId = o._id;
    this.dash
      .updateOrder(o._id, status)
      .pipe(
        finalize(() => {
          this.busyId = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.orders = this.orders.map((x) => (x._id === o._id ? { ...x, status } : x));
          this.say('Order updated.');
        },
        error: (e: ApiError) => this.say(e.message),
      });
  }

  private patchBooking(id: string, status: BookingStatus): void {
    this.bookings = this.bookings.map((x) => (x._id === id ? { ...x, status } : x));
  }

  private say(message: string): void {
    this.toast = message;
    this.cdr.markForCheck();
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    if (this.isBrowser) {
      this.toastTimer = setTimeout(() => {
        this.toast = '';
        this.cdr.markForCheck();
      }, 3000);
    }
  }
}