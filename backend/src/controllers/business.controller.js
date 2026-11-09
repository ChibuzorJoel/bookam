const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { uploadBuffer, cloudinary, configured } = require('../config/cloudinary');
const { isSlugFree } = require('../services/business.service');
const { assertFeature, effectivePlanKey } = require('../middleware/planGuard');
const { PLANS } = require('../config/plans');
const { Business } = require('../models');

const withPlan = (business) => {
  const key = effectivePlanKey(business);
  return { ...business.toObject(), effectivePlan: key, planLimits: { maxProducts: PLANS[key].maxProducts === Infinity ? null : PLANS[key].maxProducts, features: PLANS[key].features } };
};

// GET /me/business
exports.getMyBusiness = asyncHandler(async (req, res) => {
  res.json({ status: 'success', data: { business: withPlan(req.business) } });
});

// PATCH /me/business
exports.updateMyBusiness = asyncHandler(async (req, res) => {
  const business = req.business;
  const updates = req.body;

  if (updates.slug && updates.slug !== business.slug) {
    if (!(await isSlugFree(updates.slug, business._id))) throw new AppError('That page address is not available. Try another.', 409, 'SLUG_TAKEN');
  }
  if (updates.customDomain) assertFeature(business, 'customDomain', 'Custom domains are available on the Pro plan.');

  Object.entries(updates).forEach(([k, v]) => {
    business[k] = v === null ? undefined : v; // null/'' clears optional fields (e.g. customDomain)
  });
  await business.save();
  res.json({ status: 'success', data: { business: withPlan(business) } });
});

// POST /me/business/logo  (multipart, field "logo")
exports.uploadLogo = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('Please choose an image to upload.', 400, 'NO_FILE');
  const { url, publicId } = await uploadBuffer(req.file.buffer, `logos/${req.business._id}`);

  const oldPublicId = req.business.logoPublicId;
  req.business.logoUrl = url;
  req.business.logoPublicId = publicId;
  await req.business.save();

  if (oldPublicId && configured) cloudinary.uploader.destroy(oldPublicId).catch(() => {});
  res.json({ status: 'success', data: { logoUrl: url } });
});

// kept for admin reuse
exports.findBySlug = (slug) => Business.findOne({ slug });
