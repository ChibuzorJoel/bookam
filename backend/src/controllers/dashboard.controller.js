const QRCode = require('qrcode');
const asyncHandler = require('../utils/asyncHandler');
const { Booking, Order, Payment } = require('../models');
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
