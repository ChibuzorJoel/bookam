const env = require('../config/env');

/** True when the business has finished payout setup for the ACTIVE payment provider. */
function payoutReady(business) {
  if (!business) return false;
  return env.PAYMENT_PROVIDER === 'payaza' ? Boolean(business.payazaSplitCode) : Boolean(business.paystackSubaccountCode);
}

module.exports = { payoutReady };
