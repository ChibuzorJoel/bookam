import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { ApiError } from '../../services/auth.service';
import { AssistantApi, AssistantUsage, KnowledgeEntry, KnowledgeGap } from '../../services/assistant.service';

/** Admin > Assistant: teach the website assistant. Answer missed questions, edit what it knows. */
@Component({
  selector: 'app-admin-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-assistant.component.html',
  styleUrls: ['./admin-assistant.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAssistantComponent implements OnInit {
  loading = true;
  loadError = '';
  toast = '';
  busyId = '';

  usage: AssistantUsage | null = null;
  gaps: KnowledgeGap[] = [];
  entries: KnowledgeEntry[] = [];

  /** Answer being typed for each missed question, keyed by gap id. */
  readonly gapAnswers: Record<string, string> = {};

  adding = { question: '', answer: '' };
  addError = '';

  editingId = '';
  edit = { question: '', answer: '' };
  editError = '';

  filter = '';

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly isBrowser: boolean;

  constructor(
    private readonly api: AssistantApi,
    private readonly cdr: ChangeDetectorRef,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.title.setTitle('Assistant | Bookam admin');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (this.isBrowser) {
      this.load();
    }
  }

  get todayCount(): number {
    const today = new Date().toISOString().slice(0, 10);
    return this.usage?.days.find((d) => d.day === today)?.messages ?? 0;
  }

  get shown(): KnowledgeEntry[] {
    const q = this.filter.trim().toLowerCase();
    return q ? this.entries.filter((e) => (e.question + ' ' + e.answer).toLowerCase().includes(q)) : this.entries;
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    forkJoin({ usage: this.api.usage(), gaps: this.api.gaps(), entries: this.api.knowledge() })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (r) => {
          this.usage = r.usage;
          this.gaps = r.gaps;
          this.entries = r.entries;
        },
        error: (e: ApiError) => (this.loadError = e.message),
      });
  }

  /* ---------- Missed questions ---------- */
  answerGap(g: KnowledgeGap): void {
    const answer = (this.gapAnswers[g._id] || '').trim();
    if (answer.length < 3 || this.busyId) {
      return;
    }
    this.busyId = g._id;
    this.api
      .answerGap(g._id, answer)
      .pipe(finalize(() => this.release()))
      .subscribe({
        next: (entry) => {
          this.entries = [...this.entries, entry];
          this.gaps = this.gaps.filter((x) => x._id !== g._id);
          this.say('Saved. The assistant knows this now.');
        },
        error: (e: ApiError) => this.say(e.message),
      });
  }

  ignoreGap(g: KnowledgeGap): void {
    if (this.busyId) {
      return;
    }
    this.busyId = g._id;
    this.api
      .ignoreGap(g._id)
      .pipe(finalize(() => this.release()))
      .subscribe({
        next: () => (this.gaps = this.gaps.filter((x) => x._id !== g._id)),
        error: (e: ApiError) => this.say(e.message),
      });
  }

  /* ---------- Knowledge ---------- */
  add(): void {
    this.addError = '';
    const question = this.adding.question.trim();
    const answer = this.adding.answer.trim();
    if (question.length < 3 || answer.length < 3) {
      this.addError = 'Add both a question and an answer.';
      return;
    }
    this.busyId = 'new';
    this.api
      .addKnowledge({ question, answer })
      .pipe(finalize(() => this.release()))
      .subscribe({
        next: (entry) => {
          this.entries = [...this.entries, entry];
          this.adding = { question: '', answer: '' };
          this.say('Added.');
        },
        error: (e: ApiError) => (this.addError = e.message),
      });
  }

  startEdit(e: KnowledgeEntry): void {
    this.editingId = e._id;
    this.edit = { question: e.question, answer: e.answer };
    this.editError = '';
  }

  cancelEdit(): void {
    this.editingId = '';
  }

  saveEdit(e: KnowledgeEntry): void {
    const question = this.edit.question.trim();
    const answer = this.edit.answer.trim();
    if (question.length < 3 || answer.length < 3) {
      this.editError = 'Add both a question and an answer.';
      return;
    }
    this.busyId = e._id;
    this.api
      .updateKnowledge(e._id, { question, answer })
      .pipe(finalize(() => this.release()))
      .subscribe({
        next: (u) => {
          this.entries = this.entries.map((x) => (x._id === u._id ? u : x));
          this.editingId = '';
          this.say('Saved.');
        },
        error: (err: ApiError) => (this.editError = err.message),
      });
  }

  toggle(e: KnowledgeEntry): void {
    if (this.busyId) {
      return;
    }
    this.busyId = e._id;
    this.api
      .updateKnowledge(e._id, { active: !e.active })
      .pipe(finalize(() => this.release()))
      .subscribe({
        next: (u) => (this.entries = this.entries.map((x) => (x._id === u._id ? u : x))),
        error: (err: ApiError) => this.say(err.message),
      });
  }

  remove(e: KnowledgeEntry): void {
    if (this.busyId || (this.isBrowser && !window.confirm('Delete this answer? The assistant will stop using it.'))) {
      return;
    }
    this.busyId = e._id;
    this.api
      .deleteKnowledge(e._id)
      .pipe(finalize(() => this.release()))
      .subscribe({
        next: () => {
          this.entries = this.entries.filter((x) => x._id !== e._id);
          this.say('Deleted.');
        },
        error: (err: ApiError) => this.say(err.message),
      });
  }

  trackId(_: number, x: { _id: string }): string {
    return x._id;
  }

  private release(): void {
    this.busyId = '';
    this.cdr.markForCheck();
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