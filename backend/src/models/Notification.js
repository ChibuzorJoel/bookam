const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business' },
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    type: { type: String, required: true }, // booking_confirmed, reminder_24h, new_order, ...
    channel: { type: String, enum: ['sms', 'email', 'whatsapp', 'whatsapp_link'], required: true },
    recipient: { type: String, required: true },
    status: { type: String, enum: ['queued', 'sent', 'failed', 'link_generated'], default: 'queued' },
    error: String,
    sentAt: Date,
  },
  { timestamps: true }
);

notificationSchema.index({ businessId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
