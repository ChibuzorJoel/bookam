const mongoose = require('mongoose');

/** A message from a visitor who wants a person (sent from the assistant chat). Admin tracks it to done. */
const supportMessageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    contact: { type: String, required: true, trim: true, maxlength: 120 }, // phone or email, as typed
    message: { type: String, required: true, trim: true, maxlength: 1500 },
    page: { type: String, trim: true, maxlength: 120 }, // where the visitor was
    status: { type: String, enum: ['open', 'replied', 'closed'], default: 'open' },
    note: { type: String, trim: true, maxlength: 1000 }, // admin's private note
    repliedAt: Date,
  },
  { timestamps: true }
);

supportMessageSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('SupportMessage', supportMessageSchema);
