const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { Order } = require('../models');
const { getPagination, pageMeta } = require('../utils/pagination');

// GET /me/orders
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

// PATCH /me/orders/:id
exports.updateOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOneAndUpdate(
    { _id: req.params.id, businessId: req.business._id },
    { $set: { status: req.body.status } },
    { new: true }
  );
  if (!order) throw new AppError('Order not found.', 404, 'NOT_FOUND');
  res.json({ status: 'success', data: { order } });
});
