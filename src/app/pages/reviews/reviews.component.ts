import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { finalize } from 'rxjs/operators';

import { ApiError } from '../../services/auth.service';
import { OwnerReview, ReviewsService } from '../../services/reviews.service';

@Component({
  selector: 'app-reviews',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reviews.component.html',
  styleUrls: ['./reviews.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewsComponent implements OnInit {
  reviews: OwnerReview[] = [];
  summary = { count: 0, average: 0 };
  page = 1;
  pages = 1;
  loading = true;
  error = '';
  toast = '';
  readonly starSet = [1, 2, 3, 4, 5];

  /** Review id whose reply box is open, and the text typed so far. */
  replyingTo = '';
  replyText = '';
  busyId = '';

  constructor(private readonly api: ReviewsService, private readonly cdr: ChangeDetectorRef, private readonly title: Title) {}

  ngOnInit(): void {
    this.title.setTitle('Reviews | Bookam');
    this.load(1);
  }

  load(page: number): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();
    this.api
      .list(page)
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (r) => {
          this.reviews = r.reviews;
          this.summary = r.summary;
          this.page = r.meta.page;
          this.pages = r.meta.pages ?? r.meta.totalPages ?? Math.max(1, Math.ceil(r.meta.total / r.meta.limit));
        },
        error: (e: ApiError) => (this.error = e.message),
      });
  }

  openReply(r: OwnerReview): void {
    this.replyingTo = r._id;
    this.replyText = r.reply ?? '';
  }

  cancelReply(): void {
    this.replyingTo = '';
    this.replyText = '';
  }

  saveReply(r: OwnerReview): void {
    this.patch(r, { reply: this.replyText.trim() }, r.reply && !this.replyText.trim() ? 'Reply removed.' : 'Reply saved.', () => this.cancelReply());
  }

  toggleHidden(r: OwnerReview): void {
    this.patch(r, { hidden: !r.hidden }, r.hidden ? 'Review is public again.' : 'Review hidden from your page.');
  }

  private patch(r: OwnerReview, body: { reply?: string; hidden?: boolean }, ok: string, done?: () => void): void {
    this.busyId = r._id;
    this.cdr.markForCheck();
    this.api
      .update(r._id, body)
      .pipe(
        finalize(() => {
          this.busyId = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (u) => {
          Object.assign(r, u);
          this.say(ok);
          done?.();
        },
        error: (e: ApiError) => this.say(e.message),
      });
  }

  private say(t: string): void {
    this.toast = t;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.toast = '';
      this.cdr.markForCheck();
    }, 3500);
  }

  date(iso: string): string {
    return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(iso));
  }

  track(_: number, r: OwnerReview): string {
    return r._id;
  }
}