import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, Inject, OnDestroy, OnInit, PLATFORM_ID, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { filter, finalize } from 'rxjs/operators';

import { ApiError } from '../../services/auth.service';
import { AssistantApi, ChatLink, ChatTurn } from '../../services/assistant.service';
import { AdminExtraApi } from '../../services/admin-extra.service';

interface Bubble extends ChatTurn {
  links?: ChatLink[];
}

/** The chat bubble only appears on these public pages. It would only confuse customers on a business's own page. */
const SHOW_ON = ['/', '/pricing', '/login', '/terms', '/privacy', '/refunds'];
const MAX_LEN = 500;

/** Help assistant for the Bookam site. Answers from the knowledge base and can send the visitor to the right page. */
@Component({
  selector: 'app-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assistant.component.html',
  styleUrls: ['./assistant.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantComponent implements OnInit, OnDestroy {
  @ViewChild('input') input?: ElementRef<HTMLInputElement>;
  @ViewChild('log') log?: ElementRef<HTMLElement>;

  readonly maxLen = MAX_LEN;
  readonly suggestions = ['How much does it cost?', 'How do I start?', 'How does delivery work?', 'How do deposits work?'];

  visible = false;
  open = false;
  busy = false;
  /** The "talk to a person" form. */
  human = false;
  humanBusy = false;
  humanDone = false;
  humanError = '';
  form = { name: '', contact: '', message: '' };
  draft = '';
  error = '';
  readonly bubbles: Bubble[] = [{ role: 'assistant', content: 'Hi! I am the Bookam assistant. Ask me anything about plans, bookings, deposits or delivery.' }];

  private sub?: Subscription;
  private readonly isBrowser: boolean;

  constructor(
    private readonly api: AssistantApi,
    private readonly support: AdminExtraApi,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.update(this.router.url);
    this.sub = this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe((e) => this.update(e.urlAfterRedirects));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private update(url: string): void {
    const path = url.split(/[?#]/)[0] || '/';
    this.visible = SHOW_ON.includes(path);
    if (!this.visible) {
      this.open = false;
    }
    this.cdr.markForCheck();
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) {
      this.focusInput();
      this.scrollDown();
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (this.open) {
      this.open = false;
      this.cdr.markForCheck();
    }
  }

  get canSend(): boolean {
    return !this.busy && this.draft.trim().length > 0;
  }

  get showSuggestions(): boolean {
    return this.bubbles.length === 1 && !this.busy;
  }

  ask(text: string): void {
    this.draft = text;
    this.send();
  }

  send(): void {
    const text = this.draft.trim().slice(0, MAX_LEN);
    if (!text || this.busy) {
      return;
    }
    this.error = '';
    this.draft = '';
    this.bubbles.push({ role: 'user', content: text });
    this.busy = true;
    this.cdr.markForCheck();
    this.scrollDown();

    // The greeting is not part of the conversation the model needs.
    const history: ChatTurn[] = this.bubbles.slice(1).map((b) => ({ role: b.role, content: b.content }));
    this.api
      .chat(history)
      .pipe(
        finalize(() => {
          this.busy = false;
          this.cdr.markForCheck();
          this.scrollDown();
          this.focusInput();
        })
      )
      .subscribe({
        next: (r) => this.bubbles.push({ role: 'assistant', content: r.reply, links: r.links }),
        error: (e: ApiError) => (this.error = e.status === 429 ? e.message : 'I could not answer just now. Please try again in a moment.'),
      });
  }

  openHuman(): void {
    this.human = true;
    this.humanDone = false;
    this.humanError = '';
    // Start from what the visitor last asked, so they do not type it twice.
    const lastQuestion = [...this.bubbles].reverse().find((b) => b.role === 'user')?.content ?? '';
    if (!this.form.message) {
      this.form.message = lastQuestion;
    }
    this.cdr.markForCheck();
  }

  closeHuman(): void {
    this.human = false;
    this.cdr.markForCheck();
    this.focusInput();
  }

  sendHuman(): void {
    if (this.humanBusy) {
      return;
    }
    const f = { name: this.form.name.trim(), contact: this.form.contact.trim(), message: this.form.message.trim() };
    if (f.name.length < 2 || f.contact.length < 5 || f.message.length < 5) {
      this.humanError = 'Please add your name, a phone number or email, and your message.';
      return;
    }
    this.humanError = '';
    this.humanBusy = true;
    this.cdr.markForCheck();
    this.support
      .sendSupport({ ...f, page: this.router.url.split(/[?#]/)[0] })
      .pipe(
        finalize(() => {
          this.humanBusy = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.humanDone = true;
          this.form = { name: '', contact: '', message: '' };
        },
        error: (e: ApiError) => (this.humanError = e.message),
      });
  }

  go(link: ChatLink): void {
    this.open = false;
    this.router.navigate([link.path], { queryParams: link.query, fragment: link.fragment });
  }

  trackIndex(i: number): number {
    return i;
  }

  private focusInput(): void {
    if (this.isBrowser) {
      setTimeout(() => this.input?.nativeElement.focus(), 60);
    }
  }

  private scrollDown(): void {
    if (this.isBrowser) {
      setTimeout(() => {
        const el = this.log?.nativeElement;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      }, 30);
    }
  }
}