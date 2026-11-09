import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize } from 'rxjs/operators';

import { ApiError, AuthService } from '../../services/auth.service';
import { AdminApi, AdminBusiness, AdminPatch, AdminStats, BusinessStatus } from '../../services/admin.service';
import { PlanKey } from '../../services/settings.service';

const LAGOS = 'Africa/Lagos';
const PAGE = 20;

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminComponent implements OnInit, OnDestroy {
  readonly statuses: { value: BusinessStatus | ''; label: string }[] = [
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspended' },
  ];
  readonly plans: { value: PlanKey | ''; label: string }[] = [
    { value: '', label: 'Any plan' },
    { value: 'free', label: 'Free' },
    { value: 'starter', label: 'Starter' },
    { value: 'pro', label: 'Pro' },
  ];

  readonly filters = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    status: new FormControl<BusinessStatus | ''>('', { nonNullable: true }),
    plan: new FormControl<PlanKey | ''>('', { nonNullable: true }),
  });

  /** The row being edited, with its own small form. */
  editing: AdminBusiness | null = null;
  readonly editForm = new FormGroup({
    status: new FormControl<BusinessStatus>('active', { nonNullable: true }),
    reason: new FormControl('', { nonNullable: true }),
    plan: new FormControl<PlanKey>('free', { nonNullable: true }),
    expires: new FormControl('', { nonNullable: true }),
  });
  saving = false;
  editError = '';

  stats: AdminStats | null = null;
  statsError = '';
  rows: AdminBusiness[] = [];
  total = 0;
  more = false;
  private page = 0;
  loading = false;
  error = '';
  toast = '';

  private sub = new Subscription();
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly isBrowser: boolean;
  private readonly money = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

  constructor(
    private readonly api: AdminApi,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.title.setTitle('Admin | LagosPages');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (!this.isBrowser) {
      return;
    }
    this.loadStats();
    this.reload();
    // Search as they type, after a short pause.
    this.sub.add(this.filters.controls.q.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => this.reload()));
    this.sub.add(this.filters.controls.status.valueChanges.subscribe(() => this.reload()));
    this.sub.add(this.filters.controls.plan.valueChanges.subscribe(() => this.reload()));
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  /* ---------------- Display ---------------- */
  naira(kobo: number): string {
    return `₦${this.money.format((kobo ?? 0) / 100)}`;
  }

  date(iso?: string): string {
    return iso ? new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: LAGOS }).format(new Date(iso)) : 'never';
  }

  count(map: Record<string, number> | undefined, key: string): number {
    return map?.[key] ?? 0;
  }

  /** A paid plan whose date has passed behaves as Free on the backend. */
  expired(b: AdminBusiness): boolean {
    return b.plan !== 'free' && !!b.planExpiresAt && new Date(b.planExpiresAt).getTime() < Date.now();
  }

  trackById(_: number, b: AdminBusiness): string {
    return b._id;
  }

  logout(): void {
    this.auth.logout().subscribe(() => this.router.navigate(['/login']));
  }

  /* ---------------- Loading ---------------- */
  loadStats(): void {
    this.statsError = '';
    this.api.stats().subscribe({
      next: (s) => {
        this.stats = s;
        this.cdr.markForCheck();
      },
      error: (e: ApiError) => {
        this.statsError = e.message;
        this.cdr.markForCheck();
      },
    });
  }

  reload(): void {
    this.rows = [];
    this.page = 0;
    this.editing = null;
    this.loadMore(true);
  }

  loadMore(fresh = false): void {
    if (this.loading && !fresh) {
      return;
    }
    const f = this.filters.getRawValue();
    const page = this.page + 1;
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.api
      .businesses({ q: f.q.trim() || undefined, status: f.status || undefined, plan: f.plan || undefined, page, limit: PAGE })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (p) => {
          // A newer search may have started while this one was in flight.
          if (page !== this.page + 1) {
            return;
          }
          this.rows = [...this.rows, ...p.businesses];
          this.total = p.total;
          this.more = p.page < p.pages;
          this.page = page;
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.error = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  /* ---------------- Editing ---------------- */
  edit(b: AdminBusiness): void {
    if (this.editing?._id === b._id) {
      this.editing = null;
      return;
    }
    this.editing = b;
    this.editError = '';
    this.editForm.reset({
      status: b.status,
      reason: b.suspendedReason ?? '',
      plan: b.plan,
      expires: b.planExpiresAt ? b.planExpiresAt.slice(0, 10) : '',
    });
  }

  /** Quick plan length helper: sets the expiry to 30 days from today. */
  plus30(): void {
    const d = new Date(Date.now() + 30 * 86400000);
    this.editForm.controls.expires.setValue(d.toISOString().slice(0, 10));
  }

  save(): void {
    const b = this.editing;
    if (!b || this.saving) {
      return;
    }
    const v = this.editForm.getRawValue();
    if (v.status === 'suspended' && this.isBrowser && !window.confirm(`Suspend ${b.name}? Their public page will stop working.`)) {
      return;
    }
    const patch: AdminPatch = { status: v.status, plan: v.plan, planExpiresAt: v.expires ? new Date(`${v.expires}T23:59:59+01:00`).toISOString() : null };
    if (v.status === 'suspended') {
      patch.suspendedReason = v.reason.trim() || undefined;
    }
    this.saving = true;
    this.editError = '';
    this.api
      .update(b._id, patch)
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (updated) => {
          // The API returns the business without the owner details, so keep the ones we have.
          this.rows = this.rows.map((r) => (r._id === b._id ? { ...r, ...updated, ownerId: r.ownerId } : r));
          this.editing = null;
          this.say(`${b.name} updated.`);
          this.loadStats();
        },
        error: (e: ApiError) => {
          this.editError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  quick(b: AdminBusiness, status: BusinessStatus): void {
    if (this.saving) {
      return;
    }
    this.saving = true;
    this.api
      .update(b._id, { status })
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (updated) => {
          this.rows = this.rows.map((r) => (r._id === b._id ? { ...r, ...updated, ownerId: r.ownerId } : r));
          this.say(`${b.name} is now ${status}.`);
          this.loadStats();
        },
        error: (e: ApiError) => this.say(e.message),
      });
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