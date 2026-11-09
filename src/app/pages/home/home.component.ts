import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { Router } from '@angular/router';

/* ------------------------------------------------------------------ */
/*  Edit these constants to match your real brand and domain.          */
/* ------------------------------------------------------------------ */
const BRAND = 'LagosPages';
const DOMAIN = 'lagospages.ng';
const SITE_URL = `https://${DOMAIN}`;
/** Create a 1200x630 image and put it at src/assets/og-home.jpg */
const OG_IMAGE = `${SITE_URL}/assets/og-home.jpg`;
/** Where "Start free" sends people. Change to '/signup' when that route exists. */
const SIGNUP_ROUTE = '/login';
/** Optional. Digits only with country code, e.g. '2348012345678'. Leave '' to hide the link. */
const SUPPORT_WHATSAPP = '';

/** Page names that would clash with your routes (/login, /dashboard ...). */
const RESERVED_SLUGS = [
  'login', 'signup', 'register', 'dashboard', 'admin', 'api', 'book',
  'pricing', 'help', 'support', 'about', 'terms', 'privacy', 'home', 'app',
];

const SEO = {
  title: `${BRAND}: Online booking and store page for your business`,
  description:
    'Create a free booking and shop page for your Lagos business. Take bookings, collect deposits with Paystack and get orders on WhatsApp from one shareable link.',
  keywords:
    'booking page Lagos, online store Nigeria, WhatsApp store, Paystack deposits, appointment booking Nigeria, business link Instagram bio, hair stylist booking, barber booking, makeup artist booking',
};

interface DemoItem {
  name: string;
  meta: string;
  price: string;
}
interface DemoSlot {
  t: string;
  taken?: boolean;
}
interface DemoAlert {
  title: string;
  body: string;
}
interface Demo {
  id: string;
  slug: string;
  label: string;
  name: string;
  place: string;
  tagline: string;
  mode: 'booking' | 'shop';
  accent: string;
  items: DemoItem[];
  slots: DemoSlot[];
  picked: number;
  cta: string;
  ctaBg: string;
  alerts: [DemoAlert, DemoAlert];
}
interface Plan {
  id: 'free' | 'starter' | 'pro';
  name: string;
  price: string;
  priceValue: string;
  blurb: string;
  features: string[];
  cta: string;
  featured: boolean;
}
interface Feature {
  title: string;
  text: string;
  icon: string;
}
interface Faq {
  q: string;
  a: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit, OnDestroy {
  readonly brand = BRAND;
  readonly domain = DOMAIN;
  readonly signupParams = { mode: 'signup' };
  readonly supportUrl = SUPPORT_WHATSAPP
    ? `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
        `Hello ${BRAND}, I would like help setting up my business page.`
      )}`
    : '';

  slug = '';
  claimError = '';

  /* ---------------- Sample pages shown in the phone ---------------- */
  readonly demos: Demo[] = [
    {
      id: 'hair',
      slug: 'zainab-hair-studio',
      label: 'Hair stylist',
      name: 'Zainab Hair Studio',
      place: 'Lekki Phase 1, Lagos',
      tagline: 'Braids, wigs and silk press',
      mode: 'booking',
      accent: '#B03A8C',
      items: [
        { name: 'Knotless braids', meta: '4 hrs, ₦10,000 deposit', price: '₦35,000' },
        { name: 'Wig install', meta: '2 hrs, ₦8,000 deposit', price: '₦25,000' },
        { name: 'Silk press', meta: '1 hr 30 min, ₦6,000 deposit', price: '₦18,000' },
      ],
      slots: [{ t: '10:00 am', taken: true }, { t: '12:30 pm' }, { t: '3:00 pm' }],
      picked: 1,
      cta: 'Book and pay ₦10,000 deposit',
      ctaBg: '#B03A8C',
      alerts: [
        { title: 'New booking', body: 'Amaka, Saturday 12:30 pm' },
        { title: 'Deposit received', body: '₦10,000 paid with Paystack' },
      ],
    },
    {
      id: 'bakery',
      slug: 'mama-tolu-cakes',
      label: 'Baker',
      name: 'Mama Tolu Cakes',
      place: 'Ikeja GRA, Lagos',
      tagline: 'Cakes, small chops and party packs',
      mode: 'shop',
      accent: '#D9480F',
      items: [
        { name: 'Red velvet cake, 8 inch', meta: 'In stock', price: '₦18,500' },
        { name: 'Small chops box', meta: 'In stock', price: '₦12,000' },
        { name: 'Chin chin jar', meta: 'Low stock', price: '₦3,500' },
      ],
      slots: [],
      picked: -1,
      cta: 'Send order on WhatsApp, ₦34,000',
      ctaBg: '#0E7C3F',
      alerts: [
        { title: 'New order', body: 'Chika ordered 3 items, ₦34,000' },
        { title: 'Saved', body: 'Order added to your dashboard' },
      ],
    },
    {
      id: 'barber',
      slug: 'sharp-cut-barbers',
      label: 'Barber',
      name: 'Sharp Cut Barbers',
      place: 'Yaba, Lagos',
      tagline: 'Fades, beard trims and kids cuts',
      mode: 'booking',
      accent: '#0F5A52',
      items: [
        { name: 'Skin fade', meta: '45 min, ₦1,000 deposit', price: '₦4,000' },
        { name: 'Fade and beard', meta: '1 hr, ₦1,500 deposit', price: '₦6,000' },
        { name: 'Kids cut', meta: '30 min, ₦1,000 deposit', price: '₦2,500' },
      ],
      slots: [{ t: '9:00 am', taken: true }, { t: '10:30 am' }, { t: '1:00 pm' }],
      picked: 1,
      cta: 'Book and pay ₦1,000 deposit',
      ctaBg: '#0F5A52',
      alerts: [
        { title: 'New booking', body: 'Tunde, Saturday 10:30 am' },
        { title: 'Deposit received', body: '₦1,000 paid with Paystack' },
      ],
    },
    {
      id: 'makeup',
      slug: 'ife-glam',
      label: 'Makeup artist',
      name: 'Ife Glam',
      place: 'Victoria Island, Lagos',
      tagline: 'Bridal and event makeup',
      mode: 'booking',
      accent: '#5B3FB0',
      items: [
        { name: 'Bridal makeup', meta: '3 hrs, ₦20,000 deposit', price: '₦90,000' },
        { name: 'Gele and makeup', meta: '2 hrs, ₦12,000 deposit', price: '₦45,000' },
        { name: 'Soft glam', meta: '1 hr 30 min, ₦8,000 deposit', price: '₦35,000' },
      ],
      slots: [{ t: '11:00 am' }, { t: '2:00 pm' }, { t: '5:00 pm', taken: true }],
      picked: 1,
      cta: 'Book and pay ₦20,000 deposit',
      ctaBg: '#5B3FB0',
      alerts: [
        { title: 'New booking', body: 'Ngozi, Friday 2:00 pm' },
        { title: 'Deposit received', body: '₦20,000 paid with Paystack' },
      ],
    },
  ];
  active: Demo = this.demos[0];

  /* ---------------- Page content ---------------- */
  readonly steps = [
    {
      title: 'Create your page',
      text: 'Sign up with your phone number. Add your business name, logo, WhatsApp number and location.',
    },
    {
      title: 'Add what you sell',
      text: 'Upload products with photos and prices, or add services with time, price and deposit.',
    },
    {
      title: 'Share your link',
      text: 'Put it in your Instagram bio and WhatsApp status, or print the QR code for your shop.',
    },
    {
      title: 'Get orders and bookings',
      text: 'Orders reach your WhatsApp. Deposits are paid through Paystack and sent to your bank account.',
    },
  ];

  readonly features: Feature[] = [
    {
      title: 'Light pages that load fast',
      text: 'Images are compressed and load as people scroll, so your page opens even on weak data.',
      icon: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
    },
    {
      title: 'Orders on WhatsApp',
      text: 'Customers send you a ready-made message with items, quantities and total. No typing, no mix-ups.',
      icon: 'M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z',
    },
    {
      title: 'Pay by card, transfer or USSD',
      text: 'Deposits go through Paystack, with a clear secure-payment note on the page so customers trust it.',
      icon: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M7 15h3',
    },
    {
      title: 'Log in with your phone number',
      text: 'Get a one-time code by SMS. There is no long password to forget.',
      icon: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2',
    },
    {
      title: 'Easy to share anywhere',
      text: 'Copy your link, download a QR code, and show your logo and name in the WhatsApp link preview.',
      icon: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h3v3h-3zM19 14v1M14 20h6',
    },
    {
      title: 'Install on your phone',
      text: 'Add your dashboard to your home screen and check today’s bookings like you would in an app.',
      icon: 'M12 3v12M7 10l5 5 5-5M5 21h14',
    },
  ];

  readonly plans: Plan[] = [
    {
      id: 'free',
      name: 'Free',
      price: '₦0',
      priceValue: '0',
      blurb: 'For sellers who take orders on WhatsApp.',
      features: [
        '1 business page with a shareable link',
        'Up to 10 products',
        'Orders sent to your WhatsApp',
        'Small “Powered by” badge',
      ],
      cta: 'Start free',
      featured: false,
    },
    {
      id: 'starter',
      name: 'Starter',
      price: '₦4,000',
      priceValue: '4000',
      blurb: 'For service businesses that want bookings and deposits.',
      features: [
        'Unlimited products and services',
        'Booking calendar with open slots',
        'Deposit payments with Paystack',
        'No “Powered by” badge',
      ],
      cta: 'Choose Starter',
      featured: true,
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '₦10,000',
      priceValue: '10000',
      blurb: 'For busy businesses with their own brand.',
      features: [
        'Everything in Starter',
        'Your own domain name',
        'Appointment reminders',
        'Analytics for your page',
      ],
      cta: 'Choose Pro',
      featured: false,
    },
  ];

  readonly faqs: Faq[] = [
    {
      q: 'Do my customers need to download an app?',
      a: 'No. Customers open your link in their phone browser, pick what they want and pay or send their order. Nothing to install.',
    },
    {
      q: 'How do I get paid?',
      a: 'Customers pay deposits through Paystack by card, bank transfer or USSD. You add your bank account in your dashboard and your money is paid out to it.',
    },
    {
      q: 'Can I just use it for WhatsApp orders?',
      a: 'Yes. The Free plan lets you list up to 10 products and receive orders on WhatsApp. Upgrade to Starter when you want booking and deposits.',
    },
    {
      q: 'Will it work on a slow network?',
      a: 'Pages are built to stay light. Images are compressed and load as people scroll, so your page opens quickly even on weak data.',
    },
    {
      q: 'Can I use my own domain name?',
      a: 'Yes, on the Pro plan. Everyone else gets a simple link such as ' + DOMAIN + '/your-business.',
    },
    {
      q: 'What do I need to get started?',
      a: 'Your phone number, your business name and your WhatsApp number. Photos and prices can be added as you go.',
    },
  ];

  private readonly jsonLdId = 'home-jsonld';
  private readonly isBrowser: boolean;

  constructor(
    private readonly title: Title,
    private readonly meta: Meta,
    private readonly router: Router,
    @Inject(DOCUMENT) private readonly doc: Document,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  /* ---------------- Lifecycle and SEO ---------------- */
  ngOnInit(): void {
    this.applySeo();
  }

  ngOnDestroy(): void {
    // Only clean up in the browser so server-rendered HTML keeps its tags.
    if (!this.isBrowser) {
      return;
    }
    this.doc.getElementById(this.jsonLdId)?.remove();
    this.doc.head.querySelector('link[rel="canonical"]')?.remove();
    this.doc.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
  }

  private applySeo(): void {
    const url = `${SITE_URL}/`;

    this.title.setTitle(SEO.title);

    const name = (n: string, content: string) =>
      this.meta.updateTag({ name: n, content }, `name="${n}"`);
    const prop = (p: string, content: string) =>
      this.meta.updateTag({ property: p, content }, `property="${p}"`);

    name('description', SEO.description);
    name('keywords', SEO.keywords);
    name('robots', 'index, follow, max-image-preview:large, max-snippet:-1');
    name('author', BRAND);
    name('theme-color', '#08302D');
    name('format-detection', 'telephone=no');

    prop('og:type', 'website');
    prop('og:site_name', BRAND);
    prop('og:locale', 'en_NG');
    prop('og:title', SEO.title);
    prop('og:description', SEO.description);
    prop('og:url', url);
    prop('og:image', OG_IMAGE);
    prop('og:image:width', '1200');
    prop('og:image:height', '630');
    prop('og:image:alt', `${BRAND}: one link for bookings, orders and deposits`);

    name('twitter:card', 'summary_large_image');
    name('twitter:title', SEO.title);
    name('twitter:description', SEO.description);
    name('twitter:image', OG_IMAGE);

    this.upsertLink('link[rel="canonical"]', { rel: 'canonical', href: url });
    this.upsertLink('link[rel="alternate"][hreflang="en-NG"]', {
      rel: 'alternate',
      hreflang: 'en-NG',
      href: url,
    });

    this.upsertJsonLd(this.buildJsonLd(url));
  }

  private upsertLink(selector: string, attrs: Record<string, string>): void {
    let el = this.doc.head.querySelector(selector) as HTMLLinkElement | null;
    if (!el) {
      el = this.doc.createElement('link');
      this.doc.head.appendChild(el);
    }
    Object.keys(attrs).forEach((key) => el!.setAttribute(key, attrs[key]));
  }

  private upsertJsonLd(data: object): void {
    let script = this.doc.getElementById(this.jsonLdId) as HTMLScriptElement | null;
    if (!script) {
      script = this.doc.createElement('script');
      script.id = this.jsonLdId;
      script.type = 'application/ld+json';
      this.doc.head.appendChild(script);
    }
    // Escape "<" so the JSON can never close the script tag early.
    script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
  }

  private buildJsonLd(url: string): object {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          '@id': `${SITE_URL}/#organization`,
          name: BRAND,
          url,
          areaServed: { '@type': 'City', name: 'Lagos' },
        },
        {
          '@type': 'WebSite',
          '@id': `${SITE_URL}/#website`,
          url,
          name: BRAND,
          inLanguage: 'en-NG',
          publisher: { '@id': `${SITE_URL}/#organization` },
        },
        {
          '@type': 'WebPage',
          '@id': `${url}#webpage`,
          url,
          name: SEO.title,
          description: SEO.description,
          inLanguage: 'en-NG',
          isPartOf: { '@id': `${SITE_URL}/#website` },
        },
        {
          '@type': 'SoftwareApplication',
          name: BRAND,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web',
          description: SEO.description,
          url,
          offers: this.plans.map((p) => ({
            '@type': 'Offer',
            name: p.name,
            price: p.priceValue,
            priceCurrency: 'NGN',
            description: p.blurb,
          })),
        },
        {
          '@type': 'FAQPage',
          mainEntity: this.faqs.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        },
      ],
    };
  }

  /* ---------------- Template helpers ---------------- */
  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }

  pick(demo: Demo): void {
    this.active = demo;
  }

  get displayName(): string {
    if (!this.slug) {
      return this.active.name;
    }
    return this.slug
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  get displayInitials(): string {
    return this.displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase();
  }

  get displayUrl(): string {
    return `${DOMAIN}/${this.slug || this.active.slug}`;
  }

  get ariaPhoneLabel(): string {
    return `Sample ${this.active.label.toLowerCase()} page on a phone, for ${this.displayName}`;
  }

  /* ---------------- "Claim your link" form ---------------- */
  onSlugInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.slug = this.sanitize(input.value);
    if (input.value !== this.slug) {
      input.value = this.slug;
    }
    if (this.claimError) {
      this.claimError = '';
    }
  }

  claim(event: Event): void {
    event.preventDefault();
    const slug = this.slug.replace(/-+$/, '');

    if (!slug) {
      this.claimError = 'Type your business name first, for example zainab-hair-studio.';
      return;
    }
    if (slug.length < 3) {
      this.claimError = 'Use at least 3 letters or numbers.';
      return;
    }
    if (RESERVED_SLUGS.indexOf(slug) !== -1) {
      this.claimError = 'That name is used by the platform. Try another name.';
      return;
    }
    this.router.navigate([SIGNUP_ROUTE], { queryParams: { mode: 'signup', slug } });
  }

  private sanitize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-{2,}/g, '-')
      .replace(/^-+/, '')
      .slice(0, 30);
  }
}