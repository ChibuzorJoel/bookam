import { ChangeDetectionStrategy, Component, Inject, Input, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';

interface FooterLink {
  id: string;
  label: string;
}

@Component({
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  @Input() brand = 'LagosPages';
  @Input() about = 'Booking and shop pages for Lagos businesses. Share one link and get paid.';

  readonly year = new Date().getFullYear();
  readonly signupParams = { mode: 'signup' };

  readonly links: FooterLink[] = [
    { id: 'how', label: 'How it works' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'faq', label: 'FAQ' },
  ];

  constructor(
    private readonly router: Router,
    @Inject(DOCUMENT) private readonly doc: Document,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {}

  /** On the home page, scroll to the section; elsewhere let the link navigate to /#id. */
  goTo(id: string, event: Event): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const path = this.router.url.split(/[?#]/)[0];
    if (path !== '/') return;
    const el = this.doc.getElementById(id);
    if (!el) return;
    event.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.router.navigate([], { fragment: id, replaceUrl: true });
  }
}