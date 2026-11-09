import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DomSanitizer, Meta, SafeUrl, Title } from '@angular/platform-browser';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';

import { compressImage } from '../../core/image';
import { fieldError } from '../../core/validators';
import { ApiError } from '../../services/auth.service';
import { CatalogApi, CatalogProduct, CatalogService, ServiceInput } from '../../services/catalog.service';

type Tab = 'products' | 'services';
type Editing = { kind: 'product' | 'service'; id: string | null } | null;

interface Photo {
  preview: string | SafeUrl;
  /** Set for photos already saved on the server. */
  existingUrl?: string;
  /** Set for photos picked in this session. */
  file?: File;
  objectUrl?: string;
}

const MAX_PHOTOS = 6;

/** Naira amounts typed by the owner: 1500, 1,500 or 1500.50. */
const nairaValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = String(c.value ?? '').replace(/,/g, '').trim();
  return !v || /^\d{1,9}(\.\d{1,2})?$/.test(v) ? null : { naira: true };
};

const toKobo = (v: string | null | undefined): number => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

const fromKobo = (kobo: number): string => String((kobo ?? 0) / 100);

/** A deposit can never be more than the price (the server checks this too). */
const depositValidator: ValidatorFn = (g: AbstractControl): ValidationErrors | null => {
  const price = toKobo(g.get('price')?.value);
  const deposit = toKobo(g.get('depositAmount')?.value);
  return deposit > price ? { depositTooHigh: true } : null;
};

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './catalog.component.html',
  styleUrls: ['./catalog.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogComponent implements OnInit, OnDestroy {
  tab: Tab = 'products';
  loading = true;
  error = '';
  toast = '';

  products: CatalogProduct[] = [];
  productLimit: number | null = null;
  services: CatalogService[] = [];

  editing: Editing = null;
  saving = false;
  formError = '';
  /** Id of the row being switched or deleted. */
  busyId = '';

  photos: Photo[] = [];
  photoBusy = false;

  readonly productForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
    price: new FormControl('', { nonNullable: true, validators: [Validators.required, nairaValidator] }),
    category: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(60)] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
    inStock: new FormControl(true, { nonNullable: true }),
    active: new FormControl(true, { nonNullable: true }),
  });

  readonly serviceForm = new FormGroup(
    {
      name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(120)] }),
      description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
      durationMinutes: new FormControl<number | null>(60, [Validators.required, Validators.min(5), Validators.max(720)]),
      price: new FormControl('', { nonNullable: true, validators: [Validators.required, nairaValidator] }),
      depositAmount: new FormControl('', { nonNullable: true, validators: [nairaValidator] }),
      bufferMinutes: new FormControl<number | null>(0, [Validators.min(0), Validators.max(240)]),
      active: new FormControl(true, { nonNullable: true }),
    },
    { validators: [depositValidator] }
  );

  readonly fieldError = fieldError;

  private readonly isBrowser: boolean;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly money = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 });

  constructor(
    private readonly api: CatalogApi,
    private readonly cdr: ChangeDetectorRef,
    private readonly sanitizer: DomSanitizer,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(DOCUMENT) private readonly doc: Document,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  /* ---------------- Lifecycle ---------------- */
  ngOnInit(): void {
    this.title.setTitle('Products and services | LagosPages');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (this.isBrowser) {
      this.load();
    }
  }

  ngOnDestroy(): void {
    this.releasePhotos();
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.editing && !this.saving) {
      this.closeEditor();
      this.cdr.markForCheck();
    }
  }

  /* ---------------- Loading ---------------- */
  load(): void {
    this.loading = true;
    this.error = '';
    this.cdr.markForCheck();

    forkJoin({
      p: this.api.listProducts(),
      // Some plans cannot use services. The products tab must still work, so a failure here is not fatal.
      s: this.api.listServices().pipe(catchError(() => of([] as CatalogService[]))),
    })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: ({ p, s }) => {
          this.products = p.products;
          this.productLimit = p.limit;
          this.services = s;
          this.cdr.markForCheck();
        },
        error: (e: ApiError) => {
          this.error = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  /* ---------------- Display helpers ---------------- */
  get atLimit(): boolean {
    return this.productLimit !== null && this.products.length >= this.productLimit;
  }

  naira(kobo: number): string {
    return `₦${this.money.format((kobo ?? 0) / 100)}`;
  }

  duration(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
  }

  trackById(_i: number, item: { _id: string }): string {
    return item._id;
  }

  invalid(c: AbstractControl | null): 'true' | null {
    return c && c.touched && c.invalid ? 'true' : null;
  }

  /** Message for naira fields, falling back to the shared messages. */
  money_err(c: AbstractControl | null, label: string): string {
    if (c?.touched && c.errors?.['naira']) {
      return `${label} must be an amount like 1500 or 1500.50.`;
    }
    return fieldError(c, label);
  }

  get depositError(): boolean {
    const g = this.serviceForm;
    return !!g.errors?.['depositTooHigh'] && (g.controls.depositAmount.touched || g.controls.price.touched);
  }

  setTab(tab: Tab): void {
    this.tab = tab;
  }

  /* ============================== PRODUCTS ============================== */
  openProduct(p?: CatalogProduct): void {
    this.releasePhotos();
    this.formError = '';
    this.editing = { kind: 'product', id: p?._id ?? null };
    this.productForm.reset({
      name: p?.name ?? '',
      price: p ? fromKobo(p.price) : '',
      category: p?.category ?? '',
      description: p?.description ?? '',
      inStock: p?.inStock ?? true,
      active: p?.active ?? true,
    });
    this.photos = (p?.imageUrls ?? []).map((url) => ({ preview: url, existingUrl: url }));
    this.focusSoon('p-name');
  }

  async onPhotos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = ''; // lets the same photo be chosen again later
    const room = MAX_PHOTOS - this.photos.length;
    if (!picked.length || room <= 0) {
      if (room <= 0) {
        this.formError = `You can add up to ${MAX_PHOTOS} photos.`;
      }
      return;
    }
    this.formError = '';
    this.photoBusy = true;
    this.cdr.markForCheck();

    for (const file of picked.slice(0, room)) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        this.formError = 'Only JPG, PNG or WebP photos are allowed.';
        continue;
      }
      const small = await compressImage(file);
      const objectUrl = URL.createObjectURL(small);
      this.photos = [
        ...this.photos,
        { file: small, objectUrl, preview: this.sanitizer.bypassSecurityTrustUrl(objectUrl) },
      ];
    }
    this.photoBusy = false;
    this.cdr.markForCheck();
  }

  removePhoto(i: number): void {
    const gone = this.photos[i];
    if (gone?.objectUrl) {
      URL.revokeObjectURL(gone.objectUrl);
    }
    this.photos = this.photos.filter((_, idx) => idx !== i);
  }

  makeCover(i: number): void {
    if (i <= 0) {
      return;
    }
    const copy = [...this.photos];
    const [chosen] = copy.splice(i, 1);
    this.photos = [chosen, ...copy];
  }

  saveProduct(): void {
    if (this.saving || this.photoBusy) {
      return;
    }
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      this.focusInvalid();
      return;
    }
    const v = this.productForm.getRawValue();
    const id = this.editing?.id ?? null;

    const form = new FormData();
    form.append('name', v.name.trim());
    form.append('price', String(toKobo(v.price)));
    form.append('description', v.description.trim());
    form.append('category', v.category.trim());
    form.append('inStock', String(v.inStock));
    form.append('active', String(v.active));
    if (id) {
      // Photos to keep, in order. New uploads are added after them by the server.
      form.append('imageUrls', JSON.stringify(this.photos.filter((p) => p.existingUrl).map((p) => p.existingUrl)));
    }
    this.photos.filter((p) => p.file).forEach((p) => form.append('images', p.file as File, (p.file as File).name));

    this.saving = true;
    this.formError = '';
    (id ? this.api.updateProduct(id, form) : this.api.createProduct(form))
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (saved) => {
          this.products = id
            ? this.products.map((p) => (p._id === saved._id ? saved : p))
            : [saved, ...this.products];
          this.closeEditor();
          this.say(id ? 'Product saved.' : 'Product added.');
        },
        error: (e: ApiError) => {
          this.formError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  toggleStock(p: CatalogProduct): void {
    this.quickPatch(p, { inStock: !p.inStock }, p.inStock ? 'Marked out of stock.' : 'Back in stock.');
  }

  toggleVisible(p: CatalogProduct): void {
    this.quickPatch(p, { active: !p.active }, p.active ? 'Hidden from your page.' : 'Now showing on your page.');
  }

  private quickPatch(p: CatalogProduct, body: Partial<Pick<CatalogProduct, 'inStock' | 'active'>>, ok: string): void {
    if (this.busyId) {
      return;
    }
    this.busyId = p._id;
    this.api
      .patchProduct(p._id, body)
      .pipe(
        finalize(() => {
          this.busyId = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (saved) => {
          this.products = this.products.map((x) => (x._id === saved._id ? saved : x));
          this.say(ok);
        },
        error: (e: ApiError) => this.say(e.message),
      });
  }

  deleteProduct(p: CatalogProduct): void {
    if (this.busyId || !this.confirm(`Delete "${p.name}"? This cannot be undone.`)) {
      return;
    }
    this.busyId = p._id;
    this.api
      .deleteProduct(p._id)
      .pipe(
        finalize(() => {
          this.busyId = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: () => {
          this.products = this.products.filter((x) => x._id !== p._id);
          this.say('Product deleted.');
        },
        error: (e: ApiError) => this.say(e.message),
      });
  }

  /* ============================== SERVICES ============================== */
  openService(s?: CatalogService): void {
    this.formError = '';
    this.editing = { kind: 'service', id: s?._id ?? null };
    this.serviceForm.reset({
      name: s?.name ?? '',
      description: s?.description ?? '',
      durationMinutes: s?.durationMinutes ?? 60,
      price: s ? fromKobo(s.price) : '',
      depositAmount: s && s.depositAmount ? fromKobo(s.depositAmount) : '',
      bufferMinutes: s?.bufferMinutes ?? 0,
      active: s?.active ?? true,
    });
    this.focusSoon('s-name');
  }

  saveService(): void {
    if (this.saving) {
      return;
    }
    if (this.serviceForm.invalid) {
      this.serviceForm.markAllAsTouched();
      this.focusInvalid();
      return;
    }
    const v = this.serviceForm.getRawValue();
    const id = this.editing?.id ?? null;
    const body: ServiceInput = {
      name: v.name.trim(),
      description: v.description.trim(),
      durationMinutes: Number(v.durationMinutes),
      price: toKobo(v.price),
      depositAmount: toKobo(v.depositAmount),
      bufferMinutes: Number(v.bufferMinutes ?? 0),
      active: v.active,
    };

    this.saving = true;
    this.formError = '';
    (id ? this.api.updateService(id, body) : this.api.createService(body))
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (saved) => {
          this.services = id
            ? this.services.map((s) => (s._id === saved._id ? saved : s))
            : [saved, ...this.services];
          this.closeEditor();
          this.say(id ? 'Service saved.' : 'Service added.');
        },
        error: (e: ApiError) => {
          this.formError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  toggleService(s: CatalogService): void {
    if (this.busyId) {
      return;
    }
    this.busyId = s._id;
    this.api
      .updateService(s._id, { active: !s.active })
      .pipe(
        finalize(() => {
          this.busyId = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (saved) => {
          this.services = this.services.map((x) => (x._id === saved._id ? saved : x));
          this.say(saved.active ? 'Now showing on your page.' : 'Hidden from your page.');
        },
        error: (e: ApiError) => this.say(e.message),
      });
  }

  deleteService(s: CatalogService): void {
    if (this.busyId || !this.confirm(`Delete "${s.name}"?`)) {
      return;
    }
    this.busyId = s._id;
    this.api
      .deleteService(s._id)
      .pipe(
        finalize(() => {
          this.busyId = '';
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (res) => {
          if (res.archived) {
            // It has bookings, so the server only hid it.
            this.services = this.services.map((x) => (x._id === s._id ? { ...x, active: false } : x));
          } else {
            this.services = this.services.filter((x) => x._id !== s._id);
          }
          this.say(res.message);
        },
        error: (e: ApiError) => this.say(e.message),
      });
  }

  /* ---------------- Shared ---------------- */
  closeEditor(): void {
    this.editing = null;
    this.formError = '';
    this.releasePhotos();
  }

  private releasePhotos(): void {
    this.photos.forEach((p) => p.objectUrl && URL.revokeObjectURL(p.objectUrl));
    this.photos = [];
  }

  private confirm(message: string): boolean {
    return this.isBrowser ? !!this.doc.defaultView?.confirm(message) : false;
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
      }, 3500);
    }
  }

  private focusSoon(id: string): void {
    if (this.isBrowser) {
      setTimeout(() => (this.doc.getElementById(id) as HTMLElement | null)?.focus(), 80);
    }
  }

  private focusInvalid(): void {
    if (this.isBrowser) {
      (this.doc.querySelector('.sheet .ng-invalid[id]') as HTMLElement | null)?.focus();
    }
  }
}