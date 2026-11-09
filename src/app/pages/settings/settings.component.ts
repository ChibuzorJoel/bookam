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
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';

import { compressImage } from '../../core/image';
import { fieldError, isNigerianPhone, phoneValidator } from '../../core/validators';
import { ApiError, AuthService, BusinessMode } from '../../services/auth.service';
import {
  Bank,
  BankInfo,
  BillingStatus,
  BlockedDate,
  HourRow,
  OwnerBusiness,
  PaymentsOverview,
  PlanInfo,
  SettingsApi,
  ThemeKey,
} from '../../services/settings.service';

type Tab = 'profile' | 'hours' | 'payments' | 'plan';

const LAGOS = 'Africa/Lagos';
const DOMAIN = 'lagospages.ng';
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const POLL_EVERY_MS = 3000;
const POLL_TIMES = 10;

/** Monday first, Sunday last (the backend uses 0 = Sunday). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const THEME_CHOICES: { key: ThemeKey; label: string; accent: string; ink: string }[] = [
  { key: 'classic', label: 'Classic', accent: '#08302d', ink: '#ffc21a' },
  { key: 'sunset', label: 'Sunset', accent: '#d9480f', ink: '#ffffff' },
  { key: 'ocean', label: 'Ocean', accent: '#0b6fa4', ink: '#ffffff' },
  { key: 'forest', label: 'Forest', accent: '#1f6b3a', ink: '#ffffff' },
  { key: 'royal', label: 'Royal', accent: '#5b3fb0', ink: '#ffffff' },
  { key: 'noir', label: 'Noir', accent: '#1a1a1a', ink: '#ffffff' },
];

const slugValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || SLUG_RE.test(String(c.value)) ? null : { slug: true };

/** An open day needs an opening time earlier than its closing time. */
const dayValidator: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  if (g.get('isClosed')?.value) {
    return null;
  }
  const open = g.get('openTime')?.value as string;
  const close = g.get('closeTime')?.value as string;
  if (!open || !close) {
    return { times: true };
  }
  return open < close ? null : { range: true };
};

/** Whole-day blocks need only a date; partial blocks need a start before the end. */
const blockValidator: ValidatorFn = (g: AbstractControl): ValidatorFn | ValidationErrors | null => {
  if (g.get('allDay')?.value) {
    return null;
  }
  const s = g.get('startTime')?.value as string;
  const e = g.get('endTime')?.value as string;
  if (!s || !e) {
    return { times: true };
  }
  return s < e ? null : { range: true };
};

const toLocalPhone = (n?: string): string => {
  const d = (n ?? '').replace(/\D/g, '');
  return d.startsWith('234') ? `0${d.slice(3)}` : d;
};

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsComponent implements OnInit, OnDestroy {
  readonly domain = DOMAIN;
  readonly themes = THEME_CHOICES;
  readonly modes: { value: BusinessMode; title: string; text: string }[] = [
    { value: 'both', title: 'Both', text: 'Products and bookings' },
    { value: 'shop', title: 'Sell products', text: 'Orders on WhatsApp' },
    { value: 'booking', title: 'Take bookings', text: 'Slots and deposits' },
  ];
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'profile', label: 'Profile' },
    { key: 'hours', label: 'Hours' },
    { key: 'payments', label: 'Payments' },
    { key: 'plan', label: 'Plan' },
  ];

  tab: Tab = 'profile';
  loading = true;
  error = '';
  toast = '';
  business: OwnerBusiness | null = null;

  /* ---- profile ---- */
  profileBusy = false;
  profileError = '';
  logoBusy = false;

  readonly profileForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)] }),
    slug: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3), Validators.maxLength(40), slugValidator] }),
    tagline: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(120)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
    whatsappNumber: new FormControl('', { nonNullable: true, validators: [Validators.required, phoneValidator] }),
    instagram: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(60)] }),
    address: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
    area: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    theme: new FormControl<ThemeKey>('classic', { nonNullable: true }),
    mode: new FormControl<BusinessMode>('both', { nonNullable: true }),
    customDomain: new FormControl('', { nonNullable: true }),
  });

  /* ---- hours ---- */
  hoursBusy = false;
  hoursError = '';
  readonly hoursForm = new FormArray<FormGroup>([]);
  blocked: BlockedDate[] = [];
  blockBusy = false;
  blockError = '';
  readonly blockForm = new FormGroup(
    {
      date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      allDay: new FormControl(true, { nonNullable: true }),
      startTime: new FormControl('', { nonNullable: true }),
      endTime: new FormControl('', { nonNullable: true }),
      reason: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
    },
    { validators: [blockValidator as ValidatorFn] }
  );
  todayLagos = '';

  /* ---- payments ---- */
  banks: Bank[] = [];
  banksLoading = false;
  overview: PaymentsOverview | null = null;
  paymentsLoading = false;
  paymentsError = '';
  bankBusy = false;
  bankError = '';
  readonly bankForm = new FormGroup({
    bankCode: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    accountNumber: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{10}$/)] }),
  });

  /* ---- plan ---- */
  billing: BillingStatus | null = null;
  billingLoading = false;
  billingError = '';
  subscribingTo: 'starter' | 'pro' | null = null;
  confirming = false;

  readonly fieldError = fieldError;

  private reference: string | null = null;
  private polls = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly isBrowser: boolean;
  private readonly money = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

  constructor(
    private readonly api: SettingsApi,
    private readonly auth: AuthService,
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
    this.title.setTitle('Settings | LagosPages');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });

    const q = this.route.snapshot.queryParamMap;
    const wanted = (this.route.snapshot.data['tab'] as Tab | undefined) ?? (q.get('tab') as Tab | null);
    if (wanted && this.tabs.some((t) => t.key === wanted)) {
      this.tab = wanted;
    }
    // Paystack sends people back to /dashboard/billing?reference=... after paying for a plan.
    this.reference = q.get('reference') ?? q.get('trxref');

    if (!this.isBrowser) {
      return;
    }
    this.todayLagos = new Intl.DateTimeFormat('en-CA', { timeZone: LAGOS }).format(new Date());
    this.load();
  }

  ngOnDestroy(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();

    this.api
      .business()
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (b) => {
          this.business = b;
          this.fillProfile(b);
          this.fillHours(b.hours);
          this.blocked = this.sortBlocked(b.exceptions ?? []);
          this.openTab(this.tab);
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.error = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  setTab(tab: Tab): void {
    this.tab = tab;
    this.openTab(tab);
  }

  /** Loads the data a tab needs the first time it is opened. */
  private openTab(tab: Tab): void {
    if (tab === 'payments') {
      this.loadPayments();
    }
    if (tab === 'plan') {
      this.loadBilling();
      if (this.reference && !this.confirming && this.polls === 0) {
        this.startConfirming();
      }
    }
  }

  /* ---------------- Display helpers ---------------- */
  naira(kobo: number): string {
    return `₦${this.money.format((kobo ?? 0) / 100)}`;
  }

  dayName(weekday: number): string {
    return DAY_NAMES[weekday];
  }

  longDate(date: string): string {
    return new Intl.DateTimeFormat('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${date}T00:00:00Z`)
    );
  }

  clock(hhmm?: string): string {
    if (!hhmm) {
      return '';
    }
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
  }

  dateText(iso?: string | null): string {
    return iso ? new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: LAGOS }).format(new Date(iso)) : '';
  }

  invalid(c: AbstractControl | null): 'true' | null {
    return c && c.touched && c.invalid ? 'true' : null;
  }

  profileErr(name: string, label: string): string {
    const c = this.profileForm.get(name);
    if (c?.touched && c.errors?.['slug']) {
      return 'Use lowercase letters, numbers and single dashes, like zainab-hair.';
    }
    return fieldError(c, label);
  }

  get canCustomDomain(): boolean {
    return !!this.business?.planLimits.features.customDomain;
  }

  get currentPlan(): string {
    const p = this.billing?.plan ?? this.business?.effectivePlan ?? 'free';
    return p.charAt(0).toUpperCase() + p.slice(1);
  }

  get previewUrl(): string {
    return `${this.domain}/${this.profileForm.controls.slug.value || 'your-business'}`;
  }

  get initials(): string {
    return (this.profileForm.controls.name.value || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase();
  }

  get hoursGroups(): FormGroup[] {
    return this.hoursForm.controls;
  }

  trackByIndex(i: number): number {
    return i;
  }

  /* ============================== PROFILE ============================== */
  private fillProfile(b: OwnerBusiness): void {
    this.profileForm.reset({
      name: b.name,
      slug: b.slug,
      tagline: b.tagline ?? '',
      description: b.description ?? '',
      whatsappNumber: toLocalPhone(b.whatsappNumber),
      instagram: b.instagram ?? '',
      address: b.address ?? '',
      area: b.area ?? '',
      theme: b.theme,
      mode: b.mode,
      customDomain: b.customDomain ?? '',
    });
  }

  onSlugInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const clean = input.value
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+/, '')
      .slice(0, 40);
    if (clean !== input.value) {
      input.value = clean;
    }
    this.profileForm.controls.slug.setValue(clean);
  }

  saveProfile(): void {
    if (this.profileBusy) {
      return;
    }
    const form = this.profileForm;
    form.controls.slug.setValue(form.controls.slug.value.replace(/-+$/, ''));
    if (form.invalid) {
      form.markAllAsTouched();
      this.focusInvalid('.panel--profile');
      return;
    }
    const v = form.getRawValue();
    this.profileBusy = true;
    this.profileError = '';
    this.api
      .updateBusiness({
        name: v.name.trim(),
        slug: v.slug,
        tagline: v.tagline.trim(),
        description: v.description.trim(),
        whatsappNumber: v.whatsappNumber.trim(),
        instagram: v.instagram.trim(),
        address: v.address.trim(),
        area: v.area.trim(),
        theme: v.theme,
        mode: v.mode,
        ...(this.canCustomDomain ? { customDomain: v.customDomain.trim() } : {}),
      })
      .pipe(
        finalize(() => {
          this.profileBusy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (b) => {
          this.business = { ...this.business, ...b };
          this.fillProfile(this.business);
          this.auth.patchBusiness({ name: b.name, slug: b.slug, mode: b.mode });
          this.say('Profile saved.');
        },
        error: (e: ApiError) => {
          this.profileError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  async onLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.logoBusy) {
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.profileError = 'Only JPG, PNG or WebP images are allowed.';
      this.cdr.markForCheck();
      return;
    }
    this.logoBusy = true;
    this.profileError = '';
    this.cdr.markForCheck();

    const small = await compressImage(file, 600, 0.85);
    this.api
      .uploadLogo(small)
      .pipe(
        finalize(() => {
          this.logoBusy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (url) => {
          if (this.business) {
            this.business = { ...this.business, logoUrl: url };
          }
          this.say('Logo updated.');
        },
        error: (e: ApiError) => {
          this.profileError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  /* ============================== HOURS ============================== */
  private fillHours(rows: HourRow[] | undefined): void {
    this.hoursForm.clear();
    WEEK_ORDER.forEach((wd) => {
      const r = rows?.find((x) => x.weekday === wd);
      const closed = r ? r.isClosed : wd === 0;
      this.hoursForm.push(
        new FormGroup(
          {
            weekday: new FormControl(wd, { nonNullable: true }),
            isClosed: new FormControl(closed, { nonNullable: true }),
            openTime: new FormControl(r?.openTime ?? '09:00', { nonNullable: true }),
            closeTime: new FormControl(r?.closeTime ?? '18:00', { nonNullable: true }),
          },
          { validators: [dayValidator] }
        )
      );
    });
  }

  /** Copies Monday's hours to every other day that is open. */
  copyMonday(): void {
    const monday = this.hoursForm.at(0);
    this.hoursForm.controls.slice(1).forEach((g) => {
      if (!g.get('isClosed')?.value) {
        g.patchValue({ openTime: monday.get('openTime')?.value, closeTime: monday.get('closeTime')?.value });
      }
    });
    this.say("Monday's hours copied to the other open days.");
  }

  saveHours(): void {
    if (this.hoursBusy) {
      return;
    }
    if (this.hoursForm.invalid) {
      this.hoursForm.markAllAsTouched();
      this.hoursError = 'Check the days marked in red. Each open day needs an opening time before its closing time.';
      return;
    }
    const hours: HourRow[] = this.hoursForm.controls.map((g) => {
      const v = g.getRawValue();
      return v.isClosed
        ? { weekday: v.weekday, isClosed: true }
        : { weekday: v.weekday, isClosed: false, openTime: v.openTime, closeTime: v.closeTime };
    });
    this.hoursBusy = true;
    this.hoursError = '';
    this.api
      .saveHours(hours)
      .pipe(
        finalize(() => {
          this.hoursBusy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => this.say('Opening hours saved.'),
        error: (e: ApiError) => {
          this.hoursError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  private sortBlocked(list: BlockedDate[]): BlockedDate[] {
    return [...list].sort((a, b) => (a.date + (a.startTime ?? '')).localeCompare(b.date + (b.startTime ?? '')));
  }

  addBlocked(): void {
    if (this.blockBusy) {
      return;
    }
    const f = this.blockForm;
    if (f.invalid) {
      f.markAllAsTouched();
      return;
    }
    const v = f.getRawValue();
    this.blockBusy = true;
    this.blockError = '';
    this.api
      .addBlocked({
        date: v.date,
        ...(v.allDay ? {} : { startTime: v.startTime, endTime: v.endTime }),
        ...(v.reason.trim() ? { reason: v.reason.trim() } : {}),
      })
      .pipe(
        finalize(() => {
          this.blockBusy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (list) => {
          this.blocked = this.sortBlocked(list);
          f.reset({ date: '', allDay: true, startTime: '', endTime: '', reason: '' });
          this.say('Date blocked. Customers will not see it as open.');
        },
        error: (e: ApiError) => {
          this.blockError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  removeBlocked(b: BlockedDate): void {
    this.api.removeBlocked(b._id).subscribe({
      next: (list) => {
        this.blocked = this.sortBlocked(list);
        this.say('Date is open again.');
        this.cdr.markForCheck();
      },
      error: (e: ApiError) => this.say(e.message),
    });
  }

  /* ============================== PAYMENTS ============================== */
  loadPayments(): void {
    if (this.overview || this.paymentsLoading) {
      return;
    }
    this.paymentsLoading = true;
    this.paymentsError = '';
    this.cdr.markForCheck();
    this.api
      .payments()
      .pipe(
        finalize(() => {
          this.paymentsLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (o) => {
          this.overview = o;
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.paymentsError = e.message;
          this.cdr.markForCheck();
        },
      });
    this.loadBanks();
  }

  private loadBanks(): void {
    if (this.banks.length || this.banksLoading) {
      return;
    }
    this.banksLoading = true;
    this.api
      .banks()
      .pipe(
        finalize(() => {
          this.banksLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (list) => {
          this.banks = [...list].sort((a, b) => a.name.localeCompare(b.name));
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.bankError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  onAccountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 10);
    if (digits !== input.value) {
      input.value = digits;
    }
    this.bankForm.controls.accountNumber.setValue(digits);
  }

  saveBank(): void {
    if (this.bankBusy) {
      return;
    }
    if (this.bankForm.invalid) {
      this.bankForm.markAllAsTouched();
      return;
    }
    const { bankCode, accountNumber } = this.bankForm.getRawValue();
    this.bankBusy = true;
    this.bankError = '';
    this.api
      .saveBank(bankCode, accountNumber)
      .pipe(
        finalize(() => {
          this.bankBusy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (bank: BankInfo) => {
          this.overview = {
            bank,
            payoutsEnabled: true,
            totals: this.overview?.totals ?? { gross: 0, fees: 0, count: 0 },
            payments: this.overview?.payments ?? [],
          };
          this.bankForm.reset({ bankCode: '', accountNumber: '' });
          this.say(`Payouts will go to ${bank.accountName}.`);
        },
        error: (e: ApiError) => {
          this.bankError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  /* ============================== PLAN ============================== */
  loadBilling(): void {
    if (this.billingLoading) {
      return;
    }
    this.billingLoading = true;
    this.billingError = '';
    this.cdr.markForCheck();
    this.api
      .billing()
      .pipe(
        finalize(() => {
          this.billingLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (b) => {
          this.billing = b;
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.billingError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  features(plan: PlanInfo): string[] {
    const out: string[] = [plan.maxProducts === null ? 'Unlimited products and services' : `Up to ${plan.maxProducts} products`];
    const f: Record<string, boolean> = { ...plan.features };
    if (f['booking']) {
      out.push('Booking calendar');
    }
    if (f['deposits']) {
      out.push('Deposits with Paystack');
    }
    if (f['removeBadge']) {
      out.push('No "Powered by" badge');
    }
    if (f['customDomain']) {
      out.push('Your own domain name');
    }
    if (f['reminders']) {
      out.push('Appointment reminders');
    }
    if (f['analytics']) {
      out.push('Analytics');
    }
    return out;
  }

  isCurrent(key: string): boolean {
    return (this.billing?.plan ?? 'free') === key;
  }

  subscribe(plan: 'starter' | 'pro'): void {
    if (this.subscribingTo) {
      return;
    }
    this.subscribingTo = plan;
    this.billingError = '';
    this.api.subscribe(plan).subscribe({
      next: (url) => {
        // Paystack brings them back to /dashboard/billing, where the payment is confirmed.
        if (this.isBrowser) {
          this.doc.defaultView?.location.assign(url);
        }
      },
      error: (e: ApiError) => {
        this.subscribingTo = null;
        this.billingError = e.message;
        this.cdr.markForCheck();
      },
    });
  }

  /** After paying, wait for the webhook to activate the plan: look for our payment reference in the history. */
  private startConfirming(): void {
    this.confirming = true;
    this.polls = 0;
    this.cdr.markForCheck();
    this.pollOnce();
  }

  private pollOnce(): void {
    // Ask the server to confirm with Paystack first; the webhook may be late or unreachable (localhost).
    const check$ = this.reference ? this.api.verifyPlanPayment(this.reference).pipe(catchError(() => of(false))) : of(false);
    check$.pipe(switchMap(() => this.api.billing())).subscribe({
      next: (b) => {
        this.billing = b;
        const done = !!this.reference && b.history.some((h) => h.paystackReference === this.reference && h.status === 'active');
        this.polls += 1;
        if (done) {
          this.confirming = false;
          this.reference = null;
          this.say(`You are now on the ${b.plan.charAt(0).toUpperCase()}${b.plan.slice(1)} plan.`);
          this.reloadBusiness();
        } else if (this.polls < POLL_TIMES) {
          this.pollTimer = setTimeout(() => this.pollOnce(), POLL_EVERY_MS);
        } else {
          this.confirming = false;
          this.billingError = 'We have not received your payment yet. If you paid, your plan will update in a few minutes. Refresh this page to check.';
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.polls += 1;
        if (this.polls < POLL_TIMES) {
          this.pollTimer = setTimeout(() => this.pollOnce(), POLL_EVERY_MS);
        } else {
          this.confirming = false;
        }
        this.cdr.markForCheck();
      },
    });
  }

  /** The plan changes what the profile page can do (for example custom domains), so refresh the business. */
  private reloadBusiness(): void {
    this.api.business().subscribe((b) => {
      this.business = b;
      this.cdr.markForCheck();
    });
  }

  /* ---------------- Shared ---------------- */
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

  private focusInvalid(scope: string): void {
    if (this.isBrowser) {
      (this.doc.querySelector(`${scope} .ng-invalid[id]`) as HTMLElement | null)?.focus();
    }
  }

  /** Used by the template to check a typed phone number without a validator error. */
  isPhone(value: string): boolean {
    return isNigerianPhone(value);
  }
}