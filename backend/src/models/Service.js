const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000 },
    durationMinutes: { type: Number, required: true, min: 5, max: 720, validate: Number.isInteger },
    price: { type: Number, required: true, min: 0, validate: Number.isInteger }, // kobo
    depositAmount: {
      type: Number,
      default: 0,
      min: 0,
      validate: [
        { validator: Number.isInteger, message: 'depositAmount must be a whole number of kobo' },
        {
          validator(v) {
            return v <= this.price;
          },
          message: 'Deposit cannot be more than the service price',
        },
      ],
    },
    bufferMinutes: { type: Number, default: 0, min: 0, max: 240, validate: Number.isInteger },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

serviceSchema.index({ businessId: 1, active: 1 });

module.exports = mongoose.model('Service', serviceSchema);
