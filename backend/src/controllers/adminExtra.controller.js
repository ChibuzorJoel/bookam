const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { Business, User, Booking, Order, Payment, Subscription, SupportMessage, Service, Product } = require('../models');
const { getPagination, pageMeta } = require('../utils/pagination');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LAGOS = '+01:00';
const dayStart = (d) => new Date(`${d}T00:00:00${LAGOS}`);
const dayEnd = (d) => new Date(`${d}T23:59:59.999${LAGOS}`);

/* ---------------------------------------------------------------- payments */

/** Builds the Mongo filter for either collection from the query. Search matches a reference or a business name. */
const paymentFilter = async ({ kind, status, q, from, to }) => {
  const f = {};
  if (status) f.status = status;
  if (from || to) {
    f.createdAt = {};
    if (from) f.createdAt.$gte = dayStart(from);
    if (to) f.createdAt.$lte = dayEnd(to);
  }
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const ids = await Business.find({ $or: [{ name: rx }, { slug: rx }] }).select('_id').limit(200).lean();
    f.$or = [{ paystackReference: rx }, { businessId: { $in: ids.map((b) => b._id) } }];
  }
  return { Model: kind === 'deposit' ? Payment : Subscription, filter: f };
};

const row = (kind, d) => ({
  id: d._id,
  kind,
  reference: d.paystackReference,
  provider: d.provider || 'paystack',
  amount: d.amount,
  fee: kind === 'deposit' ? d.fee || 0 : 0,
  status: d.status,
  plan: kind === 'subscription' ? d.plan : undefined,
  period: kind === 'subscription' ? d.period : undefined,
  business: d.businessId && d.businessId._id ? { id: d.businessId._id, name: d.businessId.name, slug: d.businessId.slug } : null,
  createdAt: d.createdAt,
  paidAt: kind === 'deposit' ? d.paidAt : d.startedAt,
});

// GET /admin/payments?kind=subscription|deposit&status=&q=&from=&to=&page=&limit=
exports.listPayments = asyncHandler(async (req, res) => {
  const { kind } = req.query;
  const { page, limit, skip } = getPagination(req.query);
  const { Model, filter } = await paymentFilter(req.query);
  const successStatus = kind === 'deposit' ? 'success' : { $in: ['active', 'expired'] };

  const [items, total, sums] = await Promise.all([
    Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('businessId', 'name slug').lean(),
    Model.countDocuments(filter),
    Model.aggregate([
      { $match: { ...filter, status: successStatus } },
      { $group: { _id: null, amount: { $sum: '$amount' }, fees: { $sum: kind === 'deposit' ? '$fee' : 0 }, count: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    status: 'success',
    data: {
      payments: items.map((d) => row(kind, d)),
      totals: { amount: sums[0]?.amount || 0, fees: sums[0]?.fees || 0, count: sums[0]?.count || 0 },
      meta: pageMeta(page, limit, total),
    },
  });
});

const csvCell = (v) => {
  let s = v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stops spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// GET /admin/payments/export?...same filters...  -> CSV (max 5000 rows). Amounts are in naira.
exports.exportPayments = asyncHandler(async (req, res) => {
  const { kind } = req.query;
  const { Model, filter } = await paymentFilter(req.query);
  const items = await Model.find(filter).sort({ createdAt: -1 }).limit(5000).populate('businessId', 'name slug').lean();
  const head = ['Date', 'Type', 'Business', 'Reference', 'Provider', 'Plan', 'Status', 'Amount (NGN)', 'Fee (NGN)'];
  const lines = [head.join(',')];
  for (const d of items) {
    const r = row(kind, d);
    lines.push(
      [
        new Date(r.createdAt).toISOString(), kind, r.business?.name, r.reference, r.provider,
        r.plan ? `${r.plan} ${r.period}` : '', r.status, (r.amount / 100).toFixed(2), (r.fee / 100).toFixed(2),
      ].map(csvCell).join(',')
    );
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bookam-${kind}-payments.csv"`);
  res.send('﻿' + lines.join('\r\n'));
});

/* --------------------------------------------------------- business detail */

// GET /admin/businesses/:id
exports.getBusiness = asyncHandler(async (req, res) => {
  const business = await Business.findById(req.params.id).populate('ownerId', 'phone email emailVerified createdAt lastLoginAt status').lean();
  if (!business) throw new AppError('Business not found.', 404, 'NOT_FOUND');
  const id = business._id;

  const [bookings, orders, products, services, recentBookings, recentOrders, subs, deposits] = await Promise.all([
    Booking.countDocuments({ businessId: id }),
    Order.countDocuments({ businessId: id }),
    Product.countDocuments({ businessId: id }),
    Service.countDocuments({ businessId: id }),
    Booking.find({ businessId: id }).sort({ createdAt: -1 }).limit(8).select('bookingCode serviceName customerName startAt status paymentStatus depositAmount price').lean(),
    Order.find({ businessId: id }).sort({ createdAt: -1 }).limit(8).select('orderCode customerName total status fulfilment createdAt').lean(),
    Subscription.find({ businessId: id }).sort({ createdAt: -1 }).limit(10).select('plan period amount status startedAt endsAt provider paystackReference createdAt').lean(),
    Payment.aggregate([{ $match: { businessId: id, status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
  ]);

  res.json({
    status: 'success',
    data: {
      business: {
        _id: business._id, name: business.name, slug: business.slug, status: business.status, suspendedReason: business.suspendedReason,
        plan: business.plan, planExpiresAt: business.planExpiresAt, mode: business.mode, whatsappNumber: business.whatsappNumber,
        createdAt: business.createdAt, owner: business.ownerId || null,
        delivery: { enabled: Boolean(business.delivery?.enabled), zones: (business.delivery?.zones || []).length },
      },
      counts: { bookings, orders, products, services },
      deposits: { total: deposits[0]?.total || 0, count: deposits[0]?.count || 0 },
      recentBookings,
      recentOrders,
      subscriptions: subs,
    },
  });
});

/* ---------------------------------------------------------------- support */

// POST /public/support  (visitors; rate limited)
exports.createSupport = asyncHandler(async (req, res) => {
  await SupportMessage.create(req.body);
  res.status(201).json({ status: 'success', message: 'Thank you. A person will get back to you soon.', data: {} });
});

exports.listSupport = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = req.query.status ? { status: req.query.status } : {};
  const [items, total, open] = await Promise.all([
    SupportMessage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    SupportMessage.countDocuments(filter),
    SupportMessage.countDocuments({ status: 'open' }),
  ]);
  res.json({ status: 'success', data: { messages: items, openCount: open, meta: pageMeta(page, limit, total) } });
});

exports.updateSupport = asyncHandler(async (req, res) => {
  const patch = { ...req.body };
  if (patch.status === 'replied') patch.repliedAt = new Date();
  const msg = await SupportMessage.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true });
  if (!msg) throw new AppError('Message not found.', 404, 'NOT_FOUND');
  res.json({ status: 'success', data: { message: msg } });
});
