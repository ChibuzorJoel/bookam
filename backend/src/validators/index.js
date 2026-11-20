const industryKeys = require('../data/industryTemplates').KEYS;
const { z } = require('zod');
const { normalizePhone } = require('../utils/phone');
const { isValidDateStr } = require('../utils/time');

// ---------- primitives ----------
const phone = z
  .string({ error: 'Phone number is required' })
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
  industry: emptyToUndef(z.enum(industryKeys)),
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
const requestOtp = z.object({
  phone,
  purpose: z.enum(['signup', 'login', 'reset']).default('login'),
  // 'email' is only honoured for login/reset on accounts with a verified email. Sign-up always needs the phone.
  channel: z.enum(['sms', 'email']).default('sms'),
});
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
  fulfilment: z.enum(['pickup', 'delivery']).default('pickup'),
  zoneId: objectId.optional(),
  address: z.string().trim().min(5, 'Enter your full delivery address').max(200).optional(),
  landmark: optionalText(120),
}).superRefine((o, ctx) => {
  if (o.fulfilment === 'delivery') {
    if (!o.zoneId) ctx.addIssue({ code: 'custom', path: ['zoneId'], message: 'Choose your area' });
    if (!o.address) ctx.addIssue({ code: 'custom', path: ['address'], message: 'Enter your full delivery address' });
  }
});

const orderStatus = z.enum(['new', 'contacted', 'preparing', 'out_for_delivery', 'delivered', 'completed', 'cancelled']);
const orderUpdate = z.object({ status: orderStatus, code: z.string().trim().regex(/^\d{4}$/, 'The code is 4 digits').optional() });
const orderListQuery = pagingQuery.extend({ status: orderStatus.optional() });

const deliveryUpdate = z.object({
  enabled: z.boolean(),
  allowPickup: z.boolean(),
  zones: z
    .array(
      z.object({
        name: z.string().trim().min(2, 'Give the area a name').max(40),
        fee: z.number().int().min(0).max(5000000), // kobo, up to N50,000
      })
    )
    .max(25, 'You can add up to 25 areas')
    .superRefine((zones, ctx) => {
      const seen = new Set();
      zones.forEach((z, i) => {
        const k = z.name.toLowerCase();
        if (seen.has(k)) ctx.addIssue({ code: 'custom', path: [i, 'name'], message: 'This area is already listed' });
        seen.add(k);
      });
    }),
}).refine((d) => !d.enabled || d.zones.length > 0, { message: 'Add at least one delivery area first', path: ['zones'] });

// ---------- billing / admin ----------
const subscribe = z.object({ plan: z.enum(['starter', 'pro']), period: z.enum(['monthly', 'annual']).default('monthly') });

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

// ---------- assistant ----------
const assistantChat = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .min(1, 'Type a question')
    .max(20),
});
const knowledgeCreate = z.object({
  question: z.string().trim().min(3, 'Add a question').max(200),
  answer: z.string().trim().min(3, 'Add an answer').max(1500),
  active: z.boolean().optional(),
});
const knowledgeUpdate = knowledgeCreate.partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
const gapResolve = z.discriminatedUnion('action', [
  z.object({ action: z.literal('answer'), question: z.string().trim().min(3).max(200).optional(), answer: z.string().trim().min(3, 'Add an answer').max(1500) }),
  z.object({ action: z.literal('ignore') }),
]);

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const adminPaymentList = pagingQuery.extend({
  kind: z.enum(['deposit', 'subscription']).default('subscription'),
  status: z.string().trim().max(20).optional(),
  q: z.string().trim().max(80).optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
});
const supportCreate = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  contact: z.string().trim().min(5, 'Enter a phone number or email').max(120),
  message: z.string().trim().min(5, 'Tell us how we can help').max(1500),
  page: z.string().trim().max(120).optional(),
});
const supportList = pagingQuery.extend({ status: z.enum(['open', 'replied', 'closed']).optional() });
const supportUpdate = z
  .object({ status: z.enum(['open', 'replied', 'closed']).optional(), note: z.string().trim().max(1000).optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const checklistUpdate = z
  .object({ shared: z.literal(true).optional(), dismissed: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const reviewCreate = z.object({
  rating: z.coerce.number().int().min(1, 'Choose 1 to 5 stars').max(5, 'Choose 1 to 5 stars'),
  comment: z.string().trim().max(500, 'Keep it under 500 characters').optional(),
});
const reviewUpdate = z
  .object({ reply: z.string().trim().max(300, 'Keep your reply under 300 characters').optional(), hidden: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
const reviewListQuery = pagingQuery;
const pushSubscribe = z.object({
  endpoint: z.string().url().max(1000).startsWith('https://', 'Push endpoints must be https'),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});
const pushUnsubscribe = z.object({ endpoint: z.string().url().max(1000) });

module.exports = {
  reviewCreate, reviewUpdate, reviewListQuery, pushSubscribe, pushUnsubscribe,
  checklistUpdate,
  adminPaymentList, supportCreate, supportList, supportUpdate,
  assistantChat, knowledgeCreate, knowledgeUpdate, gapResolve,
  idParam, slugParam, codeParam, referenceParam, pagingQuery,
  signup, requestOtp, verifyOtp, login, resetPassword,
  changePassword, emailRequest, emailVerify, businessUpdate, hoursUpdate, exceptionCreate, bankSetup,
  productCreate, productUpdate, serviceCreate, serviceUpdate,
  bookingListQuery, bookingAction, publicBookingCreate, availabilityQuery, publicOrderCreate,
  orderUpdate, orderListQuery, deliveryUpdate, subscribe, adminBusinessList, adminBusinessUpdate, domainQuery,
};
