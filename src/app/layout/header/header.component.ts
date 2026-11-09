import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  Inject,
  Input,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';

interface NavLink {
  id: string;
  label: string;
}

/**
 * Public site header for LagosPages.
 * Standalone: add HeaderComponent to the `imports` array of the component or module that uses <app-header>.
 */
@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Input() brand = 'LagosPages';
  /** Set true when the user has a session, to show "Go to dashboard" instead of Log in / Start free. */
  @Input() loggedIn = false;

  readonly signupParams = { mode: 'signup' };

  /** Section ids on the home page. */
  readonly links: NavLink[] = [
    { id: 'how', label: 'How it works' },
    { id: 'who', label: 'Who it’s for' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'faq', label: 'FAQ' },
  ];

  menuOpen = false;
  scrolled = false;

  private readonly isBrowser: boolean;
  private sub?: Subscription;

  constructor(
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    @Inject(DOCUMENT) private readonly doc: Document,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.sub = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.menuOpen = false;
      this.cdr.markForCheck();
    });
    this.onScroll();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  @HostListener('document:keydown.escape')
  closeMenu(): void {
    if (this.menuOpen) {
      this.menuOpen = false;
      this.cdr.markForCheck();
    }
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (!this.isBrowser) {
      return;
    }
    const next = (this.doc.defaultView?.scrollY ?? 0) > 8;
    if (next !== this.scrolled) {
      this.scrolled = next;
      this.cdr.markForCheck();
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    // Close the mobile panel if the screen grows to desktop width.
    if (this.isBrowser && this.menuOpen && (this.doc.defaultView?.innerWidth ?? 0) >= 960) {
      this.menuOpen = false;
      this.cdr.markForCheck();
    }
  }

  /** In-page smooth scroll on the home page, or go home first and then scroll from any other page. */
  goTo(id: string, event: Event): void {
    event.preventDefault();
    this.menuOpen = false;

    if (this.isHome()) {
      this.scrollToId(id);
      return;
    }
    this.router.navigate(['/'], { fragment: id }).then(() => {
      if (this.isBrowser) {
        setTimeout(() => this.scrollToId(id), 60);
      }
    });
  }

  skipToMain(event: Event): void {
    event.preventDefault();
    this.scrollToId('main');
  }

  private isHome(): boolean {
    return this.router.url.split(/[?#]/)[0] === '/';
  }

  private scrollToId(id: string): void {
    if (!this.isBrowser) {
      return;
    }
    const el = this.doc.getElementById(id);
    if (!el) {
      return;
    }
    const reduce = !!this.doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    if (el.hasAttribute('tabindex')) {
      el.focus({ preventScroll: true });
    }
  }
}