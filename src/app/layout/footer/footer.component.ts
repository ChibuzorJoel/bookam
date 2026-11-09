import { ChangeDetectionStrategy, Component, Inject, Input, PLATFORM_ID } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

interface NavLink {
  id: string;
  label: string;
}

/**
 * Public site footer for LagosPages.
 * Standalone: add FooterComponent to the `imports` array of the component or module that uses <app-footer>.
 */
@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  @Input() brand = 'LagosPages';
  @Input() about = 'Booking and shop pages for businesses in Lagos, Nigeria.';

  readonly year = new Date().getFullYear();
  readonly signupParams = { mode: 'signup' };

  /** Section ids on the home page. */
  readonly links: NavLink[] = [
    { id: 'how', label: 'How it works' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'faq', label: 'FAQ' },
  ];

  private readonly isBrowser: boolean;

  constructor(
    private readonly router: Router,
    @Inject(DOCUMENT) private readonly doc: Document,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  /** In-page smooth scroll on the home page, or go home first and then scroll from any other page. */
  goTo(id: string, event: Event): void {
    event.preventDefault();

    if (this.router.url.split(/[?#]/)[0] === '/') {
      this.scrollToId(id);
      return;
    }
    this.router.navigate(['/'], { fragment: id }).then(() => {
      if (this.isBrowser) {
        setTimeout(() => this.scrollToId(id), 60);
      }
    });
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