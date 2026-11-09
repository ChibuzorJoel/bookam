const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { Business, Product, Service, Booking, Order } = require('../models');
const { maskPhone } = require('../utils/phone');
const { generateOrderCode } = require('../utils/ids');
const { waLink } = require('../services/whatsapp.service');
const messages = require('../templates/messages');
const notifications = require('../services/notification.service');
const { createBooking, getSlotsForDate, assertBookableDate } = require('../services/booking.service');
const { startBookingPayment } = require('../services/payment.service');
const { assertFeature } = require('../middleware/planGuard');

async function findActiveBusiness(slug) {
  const business = await Business.findOne({ slug, status: 'active' });
  if (!business) throw new AppError('This page does not exist or is not available.', 404, 'BUSINESS_NOT_FOUND');
  return business;
}

async function pagePayload(business) {
  const wantsShop = business.mode !== 'booking';
  const wantsBooking = business.mode !== 'shop';
  const [products, services] = await Promise.all([
    wantsShop ? Product.find({ businessId: business._id, active: true }).sort({ sortOrder: 1, createdAt: -1 }).select('-businessId -__v') : [],
    wantsBooking ? Service.find({ businessId: business._id, active: true }).sort({ createdAt: 1 }).select('-businessId -__v') : [],
  ]);
  return { business: business.toPublicJSON(), products, services };
}

// GET /public/:slug   (business + products + services in one call, so the page loads fast on weak data)
exports.getPage = asyncHandler(async (req, res) => {
  const business = await findActiveBusiness(req.params.slug);
  res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
  res.json({ status: 'success', data: await pagePayload(business) });
});

// GET /public/by-domain?host=www.lagoshairstudio.com   (custom domains, Pro plan)
exports.getByDomain = asyncHandler(async (req, res) => {
  const business = await Business.findOne({ customDomain: req.query.host, status: 'active' });
  if (!business) throw new AppError('No page is connected to this domain.', 404, 'BUSINESS_NOT_FOUND');
  res.json({ status: 'success', data: await pagePayload(business) });
});

// GET /public/:slug/availability?service_id=&date=
exports.getAvailability = asyncHandler(async (req, res) => {
  const { service_id: serviceId, date } = req.query;
  const business = await findActiveBusiness(req.params.slug);
  const service = await Service.findOne({ _id: serviceId, businessId: business._id, active: true });
  if (!service) throw new AppError('Service not found.', 404, 'SERVICE_NOT_FOUND');
  assertBookableDate(date);

  const slots = await getSlotsForDate(business, service, date);
  res.json({
    status: 'success',
    data: { date, serviceId, durationMinutes: service.durationMinutes, slots: slots.map((s) => s.time) },
  });
});

// POST /public/:slug/bookings  -> creates a pending booking (hold) + Paystack payment for the deposit
exports.createBooking = asyncHandler(async (req, res) => {
  const business = await findActiveBusiness(req.params.slug);
  if (business.mode === 'shop') throw new AppError('This business does not take bookings.', 400, 'BOOKING_DISABLED');
  assertFeature(business, 'booking', 'This business is not accepting online bookings yet. Please message them on WhatsApp.');

  const { serviceId, date, time, ...customer } = req.body;
  const service = await Service.findOne({ _id: serviceId, businessId: business._id, active: true });
  if (!service) throw new AppError('Service not found.', 404, 'SERVICE_NOT_FOUND');

  if (service.depositAmount > 0) assertFeature(business, 'deposits', 'This business is not accepting online deposits yet.');
  // Fail BEFORE taking the slot when the business cannot receive a deposit
  if (service.depositAmount > 0 && !business.paystackSubaccountCode) {
    throw new AppError('This business has not finished setting up payments yet. Please contact them on WhatsApp.', 409, 'PAYOUT_NOT_SET');
  }

  const booking = await createBooking({ business, service, date, time, customer });

  // No deposit: confirmed immediately
  if (booking.status === 'confirmed') {
    notifications.background(notifications.bookingConfirmed(booking, business));
    return res.status(201).json({ status: 'success', data: { booking: shapeBooking(booking, business), payment: null } });
  }

  // Deposit required: create the Paystack transaction. If it fails, release the hold straight away.
  try {
    const payment = await startBookingPayment({ booking, business });
    res.status(201).json({
      status: 'success',
      data: { booking: shapeBooking(booking, business), payment: { ...payment, amount: booking.depositAmount, holdExpiresAt: booking.holdExpiresAt } },
    });
  } catch (err) {
    await Booking.updateOne(
      { _id: booking._id },
      { $set: { status: 'cancelled', slotActive: false, paymentStatus: 'failed', cancelReason: 'payment_init_failed' } }
    );
    throw err;
  }
});

function shapeBooking(b, business) {
  const confirmed = b.status === 'confirmed';
  return {
    bookingCode: b.bookingCode,
    status: b.status,
    paymentStatus: b.paymentStatus,
    serviceName: b.serviceName,
    startAt: b.startAt,
    endAt: b.endAt,
    price: b.price,
    depositAmount: b.depositAmount,
    holdExpiresAt: b.holdExpiresAt,
    customerName: b.customerName,
    customerPhone: maskPhone(b.customerPhone),
    business: { name: business.name, slug: business.slug, whatsappNumber: business.whatsappNumber, address: business.address, area: business.area },
    // Phase 1 WhatsApp: customer taps to message the business with their booking details
    whatsappLink: confirmed && business.whatsappNumber ? waLink(business.whatsappNumber, messages.bookingWhatsAppFromCustomer({ booking: b, business })) : null,
  };
}

// GET /public/bookings/:code  (confirmation page + status polling after payment)
exports.getBookingByCode = asyncHandler(async (req, res) => {
  const booking = await Booking.findOne({ bookingCode: req.params.code });
  if (!booking) throw new AppError('Booking not found. Check the code and try again.', 404, 'NOT_FOUND');
  const business = await Business.findById(booking.businessId);
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'success', data: { booking: shapeBooking(booking, business) } });
});

// POST /public/:slug/orders  (records an order that the customer then sends on WhatsApp)
exports.createOrder = asyncHandler(async (req, res) => {
  const business = await findActiveBusiness(req.params.slug);
  if (business.mode === 'booking') throw new AppError('This business does not take product orders.', 400, 'ORDERS_DISABLED');

  // Never trust prices from the browser: re-read them from the database.
  const ids = [...new Set(req.body.items.map((i) => i.productId))];
  const products = await Product.find({ _id: { $in: ids }, businessId: business._id, active: true });
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const items = req.body.items.map((i) => {
    const p = byId.get(i.productId);
    if (!p) throw new AppError('One of the items is no longer available.', 400, 'ITEM_UNAVAILABLE');
    if (!p.inStock) throw new AppError(`${p.name} is out of stock.`, 400, 'OUT_OF_STOCK');
    return { productId: p._id, name: p.name, price: p.price, qty: i.qty };
  });
  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

  const order = await Order.create({
    businessId: business._id,
    orderCode: generateOrderCode(),
    customerName: req.body.customerName,
    customerPhone: req.body.customerPhone,
    note: req.body.note,
    items,
    total,
  });

  notifications.background(notifications.newOrder(order, business));

  res.status(201).json({
    status: 'success',
    data: {
      order: { orderCode: order.orderCode, items: order.items, total: order.total, status: order.status },
      // Pre-filled WhatsApp message with items, quantities, total and customer name
      whatsappLink: waLink(business.whatsappNumber, messages.orderWhatsApp({ order, business })),
    },
  });
});
