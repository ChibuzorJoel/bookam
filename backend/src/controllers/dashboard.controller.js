const QRCode = require('qrcode');
const asyncHandler = require('../utils/asyncHandler');
const { Booking, Order, Payment, Product, Service } = require('../models');
const { payoutReady } = require('../utils/payout');
const { dayRange, todayLagos, addDaysStr, toDate } = require('../utils/time');
const { publicUrl } = require('../services/business.service');
const { assertFeature } = require('../middleware/planGuard');
const env = require('../config/env');

// GET /me/dashboard  -> "simple view of today's bookings and recent orders"
exports.summary = asyncHandler(async (req, res) => {
  const businessId = req.business._id;
  const today = todayLagos();
  const { start, end } = dayRange(today);
  const weekAhead = dayRange(addDaysStr(today, 7)).start;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = toDate(`${today.slice(0, 8)}01`, '00:00');
  const live = { $in: ['pending', 'confirmed', 'completed', 'no_show'] };

  const [todaysBookings, recentOrders, upcoming, pendingBookings, newOrders, ordersLast7, depositsThisMonth] = await Promise.all([
    Booking.find({ businessId, startAt: { $gte: start, $lt: end }, status: live }).sort({ startAt: 1 }).lean(),
    Order.find({ businessId }).sort({ createdAt: -1 }).limit(10).lean(),
    Booking.countDocuments({ businessId, status: 'confirmed', startAt: { $gte: new Date(), $lt: weekAhead } }),
    Booking.countDocuments({ businessId, status: 'pending', holdExpiresAt: { $gt: new Date() } }),
    Order.countDocuments({ businessId, status: 'new' }),
    Order.countDocuments({ businessId, createdAt: { $gte: weekAgo } }),
    Payment.aggregate([
      { $match: { businessId, status: 'success', paidAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  res.json({
    status: 'success',
    data: {
      today,
      todaysBookings,
      recentOrders,
      stats: {
        upcomingConfirmed7d: upcoming,
        awaitingPayment: pendingBookings,
        newOrders,
        ordersLast7Days: ordersLast7,
        depositsThisMonth: depositsThisMonth[0]?.total || 0,
      },
    },
  });
});

// GET /me/analytics  (Pro plan): last 30 days, per day
exports.analytics = asyncHandler(async (req, res) => {
  assertFeature(req.business, 'analytics', 'Analytics is available on the Pro plan.');
  const businessId = req.business._id;
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const perDay = (field) => [
    { $match: { businessId, createdAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: field ? `$${field}` : '$createdAt', timezone: 'Africa/Lagos' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ];

  const [bookingsPerDay, ordersPerDay, byStatus, topServices, deposits] = await Promise.all([
    Booking.aggregate(perDay()),
    Order.aggregate(perDay()),
    Booking.aggregate([{ $match: { businessId, createdAt: { $gte: since } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Booking.aggregate([
      { $match: { businessId, createdAt: { $gte: since }, status: { $in: ['confirmed', 'completed'] } } },
      { $group: { _id: '$serviceName', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    Payment.aggregate([
      { $match: { businessId, status: 'success', paidAt: { $gte: since } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    status: 'success',
    data: {
      bookingsPerDay: bookingsPerDay.map((d) => ({ date: d._id, count: d.count })),
      ordersPerDay: ordersPerDay.map((d) => ({ date: d._id, count: d.count })),
      bookingsByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
      topServices: topServices.map((s) => ({ name: s._id, count: s.count })),
      deposits: { total: deposits[0]?.total || 0, count: deposits[0]?.count || 0 },
    },
  });
});

// GET /me/share  -> link, QR (as a data URL), ready-made social text
exports.share = asyncHandler(async (req, res) => {
  const url = publicUrl(req.business);
  const qrDataUrl = await QRCode.toDataURL(url, { margin: 2, width: 512 });
  res.json({
    status: 'success',
    data: {
      url,
      qrDataUrl,
      whatsappStatusLink: `https://wa.me/?text=${encodeURIComponent(`Book or order from ${req.business.name} here: ${url}`)}`,
      templates: [
        `Book your next appointment with ${req.business.name} online. Pick a time and secure it with a deposit: ${url}`,
        `Our full menu and prices are now online. Order straight to WhatsApp: ${url}`,
        `Link in bio: ${url}  (${env.PLATFORM_NAME})`,
      ],
    },
  });
});

// GET /me/share/qr.png  -> downloadable QR image
exports.qrPng = asyncHandler(async (req, res) => {
  const png = await QRCode.toBuffer(publicUrl(req.business), { margin: 2, width: 1024, type: 'png' });
  res.set({ 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${req.business.slug}-qr.png"` });
  res.send(png);
});


/**
 * GET /me/checklist -> "Get your page ready" steps, worked out from what the owner has actually done.
 * Each step carries the page to open, so the frontend only has to show it.
 */
exports.checklist = asyncHandler(async (req, res) => {
  const b = req.business;
  const businessId = b._id;
  const [products, services, booking, order] = await Promise.all([
    Product.countDocuments({ businessId }),
    Service.countDocuments({ businessId }),
    Booking.exists({ businessId }),
    Order.exists({ businessId }),
  ]);

  const sells = b.mode === 'shop' ? 'product' : b.mode === 'booking' ? 'service' : 'service or product';
  const hasCatalog = b.mode === 'shop' ? products > 0 : b.mode === 'booking' ? services > 0 : products + services > 0;
  const hasHours = Array.isArray(b.hours) && b.hours.some((h) => !h.isClosed && h.openTime && h.closeTime);

  const items = [
    { key: 'profile', label: 'Add your logo and a short description', hint: 'Customers trust a page that looks like a real business.', done: Boolean(b.logoUrl || b.description || b.tagline), to: '/dashboard/settings' },
    { key: 'catalog', label: `Add your first ${sells}`, hint: 'Add a name, a price and (for services) how long it takes.', done: hasCatalog, to: '/dashboard/catalog' },
  ];
  if (b.mode !== 'shop') items.push({ key: 'hours', label: 'Set your opening hours', hint: 'Customers can only book the times you are open.', done: hasHours, to: '/dashboard/settings' });
  items.push(
    { key: 'bank', label: 'Add your bank account', hint: 'This is where customer deposits are paid to you.', done: payoutReady(b), to: '/dashboard/settings' },
    { key: 'share', label: 'Share your link', hint: 'Post it on your WhatsApp status and Instagram bio.', done: Boolean(b.onboarding?.sharedAt), to: '/dashboard', fragment: 'sh-title' },
    { key: 'first', label: 'Get your first booking or order', hint: 'Open your page and make a test one yourself to see how it feels.', done: Boolean(booking || order), to: `/${b.slug}` }
  );

  res.json({
    status: 'success',
    data: { items, done: items.filter((i) => i.done).length, total: items.length, dismissed: Boolean(b.onboarding?.dismissed) },
  });
});

// PATCH /me/checklist  { shared: true } when they copy or share the link; { dismissed: true|false } to hide or show the card
exports.updateChecklist = asyncHandler(async (req, res) => {
  const b = req.business;
  b.onboarding = b.onboarding || {};
  if (req.body.shared && !b.onboarding.sharedAt) b.onboarding.sharedAt = new Date();
  if (typeof req.body.dismissed === 'boolean') b.onboarding.dismissed = req.body.dismissed;
  await b.save();
  res.json({ status: 'success', data: {} });
});
