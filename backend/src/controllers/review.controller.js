const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { Review } = require('../models');
const reviewService = require('../services/review.service');
const { getPagination, pageMeta } = require('../utils/pagination');

// GET /me/reviews  (everything, including hidden ones, so the owner can un-hide)
exports.list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const filter = { businessId: req.business._id };
  const [items, total, summary] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Review.countDocuments(filter),
    reviewService.summaryFor(req.business._id),
  ]);
  res.json({ status: 'success', data: { reviews: items, summary, meta: pageMeta(page, limit, total) } });
});

// PATCH /me/reviews/:id  { reply?, hidden? }.  An empty reply removes the reply.
exports.update = asyncHandler(async (req, res) => {
  const review = await Review.findOne({ _id: req.params.id, businessId: req.business._id });
  if (!review) throw new AppError('Review not found.', 404, 'NOT_FOUND');
  if (req.body.reply !== undefined) {
    review.reply = req.body.reply || undefined;
    review.repliedAt = req.body.reply ? new Date() : undefined;
  }
  if (typeof req.body.hidden === 'boolean') review.hidden = req.body.hidden;
  await review.save();
  res.json({ status: 'success', data: { review } });
});
