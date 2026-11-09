const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { uploadBuffer } = require('../config/cloudinary');
const { Product, Service, Booking } = require('../models');
const { planOf } = require('../middleware/planGuard');
const env = require('../config/env');

// ======================= PRODUCTS =======================

async function uploadImages(files = [], businessId) {
  return Promise.all(files.map((f) => uploadBuffer(f.buffer, `products/${businessId}`).then((r) => r.url)));
}

// GET /me/products
exports.listProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ businessId: req.business._id }).sort({ sortOrder: 1, createdAt: -1 });
  const plan = planOf(req.business);
  res.json({
    status: 'success',
    data: { products, limit: plan.maxProducts === Infinity ? null : plan.maxProducts },
  });
});

// POST /me/products  (multipart: fields + up to 6 "images")
exports.createProduct = asyncHandler(async (req, res) => {
  const plan = planOf(req.business);
  if (env.ENFORCE_PLAN_LIMITS && plan.maxProducts !== Infinity) {
    const count = await Product.countDocuments({ businessId: req.business._id });
    if (count >= plan.maxProducts) {
      throw new AppError(`The Free plan allows up to ${plan.maxProducts} items. Upgrade to add more.`, 403, 'PLAN_LIMIT_REACHED');
    }
  }
  const { imageUrls = [], ...fields } = req.body;
  const newUrls = await uploadImages(req.files, req.business._id);
  const product = await Product.create({ ...fields, businessId: req.business._id, imageUrls: [...imageUrls, ...newUrls].slice(0, 6) });
  res.status(201).json({ status: 'success', data: { product } });
});

// PATCH /me/products/:id
exports.updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, businessId: req.business._id });
  if (!product) throw new AppError('Product not found.', 404, 'NOT_FOUND');

  const { imageUrls, ...fields } = req.body;
  Object.assign(product, fields);
  const newUrls = await uploadImages(req.files, req.business._id);
  // `imageUrls` (if sent) is the list of existing images to KEEP; new uploads are appended.
  const kept = imageUrls !== undefined ? imageUrls : product.imageUrls;
  product.imageUrls = [...kept, ...newUrls].slice(0, 6);
  await product.save();
  res.json({ status: 'success', data: { product } });
});

// DELETE /me/products/:id
exports.deleteProduct = asyncHandler(async (req, res) => {
  const result = await Product.deleteOne({ _id: req.params.id, businessId: req.business._id });
  if (!result.deletedCount) throw new AppError('Product not found.', 404, 'NOT_FOUND');
  res.json({ status: 'success', message: 'Product deleted.' });
});

// ======================= SERVICES =======================

// GET /me/services
exports.listServices = asyncHandler(async (req, res) => {
  const services = await Service.find({ businessId: req.business._id }).sort({ createdAt: -1 });
  res.json({ status: 'success', data: { services } });
});

// POST /me/services
exports.createService = asyncHandler(async (req, res) => {
  const service = await Service.create({ ...req.body, businessId: req.business._id });
  res.status(201).json({ status: 'success', data: { service } });
});

// PATCH /me/services/:id
exports.updateService = asyncHandler(async (req, res) => {
  const service = await Service.findOne({ _id: req.params.id, businessId: req.business._id });
  if (!service) throw new AppError('Service not found.', 404, 'NOT_FOUND');
  Object.assign(service, req.body);
  await service.save(); // re-runs the "deposit <= price" validator
  res.json({ status: 'success', data: { service } });
});

// DELETE /me/services/:id  (a service with booking history is archived instead of deleted)
exports.deleteService = asyncHandler(async (req, res) => {
  const service = await Service.findOne({ _id: req.params.id, businessId: req.business._id });
  if (!service) throw new AppError('Service not found.', 404, 'NOT_FOUND');

  const hasBookings = await Booking.exists({ businessId: req.business._id, serviceId: service._id });
  if (hasBookings) {
    service.active = false;
    await service.save();
    return res.json({ status: 'success', message: 'This service has booking history, so it was hidden instead of deleted.', data: { archived: true, service } });
  }
  await service.deleteOne();
  res.json({ status: 'success', message: 'Service deleted.', data: { archived: false } });
});
