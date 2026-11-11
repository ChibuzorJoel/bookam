// Plan catalogue. Prices are in kobo (₦1 = 100 kobo). Edit freely; the plan says to test prices with real businesses.
const PLANS = {
  free: {
    name: 'Free',
    priceKobo: 0,
    maxProducts: 10,
    features: { booking: false, deposits: false, removeBadge: false, customDomain: false, reminders: false, analytics: false },
  },
  starter: {
    name: 'Starter',
    priceKobo: 400000, // ₦4,000
    maxProducts: Infinity,
    features: { booking: true, deposits: true, removeBadge: true, customDomain: false, reminders: false, analytics: false },
  },
  pro: {
    name: 'Pro',
    priceKobo: 1000000, // ₦10,000
    maxProducts: Infinity,
    features: { booking: true, deposits: true, removeBadge: true, customDomain: true, reminders: true, analytics: true },
  },
};

const PLAN_DURATION_DAYS = 30;

// Billing periods. Annual = pay for 10 months, get 12 (two months free). Neither renews by itself.
const ANNUAL_MONTHS_CHARGED = 10;
const PERIODS = {
  monthly: { months: 1, days: 30 },
  annual: { months: 12, days: 365 },
};
const PERIOD_KEYS = Object.keys(PERIODS);

/** Price in kobo for a paid plan and billing period. */
const priceFor = (plan, period = 'monthly') =>
  period === 'annual' ? PLANS[plan].priceKobo * ANNUAL_MONTHS_CHARGED : PLANS[plan].priceKobo;
const PAID_PLANS = ['starter', 'pro'];

module.exports = { PLANS, PLAN_DURATION_DAYS, PAID_PLANS, PERIODS, PERIOD_KEYS, ANNUAL_MONTHS_CHARGED, priceFor };
