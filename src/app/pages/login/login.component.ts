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
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { Observable, Subscription } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { DASHBOARD_ROUTE } from '../../core/api.config';
import { ApiError, AuthService, BusinessMode } from '../../services/auth.service';

type View = 'login' | 'signup' | 'verify' | 'forgot' | 'reset';
type LoginMethod = 'password' | 'sms';
type VerifyPurpose = 'signup' | 'login';
type ErrorAction = 'login' | 'verify' | null;

const BRAND = 'LagosPages';
const RESEND_SECONDS = 60;
const PAID_PLANS = ['starter', 'pro'];

/* ---------------- Validators (same rules as the backend) ---------------- */

/** Returns the 10 digits after 0 or 234 when this is a valid Nigerian mobile number, else null. */
function nigerianDigits(value: string): string | null {
  let d = (value ?? '').replace(/\D/g, '');
  if (d.startsWith('234')) {
    d = d.slice(3);
  } else if (d.startsWith('0')) {
    d = d.slice(1);
  }
  return /^[789]\d{9}$/.test(d) ? d : null;
}

const phoneValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || nigerianDigits(String(c.value)) ? null : { phone: true };

const identifierValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = String(c.value ?? '').trim();
  if (!v) {
    return null;
  }
  if (v.includes('@')) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : { identifier: true };
  }
  return nigerianDigits(v) ? null : { identifier: true };
};

const codeValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || /^\d{6}$/.test(String(c.value)) ? null : { code: true };

/** Only allow an in-app path, so ?returnUrl= can never send someone to another website. */
function safeReturnUrl(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) {
    return null;
  }
  return value;
}

function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnInit, OnDestroy {
  readonly brand = BRAND;

  /* ---------------- State ---------------- */
  view: View = 'login';
  method: LoginMethod = 'password';
  busy = false;
  error = '';
  notice = '';
  errorAction: ErrorAction = null;
  showPassword = false;

  /** Number and reason for the code the person is entering. */
  otpPhone = '';
  otpPurpose: VerifyPurpose = 'login';
  resendIn = 0;

  /** From the home page: ?plan=starter|pro and ?slug=my-business. */
  plan: 'starter' | 'pro' | null = null;
  private returnUrl: string | null = null;

  readonly modes: { value: BusinessMode; title: string; text: string }[] = [
    { value: 'both', title: 'Both', text: 'Products and bookings' },
    { value: 'shop', title: 'Sell products', text: 'Orders on WhatsApp' },
    { value: 'booking', title: 'Take bookings', text: 'Slots and deposits' },
  ];

  /* ---------------- Forms ---------------- */
  readonly loginForm = new FormGroup({
    identifier: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, identifierValidator],
    }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly smsForm = new FormGroup({
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, phoneValidator] }),
  });

  readonly signupForm = new FormGroup({
    businessName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, phoneValidator] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.minLength(8), Validators.maxLength(100)],
    }),
    mode: new FormControl<BusinessMode>('both', { nonNullable: true }),
    agree: new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] }),
  });

  readonly codeForm = new FormGroup({
    code: new FormControl('', { nonNullable: true, validators: [Validators.required, codeValidator] }),
  });

  readonly forgotForm = new FormGroup({
    phone: new FormControl('', { nonNullable: true, validators: [Validators.required, phoneValidator] }),
  });

  readonly resetForm = new FormGroup({
    code: new FormControl('', { nonNullable: true, validators: [Validators.required, codeValidator] }),
    newPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(8), Validators.maxLength(100)],
    }),
  });

  private readonly isBrowser: boolean;
  /** The page address typed on the home page. Sent with sign-up; the server uses it only if it is valid and free. */
  private wantedSlug = '';
  /** Billing period picked on the pricing page, carried through sign-up to the Plan tab. */
  private period: 'monthly' | 'annual' = 'monthly';
  private routeSub?: Subscription;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly auth: AuthService,
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
    this.title.setTitle(`Log in or create your page | ${BRAND}`);
    this.meta.updateTag({ name: 'robots', content: 'noindex, follow' });

    // The home page links here as /login?mode=signup&slug=my-shop&plan=starter
    this.routeSub = this.route.queryParamMap.subscribe((q) => {
      const plan = q.get('plan');
      this.plan = plan && PAID_PLANS.includes(plan) ? (plan as 'starter' | 'pro') : null;
      this.period = q.get('period') === 'annual' ? 'annual' : 'monthly';
      this.returnUrl = safeReturnUrl(q.get('returnUrl'));

      const slug = (q.get('slug') ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '');
      this.wantedSlug = slug.replace(/^-+|-+$/g, '');
      const name = this.signupForm.controls.businessName;
      if (slug && !name.value) {
        name.setValue(titleCaseSlug(slug));
      }

      this.setView(q.get('mode') === 'signup' ? 'signup' : 'login');
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.stopTimer();
  }

  /* ---------------- View helpers ---------------- */
  setView(view: View, focus = true): void {
    this.view = view;
    this.error = '';
    this.notice = '';
    this.errorAction = null;
    this.showPassword = false;
    if (focus) {
      this.focus(
        { login: 'login-id', signup: 'su-name', verify: 'code', forgot: 'forgot-phone', reset: 'reset-code' }[view]
      );
    }
  }

  setMethod(method: LoginMethod): void {
    this.method = method;
    this.error = '';
    this.notice = '';
    this.errorAction = null;
    this.focus(method === 'password' ? 'login-id' : 'sms-phone');
  }

  get isTabView(): boolean {
    return this.view === 'login' || this.view === 'signup';
  }

  get maskedPhone(): string {
    const digits = nigerianDigits(this.otpPhone);
    if (!digits) {
      return this.otpPhone;
    }
    const local = `0${digits}`;
    return `${local.slice(0, 4)} *** ${local.slice(-4)}`;
  }


  /** Message to show under a field once it has been touched. */
  errorOf(control: AbstractControl | null, label: string): string {
    if (!control || !control.touched || !control.errors) {
      return '';
    }
    const e = control.errors;
    if (e['required']) {
      return `${label} is required.`;
    }
    if (e['phone']) {
      return 'Enter a valid Nigerian phone number, like 0803 123 4567.';
    }
    if (e['identifier']) {
      return 'Enter your phone number or your email address.';
    }
    if (e['email']) {
      return 'Enter a valid email address.';
    }
    if (e['code']) {
      return 'Enter the 6-digit code from the SMS.';
    }
    if (e['minlength']) {
      return `${label} must be at least ${e['minlength'].requiredLength} characters.`;
    }
    if (e['maxlength']) {
      return `${label} is too long.`;
    }
    return `Check ${label.toLowerCase()}.`;
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  /** Keeps only digits in the code boxes (also handles paste and SMS autofill). */
  onDigits(event: Event, control: AbstractControl): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 6);
    if (digits !== input.value) {
      input.value = digits;
    }
    control.setValue(digits);
  }

  /* ---------------- Submit handlers ---------------- */
  submitLogin(): void {
    if (this.method === 'sms') {
      this.submitSms();
      return;
    }
    if (!this.validate(this.loginForm)) {
      return;
    }
    const { identifier, password } = this.loginForm.getRawValue();
    this.call(this.auth.login(identifier.trim(), password), () => this.finish(), (err) => {
      if (err.code === 'PHONE_NOT_VERIFIED') {
        if (nigerianDigits(identifier)) {
          this.errorAction = 'verify';
        } else {
          this.error = `${err.message} Log in with your phone number to get a new code.`;
          return true;
        }
      }
      return false;
    });
  }

  private submitSms(): void {
    if (!this.validate(this.smsForm)) {
      return;
    }
    const phone = this.smsForm.controls.phone.value.trim();
    this.call(
      this.auth.requestOtp(phone, 'login'),
      (message) => this.startVerify(phone, 'login', message),
      (err) => {
        if (err.code === 'OTP_COOLDOWN') {
          // A code was sent a moment ago, so let them type it in.
          this.startVerify(phone, 'login', 'A code was sent a moment ago. Enter it below.');
          return true;
        }
        return false;
      }
    );
  }

  submitSignup(): void {
    if (!this.validate(this.signupForm)) {
      return;
    }
    const v = this.signupForm.getRawValue();
    const phone = v.phone.trim();
    const payload = {
      phone,
      businessName: v.businessName.trim(),
      mode: v.mode,
      ...(v.email.trim() ? { email: v.email.trim() } : {}),
      ...(v.password ? { password: v.password } : {}),
      ...(this.wantedSlug.length >= 3 ? { slug: this.wantedSlug } : {}),
    };
    this.call(this.auth.signup(payload), (message) => this.startVerify(phone, 'signup', message));
  }

  submitCode(): void {
    if (!this.validate(this.codeForm)) {
      return;
    }
    this.call(
      this.auth.verifyOtp(this.otpPhone, this.codeForm.controls.code.value, this.otpPurpose),
      () => this.finish()
    );
  }

  resend(): void {
    if (this.resendIn > 0 || this.busy) {
      return;
    }
    this.call(
      this.auth.requestOtp(this.otpPhone, this.otpPurpose),
      () => {
        this.notice = 'We sent you a new code.';
        this.startTimer();
      },
      (err) => {
        if (err.code === 'OTP_COOLDOWN') {
          this.startTimer();
        }
        return false;
      }
    );
  }

  /**
   * Free fallback when the SMS does not arrive: sends the same code to the account's verified email.
   * The server answers the same whether or not the account has one, so the message stays careful.
   */
  sendByEmail(): void {
    if (this.resendIn > 0 || this.busy) {
      return;
    }
    const purpose = this.view === 'reset' ? ('reset' as const) : this.otpPurpose;
    this.call(
      this.auth.requestOtp(this.otpPhone, purpose, 'email'),
      (message) => {
        this.notice = `${message} It can take a minute. Check your spam folder too.`;
        this.startTimer();
      },
      (err) => {
        if (err.code === 'OTP_COOLDOWN') {
          this.startTimer();
        }
        return false;
      }
    );
  }

  /** "Use a different number" on the code screen. */
  changeNumber(): void {
    this.stopTimer();
    this.setView(this.otpPurpose === 'signup' ? 'signup' : 'login');
  }

  submitForgot(): void {
    if (!this.validate(this.forgotForm)) {
      return;
    }
    const phone = this.forgotForm.controls.phone.value.trim();
    this.call(
      this.auth.requestOtp(phone, 'reset'),
      (message) => this.openReset(phone, message),
      (err) => {
        if (err.code === 'OTP_COOLDOWN') {
          this.openReset(phone, 'A code was sent a moment ago. Enter it below.');
          return true;
        }
        return false;
      }
    );
  }

  submitReset(): void {
    if (!this.validate(this.resetForm)) {
      return;
    }
    const { code, newPassword } = this.resetForm.getRawValue();
    this.call(this.auth.resetPassword(this.otpPhone, code, newPassword), (message) => {
      this.loginForm.reset({ identifier: this.otpPhone, password: '' });
      this.resetForm.reset();
      this.stopTimer();
      this.method = 'password';
      this.setView('login', false);
      this.notice = message;
      this.focus('login-pw');
    });
  }

  resendReset(): void {
    if (this.resendIn > 0 || this.busy) {
      return;
    }
    this.call(
      this.auth.requestOtp(this.otpPhone, 'reset'),
      () => {
        this.notice = 'We sent you a new code.';
        this.startTimer();
      },
      (err) => {
        if (err.code === 'OTP_COOLDOWN') {
          this.startTimer();
        }
        return false;
      }
    );
  }

  /* ---------------- Error shortcuts ---------------- */
  /** After "An account with this phone number already exists". */
  useLoginInstead(): void {
    const phone = this.signupForm.controls.phone.value;
    this.loginForm.controls.identifier.setValue(phone);
    this.method = 'password';
    this.setView('login');
  }

  /** After "Please verify your phone number first". */
  verifyNow(): void {
    const phone = this.loginForm.controls.identifier.value.trim();
    this.call(
      this.auth.requestOtp(phone, 'signup'),
      () => this.startVerify(phone, 'signup', 'We sent you a new code. Enter it to finish setting up your account.'),
      (err) => {
        if (err.code === 'OTP_COOLDOWN') {
          this.startVerify(phone, 'signup', 'A code was sent a moment ago. Enter it below.');
          return true;
        }
        return false;
      }
    );
  }

  /* ---------------- Internals ---------------- */
  private startVerify(phone: string, purpose: VerifyPurpose, notice: string): void {
    this.otpPhone = phone;
    this.otpPurpose = purpose;
    this.codeForm.reset({ code: '' });
    this.setView('verify');
    this.notice = notice;
    this.startTimer();
  }

  private openReset(phone: string, notice: string): void {
    this.otpPhone = phone;
    this.resetForm.reset({ code: '', newPassword: '' });
    this.setView('reset');
    this.notice = notice;
    this.startTimer();
  }

  /** Signed in: go back to where they were headed, or the dashboard. */
  private finish(): void {
    if (this.returnUrl) {
      this.router.navigateByUrl(this.returnUrl);
      return;
    }
    if (this.auth.session?.user.role === 'admin') {
      this.router.navigate(['/admin']);
      return;
    }
    // Picked a paid plan on the pricing page: go straight to the Plan tab so they can pay.
    if (this.plan) {
      this.router.navigate([DASHBOARD_ROUTE, 'billing'], { queryParams: { plan: this.plan, period: this.period } });
      return;
    }
    this.router.navigate([DASHBOARD_ROUTE]);
  }

  /**
   * Runs one request with the busy flag and error handling.
   * `onError` may return true when it has already shown its own message.
   */
  private call<T>(request: Observable<T>, onSuccess: (value: T) => void, onError?: (err: ApiError) => boolean): void {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.errorAction = null;
    this.cdr.markForCheck();

    request
      .pipe(
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (value) => {
          onSuccess(value);
          this.cdr.markForCheck();
        },
        error: (err: ApiError) => {
          const handled = onError ? onError(err) : false;
          if (!handled) {
            this.error = err.message;
            if (err.code === 'PHONE_TAKEN') {
              this.errorAction = 'login';
            }
          }
          this.cdr.markForCheck();
        },
      });
  }

  private validate(form: FormGroup): boolean {
    if (form.valid) {
      return true;
    }
    form.markAllAsTouched();
    this.cdr.markForCheck();
    if (this.isBrowser) {
      (this.doc.querySelector('.card input.ng-invalid') as HTMLElement | null)?.focus();
    }
    return false;
  }

  private startTimer(): void {
    this.stopTimer();
    if (!this.isBrowser) {
      return;
    }
    this.resendIn = RESEND_SECONDS;
    this.timer = setInterval(() => {
      this.resendIn -= 1;
      if (this.resendIn <= 0) {
        this.stopTimer();
      }
      this.cdr.markForCheck();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.resendIn = 0;
  }

  private focus(id: string): void {
    if (!this.isBrowser) {
      return;
    }
    setTimeout(() => (this.doc.getElementById(id) as HTMLElement | null)?.focus(), 60);
  }
}