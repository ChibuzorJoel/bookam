const mongoose = require('mongoose');
const { Review } = require('../models');

/** What the public sees: first name only, no internal ids. */
const publicShape = (r) => ({
  rating: r.rating,
  comment: r.comment || '',
  name: String(r.customerName || '').trim().split(/\s+/)[0] || 'Customer',
  serviceName: r.serviceName,
  reply: r.reply || '',
  createdAt: r.createdAt,
});

/** Average and count of the reviews customers can see (hidden ones do not count). */
async function summaryFor(businessId) {
  const id = new mongoose.Types.ObjectId(String(businessId));
  const rows = await Review.aggregate([
    { $match: { businessId: id, hidden: false } },
    { $group: { _id: null, count: { $sum: 1 }, sum: { $sum: '$rating' } } },
  ]);
  const count = rows[0]?.count || 0;
  return { count, average: count ? Math.round((rows[0].sum / count) * 10) / 10 : 0 };
}

async function latestFor(businessId, limit = 5, skip = 0) {
  const items = await Review.find({ businessId, hidden: false }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  return items.map(publicShape);
}

module.exports = { publicShape, summaryFor, latestFor };
