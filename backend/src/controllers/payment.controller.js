const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const { Booking, Payment, Subscription } = require('../models');
const { isValidSignature, isValidPayazaSignature, handleChargeSuccess } = require('../services/payment.service');

// POST /payments/webhook/paystack
// IMPORTANT: this route receives the RAW body (see app.js). The signature is checked against the raw bytes.
// The webhook, not the browser redirect, is the source of truth for "paid".
exports.paystackWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  if (!isValidSignature(req.body, signature)) {
    logger.warn('Rejected Paystack webhook with bad signature');
    return res.status(401).json({ status: 'error', message: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ status: 'error', message: 'Bad payload' });
  }

  if (event.event === 'charge.success' && event.data?.reference) {
    // If this throws we return 500 and Paystack retries later. The handler is idempotent, so retries are safe.
    await handleChargeSuccess(event.data.reference);
  }
  res.status(200).json({ status: 'success' }); // always 200 for events we do not care about
});

// POST /payments/webhook/payaza  (raw body, see app.js). Signature = base64 HMAC-SHA512 of the raw body.
// The payload is only a hint: handleChargeSuccess re-checks the payment with Payaza by our own reference.
exports.payazaWebhook = asyncHandler(async (req, res) => {
  if (!isValidPayazaSignature(req.body, req.headers['x-payaza-signature'])) {
    logger.warn('Rejected Payaza webhook with bad signature');
    return res.status(401).json({ status: 'error', message: 'Invalid signature' });
  }
  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ status: 'error', message: 'Bad payload' });
  }
  const reference = event.merchant_reference || event.data?.merchant_reference || event.transaction_reference;
  if (reference) await handleChargeSuccess(String(reference)); // idempotent; a 500 makes Payaza retry
  res.status(200).json({ status: 'success' });
});

// GET /payments/verify/:reference
// Optional helper for the confirmation page: after the Paystack popup closes, the frontend can call this so a
// customer is confirmed even if the webhook is a few seconds late. It re-verifies with Paystack server-side, so
// it cannot be faked, and it shares the same idempotent code path as the webhook.
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { reference } = req.params;
  res.set('Cache-Control', 'no-store');

  const payment = await Payment.findOne({ paystackReference: reference });
  if (payment) {
    if (payment.status !== 'success') await handleChargeSuccess(reference);
    const booking = await Booking.findById(payment.bookingId).select('bookingCode status paymentStatus');
    return res.json({
      status: 'success',
      data: { kind: 'booking', bookingCode: booking?.bookingCode, bookingStatus: booking?.status, paymentStatus: booking?.paymentStatus },
    });
  }

  // Plan payments (SUB...). Without this the plan only activates through the webhook, which never reaches localhost
  // and can be late in production, so the owner would sit on "confirming" after paying.
  const sub = await Subscription.findOne({ paystackReference: reference });
  if (!sub) throw new AppError('Payment not found.', 404, 'NOT_FOUND');
  if (sub.status !== 'active') await handleChargeSuccess(reference);
  const fresh = await Subscription.findById(sub._id).select('plan status endsAt');
  res.json({ status: 'success', data: { kind: 'subscription', plan: fresh.plan, subscriptionStatus: fresh.status, endsAt: fresh.endsAt } });
});
