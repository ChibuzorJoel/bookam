const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, trim: true }, // normalised: 234XXXXXXXXXX
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false }, // only a verified email can be used to log in
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ['owner', 'admin'], default: 'owner' },
    phoneVerified: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    tokenVersion: { type: Number, default: 0 }, // bump to invalidate every existing session
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    phone: this.phone,
    email: this.email,
    emailVerified: Boolean(this.emailVerified),
    role: this.role,
    phoneVerified: this.phoneVerified,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
