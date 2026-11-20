import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { LayoutService } from '../../core/layout.service';
import { ApiError } from '../../services/auth.service';
import { BookingView, PublicService } from '../../services/public.service';

const LAGOS = 'Africa/Lagos';
const POLL_EVERY_MS = 3000;
const POLL_TIMES = 10;

/**
 * Where Paystack sends the customer back to: /:slug/booking/:code?reference=...
 * Re-checks the payment with the server, then shows the booking (and keeps checking for a short while if it is still pending).
 */
@Component({
  selector: 'app-booking-confirmation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './booking-confirmation.component.html',
  styleUrls: ['./booking-confirmation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BookingConfirmationComponent implements OnInit, OnDestroy {
  slug = '';
  code = '';
  booking: BookingView | null = null;
  loading = true;
  error = '';
  /** True while we are still waiting for the payment to be confirmed. */
  waiting = false;

  private polls = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly isBrowser: boolean;
  private readonly money = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

  constructor(
    private readonly api: PublicService,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
    private readonly layout: LayoutService,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.layout.hideChrome(true);
    this.title.setTitle('Your booking');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });

    const params = this.route.snapshot.paramMap;
    const query = this.route.snapshot.queryParamMap;
    this.slug = (params.get('slug') ?? '').toLowerCase();
    this.code = (params.get('code') ?? '').toUpperCase();
    const reference = query.get('reference') ?? query.get('trxref');

    if (!this.isBrowser) {
      return;
    }

    if (reference) {
      // Ask the server to confirm the payment now, so we do not depend on the webhook arriving first.
      this.api
        .verifyPayment(reference)
        .pipe(catchError(() => of(undefined)))
        .subscribe(() => this.fetch());
    } else {
      this.fetch();
    }
  }

  ngOnDestroy(): void {
    this.layout.hideChrome(false);
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  private fetch(): void {
    this.api.booking(this.code).subscribe({
      next: (b) => {
        this.booking = b;
        this.loading = false;
        this.waiting = b.status === 'pending' && this.polls < POLL_TIMES;
        if (this.waiting) {
          this.polls += 1;
          this.timer = setTimeout(() => this.fetch(), POLL_EVERY_MS);
        }
        this.cdr.markForCheck();
      },
      error: (e: ApiError) => {
        this.loading = false;
        this.waiting = false;
        this.error = e.message;
        this.cdr.markForCheck();
      },
    });
  }

  /* ---------------- Display ---------------- */
  get isConfirmed(): boolean {
    return this.booking?.status === 'confirmed' || this.booking?.status === 'completed';
  }

  get isCancelled(): boolean {
    return this.booking?.status === 'cancelled';
  }

  get stillPending(): boolean {
    return this.booking?.status === 'pending' && !this.waiting;
  }

  naira(kobo: number): string {
    return `₦${this.money.format((kobo ?? 0) / 100)}`;
  }

  dateText(iso: string): string {
    return new Intl.DateTimeFormat('en-NG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: LAGOS }).format(
      new Date(iso)
    );
  }

  timeText(iso: string): string {
    return new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: LAGOS })
      .format(new Date(iso))
      .toLowerCase();
  }

  /* ---------------- Review ---------------- */
  readonly starSet = [1, 2, 3, 4, 5];
  rating = 0;
  hoverRating = 0;
  comment = '';
  sending = false;
  reviewError = '';
  thanked = false;

  setRating(n: number): void {
    this.rating = n;
    this.reviewError = '';
  }

  get canReview(): boolean {
    return this.booking?.status === 'completed' && !!this.booking.review?.canReview && !this.thanked;
  }

  submitReview(): void {
    if (!this.booking || this.sending) {
      return;
    }
    if (!this.rating) {
      this.reviewError = 'Tap a star to rate your visit.';
      return;
    }
    this.sending = true;
    this.reviewError = '';
    const text = this.comment.trim();
    this.api
      .submitReview(this.booking.bookingCode, { rating: this.rating, ...(text ? { comment: text } : {}) })
      .subscribe({
        next: () => {
          this.sending = false;
          this.thanked = true;
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.sending = false;
          this.reviewError = e.message;
          if (e.status === 409 && this.booking?.review) {
            this.booking.review.canReview = false;
          }
          this.cdr.markForCheck();
        },
      });
  }

  retry(): void {
    this.loading = true;
    this.error = '';
    this.polls = 0;
    this.cdr.markForCheck();
    this.fetch();
  }
}