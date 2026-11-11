import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { finalize } from 'rxjs/operators';

import { ApiError } from '../../services/auth.service';
import { PricingApi } from '../../services/pricing.service';
import { PlanFeatures, PlanInfo } from '../../services/settings.service';

const ROWS: { key: keyof PlanFeatures; label: string }[] = [
  { key: 'booking', label: 'Booking calendar' },
  { key: 'deposits', label: 'Deposits with Paystack' },
  { key: 'removeBadge', label: 'No "Powered by" badge' },
  { key: 'customDomain', label: 'Your own domain name' },
  { key: 'reminders', label: 'Appointment reminders' },
  { key: 'analytics', label: 'Analytics' },
];

const FAQ: { q: string; a: string }[] = [
  { q: 'Do you take a cut of my sales?', a: 'No. Deposits go from your customer to your bank account through Paystack. You only pay your plan price. Paystack charges its normal card fees.' },
  { q: 'How does paying for a plan work?', a: 'You pay once on Paystack with a card, bank transfer or USSD. A plan lasts 30 days and does not renew by itself, so you are never charged without you knowing. We remind you before it ends.' },
  { q: 'What happens when my plan ends?', a: 'Your page stays online and your data is kept. You go back to the Free plan limits until you pay again.' },
  { q: 'Can I switch plans?', a: 'Yes. Open Settings, then Plan, and choose another plan whenever you like. Paying early adds days to what you have left.' },
  { q: 'Do my customers need an account?', a: 'No. They pick a time or an item and give a name and phone number. Nothing to install.' },
];

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './pricing.component.html',
  styleUrls: ['./pricing.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingComponent implements OnInit {
  readonly rows = ROWS;
  readonly faq = FAQ;

  plans: PlanInfo[] = [];
  period: 'monthly' | 'annual' = 'monthly';
  loading = true;
  error = '';

  private readonly isBrowser: boolean;
  private readonly money = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

  constructor(
    private readonly api: PricingApi,
    private readonly cdr: ChangeDetectorRef,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.title.setTitle('Pricing | LagosPages');
    this.meta.updateTag({ name: 'description', content: 'Start free. Upgrade for bookings with deposits, your own domain and reminders. Pay monthly, no auto-renewal.' });
    if (this.isBrowser) {
      this.load();
    }
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.api
      .plans()
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (p) => {
          this.plans = p;
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.error = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  price(p: PlanInfo): string {
    const kobo = this.period === 'annual' ? p.annualPriceKobo : p.priceKobo;
    return kobo ? `₦${this.money.format(kobo / 100)}` : '₦0';
  }

  saving(p: PlanInfo): string {
    return `₦${this.money.format(p.annualSavingKobo / 100)}`;
  }

  setPeriod(v: 'monthly' | 'annual'): void {
    this.period = v;
  }

  products(p: PlanInfo): string {
    return p.maxProducts === null ? 'Unlimited products and services' : `Up to ${p.maxProducts} products`;
  }

  has(p: PlanInfo, key: keyof PlanFeatures): boolean {
    return !!p.features[key];
  }

  /** Free goes straight to sign-up; paid plans carry the choice through sign-up to the Plan page. */
  query(p: PlanInfo): Record<string, string> {
    return p.key === 'free' ? { mode: 'signup' } : { mode: 'signup', plan: p.key, period: this.period };
  }

  popular(p: PlanInfo): boolean {
    return p.key === 'starter';
  }
}