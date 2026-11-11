const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    plan: { type: String, enum: ['starter', 'pro'], required: true },
    amount: { type: Number, required: true }, // kobo
    period: { type: String, enum: ['monthly', 'annual'], default: 'monthly' },
    durationDays: { type: Number, default: 30 }, // how long this payment adds to the plan
    status: { type: String, enum: ['pending', 'active', 'expired', 'failed'], default: 'pending' },
    startedAt: Date,
    endsAt: Date,
    provider: { type: String, enum: ['paystack', 'payaza'], default: 'paystack' },
    paystackReference: { type: String, required: true, unique: true }, // OUR reference, for either provider
    rawPayload: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

subscriptionSchema.index({ businessId: 1, createdAt: -1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
