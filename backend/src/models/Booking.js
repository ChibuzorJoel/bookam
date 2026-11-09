const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
    serviceName: String, // snapshot so history survives edits/deletes
    customerName: { type: String, required: true, trim: true, maxlength: 80 },
    customerPhone: { type: String, required: true }, // 234XXXXXXXXXX
    customerEmail: { type: String, lowercase: true, trim: true },
    notes: { type: String, trim: true, maxlength: 500 },

    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    bufferMinutes: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed', 'no_show'],
      default: 'pending',
    },
    // Mirrors status in ('pending','confirmed'). Kept as a plain boolean so the unique partial index below
    // works on every MongoDB version. Maintained in the pre-validate hook (and set explicitly in bulk updates).
    slotActive: { type: Boolean, default: true },

    price: { type: Number, default: 0 },          // kobo
    depositAmount: { type: Number, default: 0 },  // kobo
    paymentStatus: {
      type: String,
      enum: ['not_required', 'pending', 'paid', 'failed', 'refund_required', 'refunded'],
      default: 'not_required',
    },
    bookingCode: { type: String, required: true, unique: true },
    holdExpiresAt: Date, // unpaid holds are cancelled by a job (NOT a TTL index, which would delete the record)
    cancelReason: String,
    remindersSent: {
      h24: { type: Boolean, default: false },
      h2: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

bookingSchema.pre('validate', function () {
  this.slotActive = ['pending', 'confirmed'].includes(this.status);
});

// Double-booking guard: two live bookings can never share the same start time for one business.
// (Add staffId to this key if you later support several staff per business.)
bookingSchema.index(
  { businessId: 1, startAt: 1 },
  { unique: true, partialFilterExpression: { slotActive: true }, name: 'uniq_active_slot' }
);
bookingSchema.index({ businessId: 1, status: 1, startAt: -1 });
bookingSchema.index({ status: 1, holdExpiresAt: 1 });  // expiry job
bookingSchema.index({ status: 1, startAt: 1 });         // reminder job

module.exports = mongoose.model('Booking', bookingSchema);
