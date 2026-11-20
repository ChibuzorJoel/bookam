process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { Review, Booking, Business } = require('../src/models');
const v = require('../src/validators');
const reviewService = require('../src/services/review.service');
const pub = require('../src/controllers/public.controller');
const owner = require('../src/controllers/review.controller');

const call = async (handler, req) => {
  let out;
  let status = 200;
  const res = { status(c) { status = c; return this; }, set() {}, json(b) { out = b; } };
  let error;
  await handler({ query: {}, body: {}, params: {}, ...req }, res, (e) => (error = e));
  return { out, status, error };
};

test('validators: stars must be 1 to 5, comment is capped, owner reply needs something to change', () => {
  assert.ok(v.reviewCreate.safeParse({ rating: 5, comment: 'Lovely' }).success);
  assert.ok(v.reviewCreate.safeParse({ rating: '4' }).success);
  assert.ok(!v.reviewCreate.safeParse({ rating: 0 }).success);
  assert.ok(!v.reviewCreate.safeParse({ rating: 6 }).success);
  assert.ok(!v.reviewCreate.safeParse({ rating: 3.5 }).success);
  assert.ok(!v.reviewCreate.safeParse({ rating: 5, comment: 'x'.repeat(501) }).success);
  assert.ok(!v.reviewUpdate.safeParse({}).success);
  assert.ok(v.reviewUpdate.safeParse({ reply: '' }).success);
});

test('public shape shows the first name only and hides ids', () => {
  const s = reviewService.publicShape({ _id: 'x', businessId: 'b', bookingId: 'k', customerName: 'Amaka Okafor', rating: 5, comment: 'Great', createdAt: new Date() });
  assert.strictEqual(s.name, 'Amaka');
  assert.ok(!('_id' in s) && !('bookingId' in s) && !('businessId' in s));
});

test('only a completed booking can be rated, and only once', async () => {
  const booking = { _id: 'k1', businessId: 'b1', bookingCode: 'ABC123', status: 'confirmed', customerName: 'Ada Obi', serviceName: 'Braids' };
  Booking.findOne = async () => booking;
  let created = [];
  Review.create = async (d) => {
    if (created.some((c) => c.bookingId === d.bookingId)) throw Object.assign(new Error('dup'), { code: 11000 });
    created.push(d);
  };
  const body = { rating: 5, comment: 'Great' };

  const early = await call(pub.createReview, { params: { code: 'ABC123' }, body });
  assert.strictEqual(early.error.statusCode ?? early.error.status, 409);

  booking.status = 'completed';
  const ok = await call(pub.createReview, { params: { code: 'ABC123' }, body });
  assert.strictEqual(ok.status, 201);
  assert.strictEqual(created[0].customerName, 'Ada Obi');

  const again = await call(pub.createReview, { params: { code: 'ABC123' }, body });
  assert.strictEqual(again.error.code ?? again.error.errorCode, 'ALREADY_REVIEWED');

  Booking.findOne = async () => null;
  const missing = await call(pub.createReview, { params: { code: 'NOPE' }, body });
  assert.ok(missing.error);
});

test('owner can reply and hide only their own review, and an empty reply removes it', async () => {
  const doc = { _id: 'r1', businessId: 'b1', reply: 'old', save: async function () { return this; } };
  let filter;
  Review.findOne = async (f) => ((filter = f), doc);
  const r = await call(owner.update, { business: { _id: 'b1' }, params: { id: 'r1' }, body: { reply: 'Thank you!', hidden: true } });
  assert.deepStrictEqual(filter, { _id: 'r1', businessId: 'b1' }); // scoped to the signed-in business
  assert.strictEqual(doc.reply, 'Thank you!');
  assert.strictEqual(doc.hidden, true);
  assert.ok(doc.repliedAt instanceof Date);
  await call(owner.update, { business: { _id: 'b1' }, params: { id: 'r1' }, body: { reply: '' } });
  assert.strictEqual(doc.reply, undefined);
  Review.findOne = async () => null;
  assert.ok((await call(owner.update, { business: { _id: 'b1' }, params: { id: 'zz' }, body: { hidden: false } })).error);
});

test('review routes are protected or validated', async () => {
  const app = require('../src/app');
  const s = http.createServer(app).listen(0);
  const base = `http://localhost:${s.address().port}`;
  try {
    assert.strictEqual((await fetch(base + '/me/reviews')).status, 401);
    assert.strictEqual((await fetch(base + '/me/reviews/' + 'a'.repeat(24), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
    const bad = await fetch(base + '/public/bookings/ABC123/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating: 9 }) });
    assert.strictEqual(bad.status, 400);
  } finally {
    s.close();
  }
});
