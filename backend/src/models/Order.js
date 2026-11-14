const mongoose = require('mongoose');

// delivered = closed delivery order, completed = closed pickup order
const ORDER_STATUSES = ['new', 'contacted', 'preparing', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];

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
    subtotal: { type: Number }, // kobo, items only (older orders have none; total was the items total then)
    deliveryFee: { type: Number, default: 0 }, // kobo
    total: { type: Number, required: true }, // kobo, items + delivery fee, computed on the server
    fulfilment: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
    delivery: {
      zone: { type: String, maxlength: 40 },
      address: { type: String, maxlength: 200 },
      landmark: { type: String, maxlength: 120 },
    },
    // 4-digit code the customer gives the rider. The owner types it to close a delivery order.
    deliveryCode: { type: String, select: false },
    codeAttempts: { type: Number, default: 0, select: false },
    lastCodeAttemptAt: { type: Date, select: false },
    deliveredAt: Date,
    status: { type: String, enum: ORDER_STATUSES, default: 'new' },
  },
  { timestamps: true }
);

orderSchema.index({ businessId: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
