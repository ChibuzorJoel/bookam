const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { Order } = require('../models');
const { getPagination, pageMeta } = require('../utils/pagination');

const MAX_CODE_TRIES = 5;
const LOCK_MINUTES = 15;
const CLOSED = ['delivered', 'completed'];

// GET /me/orders   (the delivery code is never included: the customer gives it to the rider)
exports.listOrders = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { businessId: req.business._id };
  if (req.query.status) filter.status = req.query.status;
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);
  res.json({ status: 'success', data: { orders, meta: pageMeta(page, limit, total) } });
});

// PATCH /me/orders/:id  { status, code? }
// A delivery order only closes with the customer's 4-digit code. Pickup orders close with no code.
exports.updateOrder = asyncHandler(async (req, res) => {
  const { status, code } = req.body;
  const order = await Order.findOne({ _id: req.params.id, businessId: req.business._id }).select('+deliveryCode +codeAttempts +lastCodeAttemptAt');
  if (!order) throw new AppError('Order not found.', 404, 'NOT_FOUND');

  const isDelivery = order.fulfilment === 'delivery';
  if (CLOSED.includes(order.status)) throw new AppError('This order is already closed.', 409, 'ORDER_CLOSED');
  if (!isDelivery && ['out_for_delivery', 'delivered'].includes(status)) {
    throw new AppError('This is a pickup order. Mark it Completed instead.', 400, 'NOT_A_DELIVERY');
  }
  if (isDelivery && status === 'completed') {
    throw new AppError('This is a delivery order. Mark it Delivered with the customer\'s code.', 400, 'USE_DELIVERED');
  }

  if (isDelivery && status === 'delivered') {
    const locked =
      order.codeAttempts >= MAX_CODE_TRIES && order.lastCodeAttemptAt && Date.now() - order.lastCodeAttemptAt.getTime() < LOCK_MINUTES * 60000;
    if (locked) {
      throw new AppError(`Too many wrong codes. Try again in ${LOCK_MINUTES} minutes, or ask the customer to check their order page.`, 429, 'CODE_LOCKED');
    }
    if (!code || code !== order.deliveryCode) {
      const expired = order.lastCodeAttemptAt && Date.now() - order.lastCodeAttemptAt.getTime() >= LOCK_MINUTES * 60000;
      order.codeAttempts = (expired ? 0 : order.codeAttempts) + 1;
      order.lastCodeAttemptAt = new Date();
      await order.save();
      throw new AppError('That code is not right. Ask the customer for the 4-digit code on their order page.', 400, 'BAD_DELIVERY_CODE');
    }
    order.deliveredAt = new Date();
  }

  order.status = status;
  await order.save();
  const fresh = await Order.findById(order._id); // re-read without the secret fields
  res.json({ status: 'success', data: { order: fresh } });
});
