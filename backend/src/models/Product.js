const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000 },
    category: { type: String, trim: true, maxlength: 60 },
    price: { type: Number, required: true, min: 0, validate: Number.isInteger }, // kobo
    imageUrls: { type: [String], default: [], validate: (v) => v.length <= 6 },
    inStock: { type: Boolean, default: true },
    active: { type: Boolean, default: true }, // false = hidden from the public page
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.index({ businessId: 1, active: 1, sortOrder: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
