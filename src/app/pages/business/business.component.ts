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
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { Observable, Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { fieldError, phoneValidator } from '../../core/validators';
import { LayoutService } from '../../core/layout.service';
import { ApiError } from '../../services/auth.service';
import {
  BookingCreated,
  OrderCreated,
  PublicBusiness,
  PublicProduct,
  PublicService as PublicApi,
  PublicServiceItem,
} from '../../services/public.service';

type Tab = 'shop' | 'book';
type BookStep = 1 | 2 | 3;

interface CartLine {
  product: PublicProduct;
  qty: number;
}

interface DayOption {
  date: string; // YYYY-MM-DD (Lagos)
  weekday: string; // Mon
  day: number;
  month: string; // Nov
  closed: boolean;
}

const LAGOS = 'Africa/Lagos';
const DAYS_AHEAD = 30;
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The 6 backend themes. `accent` colours the header band and buttons, `ink` is the text on top of it. */
const THEMES: Record<string, { accent: string; ink: string; soft: string }> = {
  classic: { accent: '#08302d', ink: '#ffc21a', soft: '#e6efed' },
  sunset: { accent: '#d9480f', ink: '#ffffff', soft: '#fdebe2' },
  ocean: { accent: '#0b6fa4', ink: '#ffffff', soft: '#e1f0f8' },
  forest: { accent: '#1f6b3a', ink: '#ffffff', soft: '#e3f1e8' },
  royal: { accent: '#5b3fb0', ink: '#ffffff', soft: '#ece7f8' },
  noir: { accent: '#1a1a1a', ink: '#ffffff', soft: '#ececec' },
};

@Component({
  selector: 'app-business',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './business.component.html',
  styleUrls: ['./business.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BusinessComponent implements OnInit, OnDestroy {
  /* ---------------- Page state ---------------- */
  loading = true;
  notFound = false;
  error = '';

  slug = '';
  business: PublicBusiness | null = null;
  products: PublicProduct[] = [];
  services: PublicServiceItem[] = [];
  tab: Tab = 'shop';

  /* ---------------- Shop state ---------------- */
  cart: CartLine[] = [];
  cartOpen = false;
  orderBusy = false;
  orderError = '';
  orderDone: OrderCreated | null = null;

  readonly checkoutForm = new FormGroup({
    customerName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)] }),
    customerPhone: new FormControl('', { nonNullable: true, validators: [Validators.required, phoneValidator] }),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });

  /* ---------------- Booking state ---------------- */
  bookStep: BookStep = 1;
  selectedService: PublicServiceItem | null = null;
  days: DayOption[] = [];
  selectedDate = '';
  slots: string[] = [];
  slotsLoading = false;
  slotsError = '';
  selectedTime = '';
  bookBusy = false;
  bookError = '';

  readonly bookForm = new FormGroup({
    customerName: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)] }),
    customerPhone: new FormControl('', { nonNullable: true, validators: [Validators.required, phoneValidator] }),
    customerEmail: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
  });

  readonly fieldError = fieldError;

  private readonly isBrowser: boolean;
  private routeSub?: Subscription;
  private readonly money = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

  constructor(
    private readonly api: PublicApi,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly layout: LayoutService,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(DOCUMENT) private readonly doc: Document,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  /* ---------------- Lifecycle ---------------- */
  ngOnInit(): void {
    this.layout.hideChrome(true);
    this.routeSub = this.route.paramMap.subscribe((p) => {
      this.slug = (p.get('slug') ?? '').toLowerCase();
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.layout.hideChrome(false);
  }

  /* ---------------- Loading ---------------- */
  load(): void {
    this.loading = true;
    this.notFound = false;
    this.error = '';
    this.cdr.markForCheck();

    this.api
      .page(this.slug)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (page) => {
          this.business = page.business;
          this.products = page.products;
          this.services = page.services;
          this.cart = [];
          this.resetBooking();
          this.days = this.buildDays(page.business);
          this.tab = this.initialTab();
          this.applySeo(page.business);
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          if (e.status === 404) {
            this.notFound = true;
            this.title.setTitle(`Page not found | LagosPages`);
            this.meta.updateTag({ name: 'robots', content: 'noindex' });
          } else {
            this.error = e.message;
          }
          this.cdr.markForCheck();
        },
      });
  }

  private initialTab(): Tab {
    const wanted = this.route.snapshot.queryParamMap.get('tab');
    const canShop = this.canShop;
    const canBook = this.canBook;
    if (wanted === 'book' && canBook) {
      return 'book';
    }
    if (wanted === 'shop' && canShop) {
      return 'shop';
    }
    return canShop && (this.products.length > 0 || !canBook) ? 'shop' : 'book';
  }

  private applySeo(b: PublicBusiness): void {
    const place = b.area ? ` in ${b.area}` : '';
    const description = b.tagline || b.description || `Book or order from ${b.name}${place}. Pay securely with Paystack.`;
    this.title.setTitle(`${b.name}${b.area ? ` | ${b.area}` : ''}`);
    this.meta.updateTag({ name: 'description', content: description.slice(0, 200) });
    this.meta.updateTag({ name: 'robots', content: 'index, follow' });
    this.meta.updateTag({ property: 'og:title', content: b.name });
    this.meta.updateTag({ property: 'og:description', content: description.slice(0, 200) });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    if (b.logoUrl) {
      this.meta.updateTag({ property: 'og:image', content: b.logoUrl });
    }
  }

  /* ---------------- Display helpers ---------------- */
  get canShop(): boolean {
    return !!this.business && this.business.mode !== 'booking';
  }

  get canBook(): boolean {
    return !!this.business && this.business.mode !== 'shop';
  }

  get theme(): { accent: string; ink: string; soft: string } {
    return THEMES[this.business?.theme ?? 'classic'] ?? THEMES['classic'];
  }

  get initials(): string {
    return (this.business?.name ?? '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase();
  }

  get whatsappUrl(): string {
    const n = (this.business?.whatsappNumber ?? '').replace(/\D/g, '');
    return n ? `https://wa.me/${n}` : '';
  }

  get instagramUrl(): string {
    const handle = (this.business?.instagram ?? '').replace(/[^A-Za-z0-9._]/g, '');
    return handle ? `https://instagram.com/${handle}` : '';
  }

  get location(): string {
    return [this.business?.address, this.business?.area].filter(Boolean).join(', ');
  }

  /** Opening hours grouped Monday to Sunday for display. */
  get hoursRows(): { day: string; text: string; closed: boolean }[] {
    const hours = this.business?.hours ?? [];
    return [1, 2, 3, 4, 5, 6, 0].map((wd) => {
      const h = hours.find((x) => x.weekday === wd);
      const closed = !h || h.isClosed || !h.openTime || !h.closeTime;
      return {
        day: WEEKDAY_NAMES[wd],
        closed,
        text: closed ? 'Closed' : `${this.clock(h!.openTime!)} to ${this.clock(h!.closeTime!)}`,
      };
    });
  }

  naira(kobo: number): string {
    return `₦${this.money.format((kobo ?? 0) / 100)}`;
  }

  /** 14:30 becomes 2:30 pm. */
  clock(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    const suffix = h >= 12 ? 'pm' : 'am';
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
  }

  duration(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
  }

  longDate(date: string): string {
    return new Intl.DateTimeFormat('en-NG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
      new Date(`${date}T00:00:00Z`)
    );
  }

  trackById(_i: number, item: { _id: string }): string {
    return item._id;
  }

  trackByDate(_i: number, d: DayOption): string {
    return d.date;
  }

  /* ---------------- Tabs ---------------- */
  setTab(tab: Tab): void {
    this.tab = tab;
    this.cartOpen = false;
  }

  /* ============================== SHOP ============================== */
  get cartCount(): number {
    return this.cart.reduce((n, l) => n + l.qty, 0);
  }

  get cartTotal(): number {
    return this.cart.reduce((n, l) => n + l.qty * l.product.price, 0);
  }

  qtyOf(p: PublicProduct): number {
    return this.cart.find((l) => l.product._id === p._id)?.qty ?? 0;
  }

  add(p: PublicProduct): void {
    if (!p.inStock) {
      return;
    }
    const line = this.cart.find((l) => l.product._id === p._id);
    if (line) {
      line.qty = Math.min(50, line.qty + 1);
    } else {
      this.cart = [...this.cart, { product: p, qty: 1 }];
    }
    this.orderDone = null;
    this.cdr.markForCheck();
  }

  remove(p: PublicProduct): void {
    const line = this.cart.find((l) => l.product._id === p._id);
    if (!line) {
      return;
    }
    line.qty -= 1;
    this.cart = this.cart.filter((l) => l.qty > 0);
    if (!this.cart.length) {
      this.cartOpen = false;
    }
    this.cdr.markForCheck();
  }

  openCart(): void {
    this.cartOpen = true;
    this.orderError = '';
  }

  closeCart(): void {
    this.cartOpen = false;
  }

  sendOrder(): void {
    if (this.orderBusy || !this.cart.length) {
      return;
    }
    if (this.checkoutForm.invalid) {
      this.checkoutForm.markAllAsTouched();
      return;
    }
    const v = this.checkoutForm.getRawValue();
    this.orderBusy = true;
    this.orderError = '';
    this.api
      .createOrder(this.slug, {
        customerName: v.customerName.trim(),
        customerPhone: v.customerPhone.trim(),
        ...(v.note.trim() ? { note: v.note.trim() } : {}),
        items: this.cart.map((l) => ({ productId: l.product._id, qty: l.qty })),
      })
      .pipe(
        finalize(() => {
          this.orderBusy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res) => {
          this.orderDone = res;
          this.cart = [];
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.orderError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  finishOrder(): void {
    this.orderDone = null;
    this.cartOpen = false;
    this.checkoutForm.reset({ customerName: '', customerPhone: '', note: '' });
  }

  /* ============================== BOOKING ============================== */
  /** The next 30 days in Lagos time, with closed weekdays marked. */
  private buildDays(b: PublicBusiness): DayOption[] {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: LAGOS }).format(new Date()); // YYYY-MM-DD
    const start = new Date(`${today}T00:00:00Z`);
    const out: DayOption[] = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const wd = d.getUTCDay();
      const h = b.hours.find((x) => x.weekday === wd);
      out.push({
        date: d.toISOString().slice(0, 10),
        weekday: new Intl.DateTimeFormat('en-NG', { weekday: 'short', timeZone: 'UTC' }).format(d),
        day: d.getUTCDate(),
        month: new Intl.DateTimeFormat('en-NG', { month: 'short', timeZone: 'UTC' }).format(d),
        closed: !h || h.isClosed || !h.openTime || !h.closeTime,
      });
    }
    return out;
  }

  /** A deposit service on a business that has not connected a bank account cannot be booked online yet. */
  needsPayoutSetup(s: PublicServiceItem): boolean {
    return s.depositAmount > 0 && !this.business?.acceptsDeposits;
  }

  chooseService(s: PublicServiceItem): void {
    if (this.needsPayoutSetup(s)) {
      return;
    }
    this.selectedService = s;
    this.selectedDate = '';
    this.selectedTime = '';
    this.slots = [];
    this.bookError = '';
    this.bookStep = 2;
    this.scrollToWizard();
  }

  chooseDate(d: DayOption): void {
    if (d.closed || !this.selectedService) {
      return;
    }
    this.selectedDate = d.date;
    this.selectedTime = '';
    this.slots = [];
    this.slotsError = '';
    this.slotsLoading = true;
    this.cdr.markForCheck();

    const date = d.date;
    this.api
      .availability(this.slug, this.selectedService._id, date)
      .pipe(
        finalize(() => {
          this.slotsLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (slots) => {
          if (this.selectedDate === date) {
            this.slots = slots;
          }
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.slotsError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  chooseTime(t: string): void {
    this.selectedTime = t;
    this.bookError = '';
    this.bookStep = 3;
    this.scrollToWizard();
  }

  backTo(step: BookStep): void {
    this.bookStep = step;
    this.bookError = '';
    this.scrollToWizard();
  }

  resetBooking(): void {
    this.bookStep = 1;
    this.selectedService = null;
    this.selectedDate = '';
    this.selectedTime = '';
    this.slots = [];
    this.bookError = '';
  }

  /** Creates the booking. A deposit sends the customer to Paystack; no deposit goes straight to the confirmation page. */
  submitBooking(): void {
    if (this.bookBusy || !this.selectedService) {
      return;
    }
    if (this.bookForm.invalid) {
      this.bookForm.markAllAsTouched();
      return;
    }
    const v = this.bookForm.getRawValue();
    this.bookBusy = true;
    this.bookError = '';
    this.cdr.markForCheck();

    this.callBooking(
      this.api.createBooking(this.slug, {
        serviceId: this.selectedService._id,
        date: this.selectedDate,
        time: this.selectedTime,
        customerName: v.customerName.trim(),
        customerPhone: v.customerPhone.trim(),
        ...(v.customerEmail.trim() ? { customerEmail: v.customerEmail.trim() } : {}),
        ...(v.notes.trim() ? { notes: v.notes.trim() } : {}),
      })
    );
  }

  private callBooking(request: Observable<BookingCreated>): void {
    request.subscribe({
      next: (res) => {
        if (res.payment && this.isBrowser) {
          // Paystack brings the customer back to /<slug>/booking/<code>, where payment is confirmed.
          this.doc.defaultView?.location.assign(res.payment.authorizationUrl);
          return; // keep the button busy while the browser leaves
        }
        this.bookBusy = false;
        this.router.navigate(['/', this.slug, 'booking', res.booking.bookingCode]);
      },
      error: (e: ApiError) => {
        this.bookBusy = false;
        this.bookError = e.message;
        if (e.code === 'SLOT_TAKEN') {
          // Show fresh times so they can pick again.
          this.bookStep = 2;
          const day = this.days.find((d) => d.date === this.selectedDate);
          if (day) {
            this.chooseDate(day);
          }
        }
        this.cdr.markForCheck();
      },
    });
  }

  private scrollToWizard(): void {
    if (!this.isBrowser) {
      return;
    }
    setTimeout(() => this.doc.getElementById('wizard')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  invalid(control: AbstractControl | null): 'true' | null {
    return control && control.touched && control.invalid ? 'true' : null;
  }
}