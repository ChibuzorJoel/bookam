import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

import { ApiError, AuthService, Session } from '../../services/auth.service';
import {
  BookingAction,
  BookingStatus,
  DashBooking,
  DashOrder,
  DashStats,
  DashboardService,
  OrderStatus,
  ShareInfo,
} from '../../services/dashboard.service';

const LAGOS = 'Africa/Lagos';

const BOOKING_LABEL: Record<BookingStatus, string> = {
  pending: 'Awaiting payment',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Done',
  no_show: 'No show',
};

const ORDER_LABEL: Record<OrderStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  session: Session | null = null;
  loading = true;
  error = '';
  /** Message after an action (copy, status change). */
  toast = '';
  /** Id of the booking or order being updated, to disable its buttons. */
  busyId = '';

  today = '';
  bookings: DashBooking[] = [];
  orders: DashOrder[] = [];
  stats: DashStats | null = null;
  share: ShareInfo | null = null;
  shareError = '';

  /** From ?plan= after sign-up from the pricing section. */
  plan: 'starter' | 'pro' | null = null;

  readonly orderStatuses: OrderStatus[] = ['new', 'contacted', 'completed', 'cancelled'];

  private readonly isBrowser: boolean;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly money = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

  constructor(
    private readonly auth: AuthService,
    private readonly api: DashboardService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(DOCUMENT) private readonly doc: Document,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  /* ---------------- Lifecycle ---------------- */
  ngOnInit(): void {
    this.title.setTitle('Dashboard | LagosPages');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });

    const p = this.route.snapshot.queryParamMap.get('plan');
    this.plan = p === 'starter' || p === 'pro' ? p : null;
    this.session = this.auth.session;

    if (this.isBrowser) {
      this.load();
    }
  }

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  /* ---------------- Data ---------------- */
  load(): void {
    this.loading = true;
    this.error = '';
    this.shareError = '';
    this.cdr.markForCheck();

    forkJoin({
      summary: this.api.summary(),
      // The share card is a bonus: if it fails the rest of the page still shows.
      share: this.api.share().pipe(
        catchError((e: ApiError) => {
          this.shareError = e.message;
          return of(null);
        })
      ),
    })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ summary, share }) => {
          this.today = summary.today;
          this.bookings = summary.todaysBookings;
          this.orders = summary.recentOrders;
          this.stats = summary.stats;
          this.share = share;
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.error = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  /** Re-reads only the summary after a status change. */
  private refresh(): void {
    this.api.summary().subscribe({
      next: (s) => {
        this.bookings = s.todaysBookings;
        this.orders = s.recentOrders;
        this.stats = s.stats;
        this.cdr.markForCheck();
      },
      error: (e: ApiError) => this.say(e.message),
    });
  }

  /* ---------------- Actions ---------------- */
  actOnBooking(b: DashBooking, action: BookingAction): void {
    if (this.busyId) {
      return;
    }
    if (action === 'cancel' && this.isBrowser && !this.doc.defaultView?.confirm(`Cancel ${b.customerName}'s booking?`)) {
      return;
    }
    this.busyId = b._id;
    this.api
      .updateBooking(b._id, action)
      .pipe(
        finalize(() => {
          this.busyId = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.say('Booking updated.');
          this.refresh();
        },
        error: (e: ApiError) => this.say(e.message),
      });
  }

  setOrderStatus(o: DashOrder, event: Event): void {
    const status = (event.target as HTMLSelectElement).value as OrderStatus;
    if (status === o.status || this.busyId) {
      return;
    }
    this.busyId = o._id;
    this.api
      .updateOrder(o._id, status)
      .pipe(
        finalize(() => {
          this.busyId = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.say('Order updated.');
          this.refresh();
        },
        error: (e: ApiError) => {
          (event.target as HTMLSelectElement).value = o.status; // put the dropdown back
          this.say(e.message);
        },
      });
  }

  copyLink(text?: string): void {
    const value = text ?? this.share?.url;
    if (!value || !this.isBrowser) {
      return;
    }
    const nav = this.doc.defaultView?.navigator;
    if (nav?.clipboard) {
      nav.clipboard.writeText(value).then(
        () => this.say('Copied.'),
        () => this.say('Could not copy. Select the text and copy it yourself.')
      );
    } else {
      this.say('Copy is not available on this browser.');
    }
  }

  logout(): void {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/'));
  }

  /* ---------------- Display helpers ---------------- */
  get businessName(): string {
    return this.session?.business?.name ?? 'your business';
  }

  get planName(): string {
    const plan = (this.session?.business?.['plan'] as string | undefined) ?? 'free';
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  }

  get greeting(): string {
    if (!this.isBrowser) {
      return 'Hello';
    }
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: LAGOS }).format(new Date())
    );
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }

  get todayLabel(): string {
    return this.today
      ? new Intl.DateTimeFormat('en-NG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
          new Date(`${this.today}T00:00:00Z`)
        )
      : '';
  }

  naira(kobo: number): string {
    return `₦${this.money.format((kobo ?? 0) / 100)}`;
  }

  time(iso: string): string {
    return new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: LAGOS })
      .format(new Date(iso))
      .replace(/\s/g, ' ')
      .toLowerCase();
  }

  when(iso: string): string {
    return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', timeZone: LAGOS }).format(new Date(iso));
  }

  bookingLabel(status: BookingStatus): string {
    return BOOKING_LABEL[status] ?? status;
  }

  orderLabel(status: OrderStatus): string {
    return ORDER_LABEL[status] ?? status;
  }

  itemsText(o: DashOrder): string {
    return o.items.map((i) => `${i.qty} x ${i.name}`).join(', ');
  }

  /** Opens a chat with the customer. Phones are stored as 234XXXXXXXXXX, which is what wa.me needs. */
  chatLink(phone: string): string {
    return `https://wa.me/${phone.replace(/\D/g, '')}`;
  }

  trackById(_i: number, item: { _id: string }): string {
    return item._id;
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
      }, 3500);
    }
  }
}