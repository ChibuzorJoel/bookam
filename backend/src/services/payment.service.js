const crypto = require('crypto');
const env = require('../config/env');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');
const { Booking, Business, Payment, Subscription } = require('../models');
const paystack = require('./paystack.service');
const payaza = require('./payaza.service');
const { payoutReady } = require('../utils/payout');
const notifications = require('./notification.service');
const messages = require('../templates/messages');
const { generateReference } = require('../utils/ids');
const { PLAN_DURATION_DAYS } = require('../config/plans');

const siteUrl = () => env.PUBLIC_BASE_URL.replace(/\/$/, '');
const emailFor = (email, phone) => email || `${phone}@${env.PLACEHOLDER_EMAIL_DOMAIN}`;

const naira = (kobo) => Math.round(kobo) / 100;
const intlPhone = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d ? `+${d}` : '+2340000000000';
};
const splitName = (full) => {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || 'Customer', lastName: parts.slice(1).join(' ') || parts[0] || 'Customer' };
};

/** Payaza has no "initialise" call: the browser opens its checkout popup with this config, and we verify by reference. */
function payazaCheckout({ reference, amount, email, name, phone, splitCode, billerName, details }) {
  return {
    merchantKey: env.PAYAZA_PUBLIC_KEY, // public by design
    mode: env.PAYAZA_MODE,
    reference,
    amount: naira(amount),
    currency: 'NGN',
    email,
    ...splitName(name),
    phone: intlPhone(phone),
    billerName,
    // One beneficiary gets the whole remainder. Payaza weights splits in tenths, so a single account is always 10.
    ...(splitCode ? { splitAccounts: [{ code: splitCode, ratio: 10 }] } : {}),
    additionalDetails: details,
  };
}

/** Verifies the x-paystack-signature header (HMAC-SHA512 of the RAW body with your secret key). */
function isValidSignature(rawBody, signature) {
  if (!signature || !env.PAYSTACK_SECRET_KEY || !Buffer.isBuffer(rawBody)) return false;
  const expected = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Starts a deposit payment for a pending booking. Uses the business's Paystack SUBACCOUNT so the money goes
 * straight to the business's bank account (the platform never holds customer funds). An optional platform fee
 * is kept via transaction_charge.
 */
async function startBookingPayment({ booking, business }) {
  if (!payoutReady(business)) {
    throw new AppError('This business has not finished setting up payments yet. Please contact them on WhatsApp.', 409, 'PAYOUT_NOT_SET');
  }
  const amount = booking.depositAmount;
  const reference = generateReference('BKG');
  const platformFee = Math.round((amount * env.PLATFORM_FEE_PERCENT) / 100);

  if (env.PAYMENT_PROVIDER === 'payaza') {
    if (!env.PAYAZA_PUBLIC_KEY) throw new AppError('Payments are not configured on this server.', 503, 'PAYMENTS_DISABLED');
    await Payment.create({ businessId: business._id, bookingId: booking._id, provider: 'payaza', paystackReference: reference, amount, status: 'pending' });
    return {
      provider: 'payaza',
      authorizationUrl: null,
      accessCode: null,
      reference,
      checkout: payazaCheckout({
        reference,
        amount,
        email: emailFor(booking.customerEmail, booking.customerPhone),
        name: booking.customerName,
        phone: booking.customerPhone,
        splitCode: business.payazaSplitCode,
        billerName: business.name,
        details: { type: 'booking_deposit', bookingCode: booking.bookingCode },
      }),
    };
  }

  const init = await paystack.initializeTransaction({
    email: emailFor(booking.customerEmail, booking.customerPhone),
    amount,
    currency: 'NGN',
    reference,
    callback_url: `${siteUrl()}/${business.slug}/booking/${booking.bookingCode}`,
    subaccount: business.paystackSubaccountCode,
    ...(platformFee > 0 ? { transaction_charge: platformFee } : {}),
    bearer: 'subaccount', // the business bears Paystack's processing fee, so the platform is never out of pocket
    metadata: {
      type: 'booking_deposit',
      bookingCode: booking.bookingCode,
      bookingId: String(booking._id),
      businessId: String(business._id),
      custom_fields: [{ display_name: 'Booking code', variable_name: 'booking_code', value: booking.bookingCode }],
    },
  });

  await Payment.create({
    businessId: business._id,
    bookingId: booking._id,
    paystackReference: reference,
    amount,
    status: 'pending',
  });

  return { provider: 'paystack', authorizationUrl: init.authorization_url, accessCode: init.access_code, reference };
}

/** Subscription payment goes to the PLATFORM Paystack account (no subaccount). */
async function startSubscriptionPayment({ business, plan, period = 'monthly', durationDays = PLAN_DURATION_DAYS, amount, email, phone }) {
  const reference = generateReference('SUB');

  if (env.PAYMENT_PROVIDER === 'payaza') {
    if (!env.PAYAZA_PUBLIC_KEY) throw new AppError('Payments are not configured on this server.', 503, 'PAYMENTS_DISABLED');
    await Subscription.create({ businessId: business._id, plan, period, durationDays, amount, provider: 'payaza', paystackReference: reference, status: 'pending' });
    return {
      provider: 'payaza',
      authorizationUrl: null,
      accessCode: null,
      reference,
      checkout: payazaCheckout({
        reference,
        amount,
        email: emailFor(email, phone),
        name: business.name,
        phone,
        billerName: 'LagosPages',
        details: { type: 'subscription', plan, period },
      }),
    };
  }

  const init = await paystack.initializeTransaction({
    email: emailFor(email, phone),
    amount,
    currency: 'NGN',
    reference,
    callback_url: `${siteUrl()}/dashboard/billing`,
    metadata: { type: 'subscription', plan, period, businessId: String(business._id) },
  });
  await Subscription.create({ businessId: business._id, plan, period, durationDays, amount, paystackReference: reference, status: 'pending' });
  return { provider: 'paystack', authorizationUrl: init.authorization_url, accessCode: init.access_code, reference };
}

/**
 * Idempotent: safe to call many times for the same reference (Paystack retries webhooks; the browser may also
 * call /payments/verify). The atomic findOneAndUpdate on status != 'success' guarantees only one caller wins.
 */
async function settleBookingPayment(payment, verified) {
  if (verified.amount !== payment.amount) {
    logger.error(`Amount mismatch for ${payment.paystackReference}: expected ${payment.amount}, got ${verified.amount}`);
    await Payment.updateOne({ _id: payment._id }, { $set: { status: 'amount_mismatch' } });
    return null;
  }

  const claimed = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $ne: 'success' } },
    { $set: { status: 'success', paidAt: verified.paid_at ? new Date(verified.paid_at) : new Date(), fee: verified.fees || 0, rawPayload: verified } },
    { new: true }
  );
  if (!claimed) return null; // already processed

  const business = await Business.findById(payment.businessId);

  // Normal path: still pending -> confirmed
  let booking = await Booking.findOneAndUpdate(
    { _id: payment.bookingId, status: 'pending' },
    { $set: { status: 'confirmed', slotActive: true, paymentStatus: 'paid' }, $unset: { holdExpiresAt: '' } },
    { new: true }
  );

  if (!booking) {
    booking = await Booking.findById(payment.bookingId);
    if (!booking) return null;

    if (booking.status === 'confirmed') {
      // e.g. the owner confirmed it manually before the webhook arrived
      booking.paymentStatus = 'paid';
      await booking.save();
    } else if (booking.status === 'cancelled' && booking.cancelReason === 'hold_expired') {
      // The customer paid after the 10-minute hold lapsed. Re-instate if the slot is still free.
      try {
        booking.status = 'confirmed';
        booking.paymentStatus = 'paid';
        booking.cancelReason = undefined;
        booking.holdExpiresAt = undefined;
        await booking.save(); // pre-validate sets slotActive=true; the unique index rejects it if someone else took the slot
      } catch (err) {
        if (err.code !== 11000) throw err;
        await Booking.updateOne({ _id: booking._id }, { $set: { status: 'cancelled', slotActive: false, paymentStatus: 'refund_required' } });
        booking = await Booking.findById(booking._id);
        if (business) notifications.background(notifications.refundRequired(booking, business));
        return booking;
      }
    } else {
      // cancelled by the owner / completed etc. after payment: flag for refund
      booking.paymentStatus = 'refund_required';
      await booking.save();
      if (business) notifications.background(notifications.refundRequired(booking, business));
      return booking;
    }
  }

  if (business) notifications.background(notifications.bookingConfirmed(booking, business));
  return booking;
}

async function settleSubscription(sub, verified) {
  if (verified.amount !== sub.amount) {
    logger.error(`Subscription amount mismatch for ${sub.paystackReference}`);
    await Subscription.updateOne({ _id: sub._id }, { $set: { status: 'failed' } });
    return null;
  }
  const now = new Date();
  const business = await Business.findById(sub.businessId);
  if (!business) return null;

  // Renewals extend from the current expiry (if still active) so early renewers do not lose days.
  const base = business.planExpiresAt && business.planExpiresAt > now && business.plan !== 'free' ? business.planExpiresAt : now;
  const endsAt = new Date(base.getTime() + (sub.durationDays || PLAN_DURATION_DAYS) * 24 * 60 * 60 * 1000);

  const claimed = await Subscription.findOneAndUpdate(
    { _id: sub._id, status: { $ne: 'active' } },
    { $set: { status: 'active', startedAt: now, endsAt, rawPayload: verified } },
    { new: true }
  );
  if (!claimed) return null;

  business.plan = sub.plan;
  business.planExpiresAt = endsAt;
  business.renewalReminderFor = undefined;
  business.renewalSent = []; // a new period starts: allow fresh renewal reminders
  await business.save();
  notifications.background(notifications.toOwner(business, 'subscription_activated', 'Your plan is active', messages.subscriptionActivated({ plan: sub.plan, endsAt })));
  return claimed;
}

/**
 * Entry point for webhooks + the verify endpoint, for either provider. Looks the reference up in OUR records first
 * (that tells us the provider and the expected amount), then always re-verifies with the provider. Never trusts a
 * webhook payload or a browser callback on its own.
 */
async function handleChargeSuccess(reference) {
  const payment = await Payment.findOne({ paystackReference: reference });
  const sub = payment ? null : await Subscription.findOne({ paystackReference: reference });
  const record = payment || sub;
  if (!record) {
    logger.warn(`Payment event for unknown reference ${reference}`);
    return { handled: false, status: 'unknown_reference' };
  }

  const verified =
    record.provider === 'payaza' ? await payaza.verifyTransaction(reference, record.amount) : await paystack.verifyTransaction(reference);
  if (verified.status !== 'success') return { handled: false, status: verified.status };

  if (payment) {
    await settleBookingPayment(payment, verified);
    return { handled: true, kind: 'booking' };
  }
  await settleSubscription(sub, verified);
  return { handled: true, kind: 'subscription' };
}

module.exports = { isValidSignature, isValidPayazaSignature: payaza.isValidSignature, startBookingPayment, startSubscriptionPayment, handleChargeSuccess };
