import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { finalize } from 'rxjs/operators';

import { ApiError } from '../../services/auth.service';
import { AdminExtraApi, BusinessDetail } from '../../services/admin-extra.service';

/** Admin > one business: owner, plan history, counts and the latest bookings and orders. */
@Component({
  selector: 'app-admin-business',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-business.component.html',
  styleUrls: ['./admin-business.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBusinessComponent implements OnInit {
  d: BusinessDetail | null = null;
  loading = true;
  error = '';

  private readonly isBrowser: boolean;
  private readonly money = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });
  private readonly dateFmt = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' });
  private readonly dateTimeFmt = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

  constructor(
    private readonly api: AdminExtraApi,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.title.setTitle('Business | Bookam admin');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (this.isBrowser) {
      this.load();
    }
  }

  load(): void {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.api
      .business(id)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (d) => (this.d = d),
        error: (e: ApiError) => (this.error = e.message),
      });
  }

  naira(kobo?: number): string {
    return `₦${this.money.format((kobo || 0) / 100)}`;
  }

  date(iso?: string): string {
    return iso ? this.dateFmt.format(new Date(iso)) : '-';
  }

  dateTime(iso?: string): string {
    return iso ? this.dateTimeFmt.format(new Date(iso)) : '-';
  }

  label(s: string): string {
    return s.replace(/_/g, ' ');
  }

  /** wa.me link to message the owner. The number is stored as 234XXXXXXXXXX. */
  whatsapp(phone?: string): string | null {
    return phone && /^\d{10,15}$/.test(phone) ? `https://wa.me/${phone}` : null;
  }

  trackId(_: number, r: { _id: string }): string {
    return r._id;
  }
}