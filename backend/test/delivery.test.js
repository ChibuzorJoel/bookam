const test = require('node:test');
const assert = require('node:assert');

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
process.env.PUBLIC_BASE_URL = 'https://example.test';

const v = require('../src/validators');
const messages = require('../src/templates/messages');
const { Order } = require('../src/models');
const orders = require('../src/controllers/order.controller');

const goodOrder = { customerName: 'Ada', customerPhone: '08031234567', items: [{ productId: 'a'.repeat(24), qty: 2 }] };

test('checkout: pickup needs nothing extra, delivery needs an area and an address', () => {
  assert.ok(v.publicOrderCreate.safeParse(goodOrder).success);
  assert.ok(!v.publicOrderCreate.safeParse({ ...goodOrder, fulfilment: 'delivery' }).success);
  assert.ok(!v.publicOrderCreate.safeParse({ ...goodOrder, fulfilment: 'delivery', zoneId: 'b'.repeat(24) }).success);
  const ok = v.publicOrderCreate.safeParse({ ...goodOrder, fulfilment: 'delivery', zoneId: 'b'.repeat(24), address: '12 Ojo Road, Ojo', landmark: 'Near the market' });
  assert.ok(ok.success);
});

test('delivery settings: needs a zone to be switched on, no duplicate or negative fees', () => {
  assert.ok(v.deliveryUpdate.safeParse({ enabled: true, allowPickup: true, zones: [{ name: 'Ojo', fee: 80000 }] }).success);
  assert.ok(v.deliveryUpdate.safeParse({ enabled: false, allowPickup: true, zones: [] }).success);
  assert.ok(!v.deliveryUpdate.safeParse({ enabled: true, allowPickup: true, zones: [] }).success);
  assert.ok(!v.deliveryUpdate.safeParse({ enabled: true, allowPickup: true, zones: [{ name: 'Ojo', fee: 1 }, { name: 'ojo', fee: 2 }] }).success);
  assert.ok(!v.deliveryUpdate.safeParse({ enabled: true, allowPickup: true, zones: [{ name: 'Ojo', fee: -5 }] }).success);
});

test('closing a delivery order needs a 4-digit code', () => {
  assert.ok(v.orderUpdate.safeParse({ status: 'delivered', code: '4821' }).success);
  assert.ok(!v.orderUpdate.safeParse({ status: 'delivered', code: '48' }).success);
  assert.ok(v.orderUpdate.safeParse({ status: 'preparing' }).success);
});

test('WhatsApp message carries items, fee, total, address, phone and the tracking link', () => {
  const order = {
    orderCode: 'OD-ABC234', customerName: 'Ada', customerPhone: '2348031234567', fulfilment: 'delivery',
    items: [{ qty: 2, name: 'Wig', price: 500000 }], subtotal: 1000000, deliveryFee: 80000, total: 1080000,
    delivery: { zone: 'Ojo', address: '12 Ojo Road', landmark: 'Near the market' },
  };
  const text = messages.orderWhatsApp({ order, business: { name: 'Zee Hair', slug: 'zee-hair' } });
  for (const bit of ['2 x Wig', 'Delivery (Ojo)', '12 Ojo Road', 'Near the market', '2348031234567', 'OD-ABC234', 'https://example.test/zee-hair/order/OD-ABC234']) {
    assert.ok(text.includes(bit), `missing: ${bit}`);
  }
});

// --- owner closing a delivery order, with the Order model faked ---
function fakeOrder(over = {}) {
  const o = {
    _id: 'o1', fulfilment: 'delivery', status: 'out_for_delivery', deliveryCode: '4821', codeAttempts: 0,
    save: async function () { return this; }, ...over,
  };
  Order.findOne = () => ({ select: async () => o });
  Order.findById = async () => ({ status: o.status });
  return o;
}
const call = async (body) => {
  let out; let err;
  await orders.updateOrder({ params: { id: 'o1' }, body, business: { _id: 'b1' } }, { json: (x) => (out = x) }, (e) => (err = e));
  return { out, err };
};

test('right code closes the order and stamps deliveredAt', async () => {
  const o = fakeOrder();
  const { out, err } = await call({ status: 'delivered', code: '4821' });
  assert.ifError(err);
  assert.equal(o.status, 'delivered');
  assert.ok(o.deliveredAt instanceof Date);
  assert.equal(out.status, 'success');
});

test('wrong or missing code does not close it and is counted', async () => {
  const o = fakeOrder();
  assert.equal((await call({ status: 'delivered', code: '0000' })).err.code, 'BAD_DELIVERY_CODE');
  assert.equal((await call({ status: 'delivered' })).err.code, 'BAD_DELIVERY_CODE');
  assert.equal(o.status, 'out_for_delivery');
  assert.equal(o.codeAttempts, 2);
});

test('five wrong codes lock the order for a while, even for the right code', async () => {
  fakeOrder({ codeAttempts: 5, lastCodeAttemptAt: new Date() });
  assert.equal((await call({ status: 'delivered', code: '4821' })).err.code, 'CODE_LOCKED');
});

test('delivery orders cannot be marked Completed, pickup orders cannot go out for delivery', async () => {
  fakeOrder();
  assert.equal((await call({ status: 'completed' })).err.code, 'USE_DELIVERED');
  fakeOrder({ fulfilment: 'pickup', status: 'preparing' });
  assert.equal((await call({ status: 'out_for_delivery' })).err.code, 'NOT_A_DELIVERY');
  const ok = fakeOrder({ fulfilment: 'pickup', status: 'preparing' });
  await call({ status: 'completed' });
  assert.equal(ok.status, 'completed');
});

test('a closed order cannot be changed again', async () => {
  fakeOrder({ status: 'delivered' });
  assert.equal((await call({ status: 'new' })).err.code, 'ORDER_CLOSED');
});
