const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    paystackReference: { type: String, required: true, unique: true }, // idempotency key for webhooks
    amount: { type: Number, required: true }, // kobo
    fee: { type: Number, default: 0 },        // kobo (Paystack fee)
    currency: { type: String, default: 'NGN' },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'abandoned', 'amount_mismatch'],
      default: 'pending',
    },
    paidAt: Date,
    rawPayload: { type: mongoose.Schema.Types.Mixed, select: false },
  },
  { timestamps: true }
);

paymentSchema.index({ businessId: 1, createdAt: -1 });
paymentSchema.index({ bookingId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
