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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';

import { LayoutService } from '../../core/layout.service';
import { ApiError } from '../../services/auth.service';
import { OrderStatus, OrderTracking, PublicService } from '../../services/public.service';

const REFRESH_MS = 15000;

interface Step {
  key: string;
  label: string;
}

/**
 * The customer's order page: /:slug/order/:code
 * Shows where the order is, refreshes itself while the order is open, and (for delivery) shows the 4-digit code
 * the customer gives the rider.
 */
@Component({
  selector: 'app-order',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './order.component.html',
  styleUrls: ['./order.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderComponent implements OnInit, OnDestroy {
  slug = '';
  code = '';
  data: OrderTracking | null = null;
  loading = true;
  error = '';

  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly isBrowser: boolean;
  private readonly money = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

  private readonly deliverySteps: Step[] = [
    { key: 'received', label: 'Order received' },
    { key: 'preparing', label: 'Preparing' },
    { key: 'out', label: 'Out for delivery' },
    { key: 'done', label: 'Delivered' },
  ];
  private readonly pickupSteps: Step[] = [
    { key: 'received', label: 'Order received' },
    { key: 'preparing', label: 'Preparing' },
    { key: 'done', label: 'Ready and collected' },
  ];

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
    this.title.setTitle('Your order');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    const params = this.route.snapshot.paramMap;
    this.slug = (params.get('slug') ?? '').toLowerCase();
    this.code = (params.get('code') ?? '').toUpperCase();
    if (this.isBrowser) {
      this.fetch();
    }
  }

  ngOnDestroy(): void {
    this.layout.hideChrome(false);
    this.stopTimer();
  }

  private stopTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private fetch(): void {
    this.api.order(this.code).subscribe({
      next: (d) => {
        this.data = d;
        this.loading = false;
        this.error = '';
        this.stopTimer();
        if (this.isOpen) {
          // Keep the page live so the customer sees "Out for delivery" without refreshing.
          this.timer = setTimeout(() => this.fetch(), REFRESH_MS);
        }
        this.cdr.markForCheck();
      },
      error: (e: ApiError) => {
        this.loading = false;
        // A failed refresh should not wipe an order we already showed.
        if (!this.data) {
          this.error = e.message;
        } else {
          this.timer = setTimeout(() => this.fetch(), REFRESH_MS * 2);
        }
        this.cdr.markForCheck();
      },
    });
  }

  retry(): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.fetch();
  }

  /* ---------------- Display ---------------- */
  get isDelivery(): boolean {
    return this.data?.order.fulfilment === 'delivery';
  }

  get isOpen(): boolean {
    const s = this.data?.order.status;
    return !!s && s !== 'delivered' && s !== 'completed' && s !== 'cancelled';
  }

  get isCancelled(): boolean {
    return this.data?.order.status === 'cancelled';
  }

  get isDone(): boolean {
    const s = this.data?.order.status;
    return s === 'delivered' || s === 'completed';
  }

  get steps(): Step[] {
    return this.isDelivery ? this.deliverySteps : this.pickupSteps;
  }

  /** Index of the step the order is on. */
  get stepIndex(): number {
    const s: OrderStatus | undefined = this.data?.order.status;
    if (s === 'delivered' || s === 'completed') {
      return this.steps.length - 1;
    }
    if (s === 'out_for_delivery') {
      return 2;
    }
    if (s === 'preparing') {
      return 1;
    }
    return 0;
  }

  get headline(): string {
    switch (this.data?.order.status) {
      case 'preparing':
        return 'Your order is being prepared';
      case 'out_for_delivery':
        return 'Your order is on its way';
      case 'delivered':
        return 'Delivered. Enjoy!';
      case 'completed':
        return 'Order complete. Thank you!';
      case 'cancelled':
        return 'This order was cancelled';
      default:
        return 'Order received';
    }
  }

  get codeDigits(): string[] {
    return (this.data?.order.deliveryCode ?? '').split('');
  }

  naira(kobo: number): string {
    return `₦${this.money.format((kobo ?? 0) / 100)}`;
  }

  trackStep(_: number, s: Step): string {
    return s.key;
  }
}