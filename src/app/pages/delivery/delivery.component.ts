import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { finalize } from 'rxjs/operators';

import { ApiError } from '../../services/auth.service';
import { DeliveryApi, DeliverySettings } from '../../services/delivery.service';

const MAX_ZONES = 25;
const MAX_FEE_NAIRA = 50000;

type ZoneForm = FormGroup<{ name: FormControl<string>; fee: FormControl<number | null> }>;

/** Dashboard > Delivery: switch delivery on, allow pickup, and set a fee for each area. */
@Component({
  selector: 'app-delivery',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './delivery.component.html',
  styleUrls: ['./delivery.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliveryComponent implements OnInit, OnDestroy {
  loading = true;
  loadError = '';
  saving = false;
  saveError = '';
  toast = '';
  /** False when the plan does not include delivery. */
  available = true;

  readonly form = new FormGroup({
    enabled: new FormControl(false, { nonNullable: true }),
    allowPickup: new FormControl(true, { nonNullable: true }),
    zones: new FormArray<ZoneForm>([]),
  });

  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly isBrowser: boolean;

  constructor(
    private readonly api: DeliveryApi,
    private readonly cdr: ChangeDetectorRef,
    private readonly title: Title,
    private readonly meta: Meta,
    @Inject(PLATFORM_ID) platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnInit(): void {
    this.title.setTitle('Delivery | LagosPages');
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    if (this.isBrowser) {
      this.load();
    }
  }

  ngOnDestroy(): void {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
  }

  get zones(): FormArray<ZoneForm> {
    return this.form.controls.zones;
  }

  get canAddZone(): boolean {
    return this.zones.length < MAX_ZONES;
  }

  get on(): boolean {
    return this.form.controls.enabled.value;
  }

  load(): void {
    this.loading = true;
    this.loadError = '';
    this.cdr.markForCheck();
    this.api
      .get()
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (d) => this.fill(d),
        error: (e: ApiError) => (this.loadError = e.message),
      });
  }

  private fill(d: DeliverySettings): void {
    this.available = d.available;
    this.form.controls.enabled.setValue(d.enabled);
    this.form.controls.allowPickup.setValue(d.allowPickup);
    this.zones.clear();
    d.zones.forEach((z) => this.zones.push(this.makeZone(z.name, z.fee / 100)));
    // A fresh setup starts with one empty row so the owner sees what to fill in.
    if (!this.zones.length) {
      this.zones.push(this.makeZone('', null));
    }
  }

  private makeZone(name: string, fee: number | null): ZoneForm {
    return new FormGroup({
      name: new FormControl(name, { nonNullable: true, validators: [Validators.required, Validators.minLength(2), Validators.maxLength(40)] }),
      fee: new FormControl<number | null>(fee, { validators: [Validators.required, Validators.min(0), Validators.max(MAX_FEE_NAIRA)] }),
    });
  }

  addZone(): void {
    if (this.canAddZone) {
      this.zones.push(this.makeZone('', null));
      this.cdr.markForCheck();
    }
  }

  removeZone(i: number): void {
    this.zones.removeAt(i);
    this.cdr.markForCheck();
  }

  invalid(c: AbstractControl | null): 'true' | null {
    return c && c.invalid && (c.touched || c.dirty) ? 'true' : null;
  }

  save(): void {
    if (this.saving || !this.available) {
      return;
    }
    this.saveError = '';
    // Empty rows are ignored, so the owner never has to delete a blank one.
    const rows = this.zones.controls.filter((z) => z.value.name?.trim() || z.value.fee !== null);
    this.zones.controls.forEach((z) => z.markAllAsTouched());
    if (rows.some((z) => z.invalid)) {
      this.saveError = 'Check the areas marked in red. Each needs a name and a fee (use 0 for free).';
      this.cdr.markForCheck();
      return;
    }
    const zones = rows.map((z) => ({ name: z.getRawValue().name.trim(), fee: Math.round((z.getRawValue().fee ?? 0) * 100) }));
    if (this.on && !zones.length) {
      this.saveError = 'Add at least one delivery area before you switch delivery on.';
      this.cdr.markForCheck();
      return;
    }

    this.saving = true;
    this.cdr.markForCheck();
    this.api
      .save({ enabled: this.on, allowPickup: this.form.controls.allowPickup.value, zones })
      .pipe(
        finalize(() => {
          this.saving = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (d) => {
          this.fill(d);
          this.say(d.enabled ? 'Delivery is on. Customers can now choose it at checkout.' : 'Saved. Delivery is off.');
        },
        error: (e: ApiError) => {
          this.saveError = e.message;
          this.cdr.markForCheck();
        },
      });
  }

  trackIndex(i: number): number {
    return i;
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
    }, 3500);
  }
}