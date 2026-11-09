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
const PAID_PLANS = ['starter', 'pro'];

module.exports = { PLANS, PLAN_DURATION_DAYS, PAID_PLANS };
