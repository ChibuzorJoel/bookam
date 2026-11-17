import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { finalize } from 'rxjs/operators';

import { ApiError } from '../../services/auth.service';
import { AdminExtraApi, SupportMessage, SupportPage, SupportStatus } from '../../services/admin-extra.service';

/** Admin > Support: messages from visitors who asked for a person. Reply by WhatsApp or email, then mark them done. */
@Component({
  selector: 'app-admin-support',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-support.component.html',
  styleUrls: ['./admin-support.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSupportComponent implements OnInit {
  filter: SupportStatus | '' = 'open';
  page = 1;
  data: SupportPage | null = null;
  loading = true;
  error = '';
  busyId = '';
  toast = '';
  readonly notes: Record<string, string> = {};

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly isBrowser: boolean;
  private readonly dateFmt = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

  readonly tabs: { value: SupportStatus | ''; label: string }[] = [
    { value: 'open', label: 'Open' },
    { value: 'replied', label: 'Replied' },
    { value: 'closed', label: 'Closed' },
    { value: '', label: 'All' },
  ];

  constructor(
    private readonly api: AdminExtraApi,
    private readonly cdr: ChangeDetectorRef,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.title.setTitle('Support | Bookam admin');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (this.isBrowser) {
      this.load();
    }
  }

  setFilter(f: SupportStatus | ''): void {
    this.filter = f;
    this.page = 1;
    this.load();
  }

  go(delta: number): void {
    this.page += delta;
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.api
      .support(this.filter, this.page)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (d) => {
          this.data = d;
          d.messages.forEach((m) => (this.notes[m._id] = this.notes[m._id] ?? m.note ?? ''));
        },
        error: (e: ApiError) => (this.error = e.message),
      });
  }

  mark(m: SupportMessage, status: SupportStatus): void {
    if (this.busyId) {
      return;
    }
    this.busyId = m._id;
    this.api
      .updateSupport(m._id, { status, note: (this.notes[m._id] || '').trim() })
      .pipe(
        finalize(() => {
          this.busyId = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.say(status === 'open' ? 'Reopened.' : 'Saved.');
          this.load();
        },
        error: (e: ApiError) => this.say(e.message),
      });
  }

  saveNote(m: SupportMessage): void {
    this.mark(m, m.status);
  }

  /** A phone number becomes a WhatsApp link (Nigerian numbers 0803... are turned into 234803...). Anything else is treated as email. */
  reachLink(contact: string): { href: string; label: string } | null {
    const digits = contact.replace(/[^\d]/g, '');
    if (/^0\d{10}$/.test(digits)) {
      return { href: `https://wa.me/234${digits.slice(1)}`, label: 'WhatsApp' };
    }
    if (/^234\d{10}$/.test(digits)) {
      return { href: `https://wa.me/${digits}`, label: 'WhatsApp' };
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
      return { href: `mailto:${contact}`, label: 'Email' };
    }
    return null;
  }

  date(iso?: string): string {
    return iso ? this.dateFmt.format(new Date(iso)) : '-';
  }

  trackId(_: number, m: { _id: string }): string {
    return m._id;
  }

  private say(message: string): void {
    this.toast = message;
    this.cdr.markForCheck();
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      this.toast = '';
      this.cdr.markForCheck();
    }, 3000);
  }
}