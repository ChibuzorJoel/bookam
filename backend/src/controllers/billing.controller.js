const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { PLANS, PAID_PLANS, PERIODS, ANNUAL_MONTHS_CHARGED, priceFor } = require('../config/plans');
const { Subscription } = require('../models');
const { effectivePlanKey } = require('../middleware/planGuard');
const { startSubscriptionPayment } = require('../services/payment.service');

const catalogue = () =>
  Object.entries(PLANS).map(([key, p]) => ({
    key,
    name: p.name,
    priceKobo: p.priceKobo,
    annualPriceKobo: p.priceKobo ? p.priceKobo * ANNUAL_MONTHS_CHARGED : 0,
    annualSavingKobo: p.priceKobo ? p.priceKobo * (12 - ANNUAL_MONTHS_CHARGED) : 0,
    maxProducts: p.maxProducts === Infinity ? null : p.maxProducts,
    features: p.features,
  }));

// GET /billing/plans  (public, used by the marketing page)
exports.listPlans = asyncHandler(async (req, res) => {
  res.json({ status: 'success', data: { plans: catalogue() } });
});

// POST /billing/subscribe  { plan: 'starter' | 'pro', period?: 'monthly' | 'annual' }  -> returns a Paystack checkout URL
// A simple monthly payment per period (not auto-renewing): many Nigerian cards fail on auto-renewal, so we
// send a reminder before expiry and the owner pays again.
exports.subscribe = asyncHandler(async (req, res) => {
  const { plan, period } = req.body;
  if (!PAID_PLANS.includes(plan)) throw new AppError('Invalid plan.', 400, 'INVALID_PLAN');

  const payment = await startSubscriptionPayment({
    business: req.business,
    plan,
    period,
    durationDays: PERIODS[period].days,
    amount: priceFor(plan, period),
    email: req.user.email,
    phone: req.user.phone,
  });
  res.status(201).json({ status: 'success', data: payment });
});

// GET /billing/status
exports.status = asyncHandler(async (req, res) => {
  const b = req.business;
  const key = effectivePlanKey(b);
  const history = await Subscription.find({ businessId: b._id, status: { $in: ['active', 'expired'] } })
    .sort({ createdAt: -1 })
    .limit(12)
    .select('plan period amount status startedAt endsAt paystackReference');

  res.json({
    status: 'success',
    data: {
      plan: key,
      storedPlan: b.plan,
      planExpiresAt: b.planExpiresAt || null,
      active: key !== 'free',
      limits: { maxProducts: PLANS[key].maxProducts === Infinity ? null : PLANS[key].maxProducts, features: PLANS[key].features },
      history,
      plans: catalogue(),
    },
  });
});
