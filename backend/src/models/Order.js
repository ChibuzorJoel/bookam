const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    price: { type: Number, required: true }, // kobo, snapshot at order time
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    orderCode: { type: String, required: true, unique: true },
    customerName: { type: String, required: true, trim: true, maxlength: 80 },
    customerPhone: { type: String, required: true },
    note: { type: String, trim: true, maxlength: 500 },
    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    total: { type: Number, required: true }, // kobo, computed on the server
    status: { type: String, enum: ['new', 'contacted', 'completed', 'cancelled'], default: 'new' },
  },
  { timestamps: true }
);

orderSchema.index({ businessId: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
