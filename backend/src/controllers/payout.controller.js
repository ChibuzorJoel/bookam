const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const env = require('../config/env');
const paystack = require('../services/paystack.service');
const { Payment } = require('../models');
const { getPagination, pageMeta } = require('../utils/pagination');

// GET /me/payments/banks
exports.listBanks = asyncHandler(async (req, res) => {
  res.json({ status: 'success', data: { banks: await paystack.listBanks() } });
});

// PUT /me/payments/bank  { bankCode, accountNumber }
// Verifies the account name with Paystack, then creates/updates the business's Paystack SUBACCOUNT so deposits are
// settled straight to their bank account. The full account number is never stored in our database.
exports.setupBank = asyncHandler(async (req, res) => {
  const { bankCode, accountNumber } = req.body;
  const business = req.business;

  const resolved = await paystack.resolveAccount(accountNumber, bankCode).catch(() => {
    throw new AppError('We could not verify that account number. Check the bank and number and try again.', 400, 'BANK_RESOLVE_FAILED');
  });
  const banks = await paystack.listBanks();
  const bankName = banks.find((b) => b.code === bankCode)?.name || bankCode;

  const payload = {
    business_name: business.name,
    settlement_bank: bankCode,
    account_number: accountNumber,
    percentage_charge: env.PLATFORM_FEE_PERCENT,
    description: `Payouts for ${business.name}`,
  };

  const sub = business.paystackSubaccountCode
    ? await paystack.updateSubaccount(business.paystackSubaccountCode, payload)
    : await paystack.createSubaccount(payload);

  business.paystackSubaccountCode = sub.subaccount_code;
  business.bank = { bankCode, bankName, accountName: resolved.account_name, accountLast4: accountNumber.slice(-4) };
  await business.save();

  res.json({ status: 'success', data: { bank: business.bank } });
});

// GET /me/payments  (deposit history / payout overview)
exports.listPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { businessId: req.business._id };
  const [payments, total, totals] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('bookingId', 'bookingCode customerName serviceName startAt'),
    Payment.countDocuments(filter),
    Payment.aggregate([
      { $match: { businessId: req.business._id, status: 'success' } },
      { $group: { _id: null, gross: { $sum: '$amount' }, fees: { $sum: '$fee' }, count: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    status: 'success',
    data: {
      bank: req.business.bank,
      payoutsEnabled: Boolean(req.business.paystackSubaccountCode),
      totals: totals[0] ? { gross: totals[0].gross, fees: totals[0].fees, count: totals[0].count } : { gross: 0, fees: 0, count: 0 },
      payments,
      meta: pageMeta(page, limit, total),
    },
  });
});
