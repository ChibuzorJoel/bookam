const mongoose = require('mongoose');
const { payoutReady } = require('../utils/payout');
const { PLANS } = require('../config/plans');
const { effectivePlanKey } = require('../middleware/planGuard');

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const hourSchema = new mongoose.Schema(
  {
    weekday: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday
    openTime: { type: String, match: TIME_RE },
    closeTime: { type: String, match: TIME_RE },
    isClosed: { type: Boolean, default: false },
  },
  { _id: false }
);

const exceptionSchema = new mongoose.Schema({
  date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  startTime: { type: String, match: TIME_RE }, // omit both times = whole day blocked
  endTime: { type: String, match: TIME_RE },
  reason: { type: String, maxlength: 200 },
});

const THEMES = ['classic', 'sunset', 'ocean', 'forest', 'royal', 'noir'];

const businessSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    tagline: { type: String, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000 },
    logoUrl: String,
    logoPublicId: String,
    whatsappNumber: String, // 234XXXXXXXXXX
    instagram: { type: String, trim: true, maxlength: 60 },
    address: { type: String, trim: true, maxlength: 200 },
    area: { type: String, trim: true, maxlength: 80 }, // e.g. Lekki, Ikeja
    theme: { type: String, enum: THEMES, default: 'classic' },
    mode: { type: String, enum: ['shop', 'booking', 'both'], default: 'both' },

    plan: { type: String, enum: Object.keys(PLANS), default: 'free' },
    planExpiresAt: Date,
    renewalReminderFor: Date, // legacy, kept so old documents still load
    renewalSent: { type: [String], default: [] }, // '<planExpiresAt ms>:<stage>' notices already sent (d7, d3, d1, ended)
    customDomain: { type: String, lowercase: true, trim: true, unique: true, sparse: true },

    // Payout details (full account number is never stored; Paystack holds it on the subaccount)
    paystackSubaccountCode: String,
    payazaSplitCode: String, // Payaza split account (the business's bank account); code is used at checkout
    payazaSplitId: Number,   // numeric id, needed to update the split account
    bank: {
      bankCode: String,
      bankName: String,
      accountName: String,
      accountLast4: String,
    },

    status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'active' },
    suspendedReason: String,

    hours: { type: [hourSchema], default: undefined },       // embedded: always read together
    exceptions: { type: [exceptionSchema], default: [] },     // embedded
  },
  { timestamps: true }
);

businessSchema.index({ status: 1, createdAt: -1 });
businessSchema.index({ plan: 1, planExpiresAt: 1 });

/** Mon-Sat 09:00-18:00, Sunday closed. */
businessSchema.statics.defaultHours = () =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    openTime: '09:00',
    closeTime: '18:00',
    isClosed: weekday === 0,
  }));

businessSchema.statics.THEMES = THEMES;

/** Only fields that are safe to show to anonymous customers. */
businessSchema.methods.toPublicJSON = function () {
  const plan = PLANS[effectivePlanKey(this)] || PLANS.free;
  return {
    id: this._id,
    name: this.name,
    slug: this.slug,
    tagline: this.tagline,
    description: this.description,
    logoUrl: this.logoUrl,
    whatsappNumber: this.whatsappNumber,
    instagram: this.instagram,
    address: this.address,
    area: this.area,
    theme: this.theme,
    mode: this.mode,
    hours: this.hours,
    showBadge: !plan.features.removeBadge,
    acceptsDeposits: payoutReady(this),
  };
};

module.exports = mongoose.model('Business', businessSchema);
