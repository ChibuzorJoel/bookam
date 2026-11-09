import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** True for 0803…, 803…, +234803… and 234803… style Nigerian mobile numbers (same rule as the backend). */
export function isNigerianPhone(value: string): boolean {
  let d = (value ?? '').replace(/\D/g, '');
  if (d.startsWith('234')) {
    d = d.slice(3);
  } else if (d.startsWith('0')) {
    d = d.slice(1);
  }
  return /^[789]\d{9}$/.test(d);
}

export const phoneValidator: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  !c.value || isNigerianPhone(String(c.value)) ? null : { phone: true };

/** Friendly message for a touched control, or an empty string. */
export function fieldError(control: AbstractControl | null, label: string): string {
  if (!control || !control.touched || !control.errors) {
    return '';
  }
  const e = control.errors;
  if (e['required']) {
    return `${label} is required.`;
  }
  if (e['phone']) {
    return 'Enter a valid Nigerian phone number, like 0803 123 4567.';
  }
  if (e['email']) {
    return 'Enter a valid email address.';
  }
  if (e['minlength']) {
    return `${label} must be at least ${e['minlength'].requiredLength} characters.`;
  }
  if (e['maxlength']) {
    return `${label} is too long.`;
  }
  return `Check ${label.toLowerCase()}.`;
}