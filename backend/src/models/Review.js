const mongoose = require('mongoose');

/** A customer's rating of one completed booking. One review per booking. Owners can reply or hide it. */
const reviewSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    serviceName: { type: String, trim: true, maxlength: 120 },
    customerName: { type: String, required: true, trim: true, maxlength: 80 }, // only the first name is ever shown publicly
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500 },
    reply: { type: String, trim: true, maxlength: 300 },
    repliedAt: Date,
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reviewSchema.index({ businessId: 1, hidden: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
