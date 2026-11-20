process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const { Booking, Order, Product, Service } = require('../src/models');
const dash = require('../src/controllers/dashboard.controller');
const v = require('../src/validators');

const run = async (business, counts = {}, handler = dash.checklist) => {
  Product.countDocuments = async () => counts.products || 0;
  Service.countDocuments = async () => counts.services || 0;
  Booking.exists = async () => counts.booking || null;
  Order.exists = async () => counts.order || null;
  let out;
  await handler({ business, body: counts.body || {} }, { json: (b) => (out = b.data) }, (e) => { throw e; });
  return out;
};
const base = { _id: 'b1', slug: 'zainab', mode: 'both', save: async () => {} };

test('a brand new page has nothing done and links every step', async () => {
  const r = await run({ ...base });
  assert.strictEqual(r.done, 0);
  assert.strictEqual(r.total, 6);
  assert.ok(r.items.every((i) => i.to));
  assert.strictEqual(r.items.find((i) => i.key === 'first').to, '/zainab');
});

test('steps tick off from real data', async () => {
  const hours = [{ weekday: 1, openTime: '09:00', closeTime: '17:00', isClosed: false }];
  const r = await run({ ...base, description: 'Hair', hours, payazaSplitCode: 'x', paystackSubaccountCode: 'y', onboarding: { sharedAt: new Date() } }, { services: 2, booking: { _id: 1 } });
  assert.strictEqual(r.done, 6);
  assert.ok(r.items.every((i) => i.done));
});

test('a shop-only page has no opening hours step and needs a product, not a service', async () => {
  const shop = { ...base, mode: 'shop' };
  assert.ok(!(await run(shop)).items.some((i) => i.key === 'hours'));
  assert.ok(!(await run(shop, { services: 3 })).items.find((i) => i.key === 'catalog').done);
  assert.ok((await run(shop, { products: 1 })).items.find((i) => i.key === 'catalog').done);
});

test('sharing is remembered once; dismiss can be toggled; the body is validated', async () => {
  const biz = { ...base, save: async () => {} };
  await run(biz, { body: { shared: true } }, dash.updateChecklist);
  const first = biz.onboarding.sharedAt;
  assert.ok(first instanceof Date);
  await run(biz, { body: { shared: true } }, dash.updateChecklist);
  assert.strictEqual(biz.onboarding.sharedAt, first);
  await run(biz, { body: { dismissed: true } }, dash.updateChecklist);
  assert.strictEqual(biz.onboarding.dismissed, true);
  assert.ok(!v.checklistUpdate.safeParse({}).success);
  assert.ok(!v.checklistUpdate.safeParse({ shared: false }).success);
});
