const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { Business, User, Booking, Order, Payment, Subscription } = require('../models');
const { getPagination, pageMeta } = require('../utils/pagination');
const { PLANS } = require('../config/plans');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /admin/businesses?q=&status=&plan=&page=&limit=
exports.listBusinesses = asyncHandler(async (req, res) => {
  const { q, status, plan } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  const filter = {};
  if (status) filter.status = status;
  if (plan) filter.plan = plan;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { slug: rx }, { whatsappNumber: rx }];
  }

  const [items, total] = await Promise.all([
    Business.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('ownerId', 'phone email createdAt lastLoginAt status').lean(),
    Business.countDocuments(filter),
  ]);
  res.json({ status: 'success', data: { businesses: items, meta: pageMeta(page, limit, total) } });
});

// PATCH /admin/businesses/:id  (approve, suspend, change plan)
exports.updateBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id);
  if (!business) throw new AppError('Business not found.', 404, 'NOT_FOUND');

  const { status, suspendedReason, plan, planExpiresAt } = req.body;
  if (status) {
    business.status = status;
    business.suspendedReason = status === 'suspended' ? suspendedReason || 'Suspended by admin' : undefined;
  }
  if (plan) business.plan = plan;
  if (planExpiresAt !== undefined) business.planExpiresAt = planExpiresAt || undefined;
  await business.save();
  res.json({ status: 'success', data: { business } });
});

// GET /admin/stats  -> basic revenue and signup numbers
exports.stats = asyncHandler(async (req, res) => {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [byPlan, byStatus, signupsPerDay, totals, subscriptionRevenue, depositVolume, activeSubs] = await Promise.all([
    Business.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
    Business.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate([
      { $match: { role: 'owner', createdAt: { $gte: since30 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Africa/Lagos' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Promise.all([User.countDocuments({ role: 'owner', phoneVerified: true }), Booking.countDocuments(), Order.countDocuments()]),
    Subscription.aggregate([{ $match: { status: { $in: ['active', 'expired'] } } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' }, fees: { $sum: '$fee' }, count: { $sum: 1 } } }]),
    Business.find({ plan: { $ne: 'free' }, planExpiresAt: { $gt: new Date() } }).select('plan').lean(),
  ]);

  const mrr = activeSubs.reduce((sum, b) => sum + (PLANS[b.plan]?.priceKobo || 0), 0);
  res.json({
    status: 'success',
    data: {
      totals: { verifiedOwners: totals[0], bookings: totals[1], orders: totals[2] },
      businessesByPlan: Object.fromEntries(byPlan.map((x) => [x._id, x.count])),
      businessesByStatus: Object.fromEntries(byStatus.map((x) => [x._id, x.count])),
      signupsPerDay: signupsPerDay.map((d) => ({ date: d._id, count: d.count })),
      revenue: {
        subscriptionsTotal: subscriptionRevenue[0]?.total || 0,
        subscriptionPayments: subscriptionRevenue[0]?.count || 0,
        monthlyRecurring: mrr,
        depositVolume: depositVolume[0]?.total || 0,
        depositCount: depositVolume[0]?.count || 0,
        paystackFees: depositVolume[0]?.fees || 0,
      },
    },
  });
});
