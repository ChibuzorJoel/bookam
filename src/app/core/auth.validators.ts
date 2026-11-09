import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/* These rules mirror backend/src/validators/index.js and backend/src/utils/phone.js exactly,
   so the form never accepts something the API will reject. */

/** Nigerian mobile to 234XXXXXXXXXX, or null when invalid. Same logic as the backend. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  let d = String(input).replace(/[^\d]/g, '');
  if (d.startsWith('234')) {
    d = d.slice(3);
  } else if (d.startsWith('0')) {
    d = d.slice(1);
  }
  return /^[789]\d{9}$/.test(d) ? `234${d}` : null;
}

/** 2348031234567 -> 0803 123 4567 */
export function formatLocalPhone(normalized: string): string {
  if (!/^234\d{10}$/.test(normalized)) {
    return normalized;
  }
  const n = `0${normalized.slice(3)}`;
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
}

const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

const isEmpty = (v: unknown): boolean => v === null || v === undefined || String(v).trim() === '';

/** Required text where spaces alone do not count. Error key: required */
export const requiredText: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  isEmpty(c.value) ? { required: true } : null;

/** Required Nigerian mobile number. Error key: phone */
export const nigerianPhone: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  isEmpty(c.value) || normalizePhone(String(c.value)) ? null : { phone: true };

/** Optional email. Error key: email */
export const optionalEmail: ValidatorFn = (c: AbstractControl): ValidationErrors | null =>
  isEmpty(c.value) || isEmail(String(c.value)) ? null : { email: true };

/** Phone number or email, used by the login form. Error key: identifier */
export const phoneOrEmail: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  if (isEmpty(c.value)) {
    return null;
  }
  const v = String(c.value).trim();
  return normalizePhone(v) || isEmail(v) ? null : { identifier: true };
};

/** Length rules applied after trimming, like the backend's z.string().trim().min().max(). */
export function trimmedLength(min: number, max: number): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    if (isEmpty(c.value)) {
      return null;
    }
    const len = String(c.value).trim().length;
    if (len < min) {
      return { minlength: { requiredLength: min, actualLength: len } };
    }
    if (len > max) {
      return { maxlength: { requiredLength: max, actualLength: len } };
    }
    return null;
  };
}

/** Optional password: empty is fine, otherwise 8 to 100 characters. */
export const optionalPassword: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = String(c.value ?? '');
  if (v === '') {
    return null;
  }
  if (v.length < 8) {
    return { minlength: { requiredLength: 8, actualLength: v.length } };
  }
  if (v.length > 100) {
    return { maxlength: { requiredLength: 100, actualLength: v.length } };
  }
  return null;
};

/** Group validator: sets { mismatch: true } on the group when the two fields differ. */
export function fieldsMatch(a: string, b: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const first = group.get(a)?.value;
    const second = group.get(b)?.value;
    return first === second ? null : { mismatch: true };
  };
}

/** Same slug rules as backend/src/utils/slug.js, used for the "your link" preview. */
export function slugify(text: string): string {
  return String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}