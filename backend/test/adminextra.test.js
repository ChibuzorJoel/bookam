process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const v = require('../src/validators');
const { Business, Subscription, Payment } = require('../src/models');
const extra = require('../src/controllers/adminExtra.controller');

test('validators: payment filters, support message', () => {
  assert.strictEqual(v.adminPaymentList.parse({}).kind, 'subscription');
  assert.ok(!v.adminPaymentList.safeParse({ kind: 'cash' }).success);
  assert.ok(!v.adminPaymentList.safeParse({ from: '14/11/2026' }).success);
  assert.ok(v.supportCreate.safeParse({ name: 'Ada', contact: '08031234567', message: 'My code did not come' }).success);
  assert.ok(!v.supportCreate.safeParse({ name: 'A', contact: '1', message: 'x' }).success);
  assert.ok(!v.supportUpdate.safeParse({}).success);
});

test('admin routes need a login; the public support form validates input', async () => {
  const app = require('../src/app');
  const s = http.createServer(app).listen(0);
  const base = `http://localhost:${s.address().port}`;
  try {
    for (const p of ['/admin/payments', '/admin/payments/export', '/admin/support', '/admin/businesses/' + 'a'.repeat(24)]) {
      assert.strictEqual((await fetch(base + p)).status, 401, p);
    }
    const bad = await fetch(base + '/public/support', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.strictEqual(bad.status, 400);
  } finally {
    s.close();
  }
});

test('CSV export: formulas are neutralised, amounts are in naira, rows are escaped', async () => {
  const rows = [
    { _id: '1', paystackReference: 'SUB1', provider: 'payaza', amount: 400000, status: 'active', plan: 'starter', period: 'monthly', createdAt: new Date('2026-11-01'), businessId: { _id: 'b', name: '=cmd|"x", Salon', slug: 's' } },
  ];
  const q = () => ({ sort: () => q(), limit: () => q(), populate: () => q(), lean: async () => rows });
  Subscription.find = q;
  Business.find = q;
  let body = '';
  const res = { setHeader() {}, send(b) { body = b; } };
  await extra.exportPayments({ query: { kind: 'subscription' } }, res, (e) => { throw e; });
  assert.match(body, /Amount \(NGN\)/);
  assert.match(body, /4000\.00/);
  assert.match(body, /"'=cmd\|""x"", Salon"/);
});
