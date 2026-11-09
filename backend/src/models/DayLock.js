const mongoose = require('mongoose');

/**
 * One tiny document per business per day. Every booking transaction increments it first, so two concurrent
 * transactions for the same day conflict on this document and one is retried. This closes the "write skew"
 * gap where two overlapping slots with different start times could otherwise both pass the availability
 * check (the unique index only protects identical start times).
 */
const dayLockSchema = new mongoose.Schema({
  businessId: { type: mongoose.Schema.Types.ObjectId, required: true },
  date: { type: String, required: true },
  v: { type: Number, default: 0 },
});
dayLockSchema.index({ businessId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DayLock', dayLockSchema);
