const mongoose = require('mongoose');

/** One browser/phone that agreed to get notifications for an owner's business. */
const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    endpoint: { type: String, required: true, maxlength: 1000 },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true }
);

pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
pushSubscriptionSchema.index({ businessId: 1 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
