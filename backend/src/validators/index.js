const { z } = require('zod');
const { normalizePhone } = require('../utils/phone');
const { isValidDateStr } = require('../utils/time');

// ---------- primitives ----------
const phone = z
  .string({ required_error: 'Phone number is required' })
  .trim()
  .transform((v) => normalizePhone(v))
  .refine((v) => v !== null, 'Enter a valid Nigerian phone number');

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const password = z.string().min(8, 'Password must be at least 8 characters').max(100);
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24-hour) format');
const dateStr = z.string().refine(isValidDateStr, 'Use YYYY-MM-DD format');
const boolish = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);
const intNum = z.coerce.number().int();
const optionalText = (max) => z.string().trim().max(max).optional();
const emptyToUndef = (schema) => z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

// ---------- params / query ----------
const idParam = z.object({ id: objectId });
const slugParam = z.object({ slug: z.string().trim().toLowerCase().min(1).max(60) });
const codeParam = z.object({ code: z.string().trim().toUpperCase().min(4).max(20) });
const referenceParam = z.object({ reference: z.string().trim().min(5).max(100) });

const pagingQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

// ---------- auth ----------
const signup = z.object({
  phone,
  email: emptyToUndef(email),
  password: emptyToUndef(password),
  businessName: z.string().trim().min(2, 'Business name is too short').max(80),
  mode: z.enum(['shop', 'booking', 'both']).default('both'),
  // Optional wish from the home page. Used only when valid and free; otherwise one is generated from the name.
  slug: emptyToUndef(z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(40)),
});
const changePassword = z.object({
  // Empty for accounts that signed up with a phone code only and never set a password.
  currentPassword: z.string().max(100).optional(),
  newPassword: password,
});
const emailRequest = z.object({ email });
const emailVerify = z.object({ email, otp: z.string().regex(/^\d{6}$/, 'The code has 6 digits') });
const requestOtp = z.object({ phone, purpose: z.enum(['signup', 'login', 'reset']).default('login') });
const verifyOtp = z.object({ phone, otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'), purpose: z.enum(['signup', 'login']).default('signup') });
const login = z.object({ identifier: z.string().trim().min(3), password: z.string().min(1) });
const resetPassword = z.object({ phone, otp: z.string().regex(/^\d{6}$/), newPassword: password });

// ---------- business ----------
const businessUpdate = z
  .object({
    name: z.string().trim().min(2).max(80),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes').min(3).max(40),
    tagline: optionalText(120),
    description: optionalText(1000),
    whatsappNumber: phone,
    instagram: z.string().trim().max(60).transform((v) => v.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '')),
    address: optionalText(200),
    area: optionalText(80),
    theme: z.enum(['classic', 'sunset', 'ocean', 'forest', 'royal', 'noir']),
    mode: z.enum(['shop', 'booking', 'both']),
    customDomain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,}$/, 'Enter a valid domain like www.mybusiness.com')
      .or(z.literal('').transform(() => null))
      .nullable(),
  })
  .partial();

const hoursUpdate = z.object({
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        openTime: time.optional(),
        closeTime: time.optional(),
        isClosed: z.boolean().default(false),
      })
    )
    .length(7, 'Provide all 7 weekdays')
    .superRefine((arr, ctx) => {
      const seen = new Set();
      arr.forEach((h, i) => {
        if (seen.has(h.weekday)) ctx.addIssue({ code: 'custom', path: [i, 'weekday'], message: 'Duplicate weekday' });
        seen.add(h.weekday);
        if (!h.isClosed) {
          if (!h.openTime || !h.closeTime) ctx.addIssue({ code: 'custom', path: [i], message: 'openTime and closeTime are required for open days' });
          else if (h.openTime >= h.closeTime) ctx.addIssue({ code: 'custom', path: [i, 'closeTime'], message: 'closeTime must be after openTime' });
        }
      });
    }),
});

const exceptionCreate = z
  .object({ date: dateStr, startTime: time.optional(), endTime: time.optional(), reason: optionalText(200) })
  .refine((v) => (!v.startTime && !v.endTime) || (v.startTime && v.endTime && v.startTime < v.endTime), {
    message: 'Provide both startTime and endTime (start before end), or neither to block the whole day',
  });

const bankSetup = z.object({
  bankCode: z.string().trim().min(2).max(10),
  accountNumber: z.string().regex(/^\d{10}$/, 'Account number must be 10 digits'),
});

// ---------- catalog ----------
const imageUrlsField = z.preprocess((v) => {
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v ? [v] : []; }
  }
  return v;
}, z.array(z.string().url()).max(6).optional());

const productBase = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalText(2000),
  category: optionalText(60),
  price: intNum.min(0, 'Price cannot be negative'), // kobo
  inStock: boolish,
  active: boolish,
  sortOrder: intNum,
  imageUrls: imageUrlsField, // PATCH only: the existing image URLs to keep (new uploads are appended)
});
const productCreate = productBase.required({ name: true, price: true }).partial({ description: true, category: true, inStock: true, active: true, sortOrder: true, imageUrls: true });
const productUpdate = productBase.partial();

const serviceBase = z.object({
  name: z.string().trim().min(1).max(120),
  description: optionalText(2000),
  durationMinutes: intNum.min(5).max(720),
  price: intNum.min(0), // kobo
  depositAmount: intNum.min(0),
  bufferMinutes: intNum.min(0).max(240),
  active: boolish,
});
const serviceCreate = serviceBase.required({ name: true, durationMinutes: true, price: true }).partial({ description: true, depositAmount: true, bufferMinutes: true, active: true });
const serviceUpdate = serviceBase.partial();

// ---------- bookings / orders ----------
const bookingListQuery = pagingQuery.extend({
  from: dateStr.optional(),
  to: dateStr.optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'completed', 'no_show']).optional(),
});

const bookingAction = z
  .object({
    action: z.enum(['confirm', 'cancel', 'complete', 'no_show', 'reschedule']),
    date: dateStr.optional(),
    time: time.optional(),
    reason: optionalText(200),
  })
  .refine((v) => v.action !== 'reschedule' || (v.date && v.time), { message: 'date and time are required to reschedule' });

const publicBookingCreate = z.object({
  serviceId: objectId,
  date: dateStr,
  time,
  customerName: z.string().trim().min(2, 'Enter your name').max(80),
  customerPhone: phone,
  customerEmail: emptyToUndef(email),
  notes: optionalText(500),
});

const availabilityQuery = z.object({ service_id: objectId, date: dateStr });

const publicOrderCreate = z.object({
  customerName: z.string().trim().min(2, 'Enter your name').max(80),
  customerPhone: phone,
  note: optionalText(500),
  items: z.array(z.object({ productId: objectId, qty: z.number().int().min(1).max(50) })).min(1).max(50),
});

const orderUpdate = z.object({ status: z.enum(['new', 'contacted', 'completed', 'cancelled']) });
const orderListQuery = pagingQuery.extend({ status: z.enum(['new', 'contacted', 'completed', 'cancelled']).optional() });

// ---------- billing / admin ----------
const subscribe = z.object({ plan: z.enum(['starter', 'pro']) });

const adminBusinessList = pagingQuery.extend({
  q: z.string().trim().max(60).optional(),
  status: z.enum(['pending', 'active', 'suspended']).optional(),
  plan: z.enum(['free', 'starter', 'pro']).optional(),
});
const adminBusinessUpdate = z
  .object({
    status: z.enum(['pending', 'active', 'suspended']),
    suspendedReason: optionalText(300),
    plan: z.enum(['free', 'starter', 'pro']),
    planExpiresAt: z.coerce.date().nullable(),
  })
  .partial();

const domainQuery = z.object({ host: z.string().trim().toLowerCase().min(3).max(255) });

module.exports = {
  idParam, slugParam, codeParam, referenceParam, pagingQuery,
  signup, requestOtp, verifyOtp, login, resetPassword,
  changePassword, emailRequest, emailVerify, businessUpdate, hoursUpdate, exceptionCreate, bankSetup,
  productCreate, productUpdate, serviceCreate, serviceUpdate,
  bookingListQuery, bookingAction, publicBookingCreate, availabilityQuery, publicOrderCreate,
  orderUpdate, orderListQuery, subscribe, adminBusinessList, adminBusinessUpdate, domainQuery,
};
