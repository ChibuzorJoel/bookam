const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    plan: { type: String, enum: ['starter', 'pro'], required: true },
    amount: { type: Number, required: true }, // kobo
    status: { type: String, enum: ['pending', 'active', 'expired', 'failed'], default: 'pending' },
    startedAt: Date,
    endsAt: Date,
    paystackReference: { type: String, required: true, unique: true },
    rawPayload: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

subscriptionSchema.index({ businessId: 1, createdAt: -1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
