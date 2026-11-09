import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { finalize } from 'rxjs/operators';

import { fieldError } from '../../core/validators';
import { ApiError, AuthService } from '../../services/auth.service';

const matchValidator = (g: AbstractControl): ValidationErrors | null =>
  g.get('newPassword')?.value === g.get('confirm')?.value ? null : { mismatch: true };

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './account.component.html',
  styleUrls: ['./account.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent implements OnInit, OnDestroy {
  readonly form = new FormGroup(
    {
      currentPassword: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(100)] }),
      newPassword: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8), Validators.maxLength(100)] }),
      confirm: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: [matchValidator] }
  );

  readonly fieldError = fieldError;

  /* ---- email ---- */
  readonly emailForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.maxLength(120)] }),
  });
  readonly codeForm = new FormGroup({
    otp: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^\d{6}$/)] }),
  });
  /** The address a code was sent to, while we wait for the code. */
  pendingEmail = '';
  emailVerified = false;
  emailBusy = false;
  emailError = '';
  emailDone = '';
  resendIn = 0;
  private resendTimer: ReturnType<typeof setInterval> | null = null;

  show = false;
  busy = false;
  error = '';
  done = '';
  phone = '';
  email = '';

  private readonly isBrowser: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(DOCUMENT) private readonly doc: Document,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.title.setTitle('Account | LagosPages');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    const u = this.auth.session?.user;
    this.phone = u?.phone ?? '';
    this.email = u?.email ?? '';
    this.emailVerified = !!u?.emailVerified;
    this.emailForm.controls.email.setValue(this.emailVerified ? '' : this.email);
  }

  ngOnDestroy(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
    }
  }

  /* ---------------- Email ---------------- */
  sendEmailCode(): void {
    if (this.emailBusy || this.resendIn > 0) {
      return;
    }
    this.emailError = '';
    this.emailDone = '';
    const c = this.emailForm.controls.email;
    if (c.invalid) {
      c.markAsTouched();
      this.cdr.markForCheck();
      (this.doc.getElementById('ac-email') as HTMLElement | null)?.focus();
      return;
    }
    const address = c.value.trim().toLowerCase();
    this.emailBusy = true;
    this.auth
      .requestEmailCode(address)
      .pipe(
        finalize(() => {
          this.emailBusy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (message) => {
          this.pendingEmail = address;
          this.emailDone = message;
          this.codeForm.reset({ otp: '' });
          this.startResend();
          this.cdr.markForCheck();
          if (this.isBrowser) {
            setTimeout(() => (this.doc.getElementById('ac-code') as HTMLElement | null)?.focus(), 0);
          }
        },
        error: (e: ApiError) => {
          this.emailError = e.message;
          if (e.code === 'OTP_COOLDOWN') {
            this.startResend();
          }
          this.cdr.markForCheck();
        },
      });
  }

  confirmEmailCode(): void {
    if (this.emailBusy) {
      return;
    }
    this.emailError = '';
    const c = this.codeForm.controls.otp;
    if (c.invalid) {
      c.markAsTouched();
      this.cdr.markForCheck();
      return;
    }
    this.emailBusy = true;
    this.auth
      .verifyEmailCode(this.pendingEmail, c.value)
      .pipe(
        finalize(() => {
          this.emailBusy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (user) => {
          this.email = user.email ?? this.pendingEmail;
          this.emailVerified = true;
          this.pendingEmail = '';
          this.emailDone = 'Email verified. You can now log in with it.';
          this.emailForm.reset({ email: '' });
          this.stopResend();
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.emailError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  changeEmail(): void {
    this.pendingEmail = '';
    this.emailError = '';
    this.emailDone = '';
    this.stopResend();
    this.cdr.markForCheck();
  }

  onCodeInput(event: Event): void {
    const el = event.target as HTMLInputElement;
    const digits = el.value.replace(/\D/g, '').slice(0, 6);
    if (digits !== el.value) {
      el.value = digits;
    }
    this.codeForm.controls.otp.setValue(digits);
  }

  private startResend(): void {
    this.stopResend();
    this.resendIn = 60;
    if (!this.isBrowser) {
      return;
    }
    this.resendTimer = setInterval(() => {
      this.resendIn = Math.max(0, this.resendIn - 1);
      if (this.resendIn === 0) {
        this.stopResend();
      }
      this.cdr.markForCheck();
    }, 1000);
  }

  private stopResend(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
      this.resendTimer = null;
    }
    this.resendIn = 0;
  }


  /** 2348031234567 -> 0803 123 4567 */
  get phoneText(): string {
    const d = this.phone.replace(/\D/g, '');
    const local = d.startsWith('234') ? `0${d.slice(3)}` : d;
    return local.replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3');
  }

  get mismatch(): boolean {
    return this.form.controls.confirm.touched && !!this.form.errors?.['mismatch'];
  }

  invalid(c: AbstractControl): 'true' | null {
    return c.touched && c.invalid ? 'true' : null;
  }

  strength(): { label: string; level: number } {
    const v = this.form.controls.newPassword.value;
    if (!v) {
      return { label: '', level: 0 };
    }
    let score = 0;
    if (v.length >= 8) score++;
    if (v.length >= 12) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
    const level = Math.max(1, Math.min(3, Math.ceil(score * 0.75)));
    return { label: ['', 'Weak', 'Okay', 'Strong'][level], level };
  }

  submit(): void {
    if (this.busy) {
      return;
    }
    this.done = '';
    this.error = '';
    const f = this.form;
    if (f.invalid) {
      f.markAllAsTouched();
      this.cdr.markForCheck();
      this.focusFirstInvalid();
      return;
    }
    const v = f.getRawValue();
    this.busy = true;
    this.auth
      .changePassword(v.currentPassword, v.newPassword)
      .pipe(
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (message) => {
          this.done = message;
          f.reset({ currentPassword: '', newPassword: '', confirm: '' });
          this.show = false;
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.error = e.message;
          this.cdr.markForCheck();
          if (e.code === 'WRONG_PASSWORD' || e.code === 'CURRENT_PASSWORD_REQUIRED') {
            (this.doc.getElementById('ac-current') as HTMLElement | null)?.focus();
          }
        },
      });
  }

  private focusFirstInvalid(): void {
    if (this.isBrowser) {
      (this.doc.querySelector('.panel .ng-invalid[id]') as HTMLElement | null)?.focus();
    }
  }
}