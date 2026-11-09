const env = require('../config/env');
const AppError = require('../utils/AppError');
const { PLANS } = require('../config/plans');

/** Plan that currently applies (a paid plan whose period has lapsed behaves like free until the job downgrades it). */
function effectivePlanKey(business) {
  if (business.plan !== 'free' && business.planExpiresAt && business.planExpiresAt < new Date()) return 'free';
  return business.plan;
}
const planOf = (business) => PLANS[effectivePlanKey(business)] || PLANS.free;

/** True when the business's plan includes the feature (always true if ENFORCE_PLAN_LIMITS=false). */
const hasFeature = (business, feature) => !env.ENFORCE_PLAN_LIMITS || planOf(business).features[feature] === true;

function assertFeature(business, feature, message) {
  if (!hasFeature(business, feature)) {
    throw new AppError(message || 'Your current plan does not include this feature. Please upgrade.', 403, 'PLAN_UPGRADE_REQUIRED');
  }
}

/** Route middleware version for owner endpoints. */
const requireFeature = (feature, message) => (req, res, next) => {
  try {
    assertFeature(req.business, feature, message);
    next();
  } catch (e) {
    next(e);
  }
};

module.exports = { effectivePlanKey, planOf, hasFeature, assertFeature, requireFeature };
