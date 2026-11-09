const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true }, // the thing the code was sent to; for email codes: 'email:<userId>:<address>'
  purpose: { type: String, enum: ['signup', 'login', 'reset', 'email'], required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

otpSchema.index({ phone: 1, purpose: 1 }, { unique: true });
// OTPs are disposable, so a TTL index (which deletes the document) is the right tool here.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
