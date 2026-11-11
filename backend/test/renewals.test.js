const test = require('node:test');
const assert = require('node:assert');

process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
process.env.PUBLIC_BASE_URL = 'https://example.test';

const DAY = 86400000;
const plans = require('../src/config/plans');

test('annual plans cost 10 months and last 365 days', () => {
  assert.strictEqual(plans.priceFor('starter', 'monthly'), 400000);
  assert.strictEqual(plans.priceFor('starter', 'annual'), 4000000);
  assert.strictEqual(plans.priceFor('pro', 'annual'), 10000000);
  assert.strictEqual(plans.PERIODS.annual.days, 365);
  assert.strictEqual(plans.PERIODS.monthly.days, 30);
});

test('renewal job sends each notice once, then downgrades after the final one', async () => {
  const now = Date.now();
  const rows = [
    { _id: 'a', plan: 'starter', planExpiresAt: new Date(now + 2.5 * DAY), renewalSent: [] }, // -> d3
    { _id: 'b', plan: 'pro', planExpiresAt: new Date(now + 0.5 * DAY), renewalSent: [] }, // -> d1
    { _id: 'c', plan: 'pro', planExpiresAt: new Date(now - 1000), renewalSent: [] }, // ended -> free
    { _id: 'd', plan: 'starter', planExpiresAt: new Date(now + 20 * DAY), renewalSent: [] }, // nothing
    { _id: 'e', plan: 'free', renewalSent: [] },
  ];
  const get = (id) => rows.find((r) => r._id === id);
  const match = (r, q) => {
    if (q._id && r._id !== q._id) return false;
    if (q.plan && q.plan.$ne && r.plan === q.plan.$ne) return false;
    if (q.planExpiresAt) {
      const t = r.planExpiresAt && r.planExpiresAt.getTime();
      const c = q.planExpiresAt;
      if (c instanceof Date) { if (!t || t !== c.getTime()) return false; }
      else {
        if (!t) return false;
        if (c.$lte && !(t <= c.$lte.getTime())) return false;
        if (c.$gt && !(t > c.$gt.getTime())) return false;
      }
    }
    if (q.renewalSent && q.renewalSent.$ne && r.renewalSent.includes(q.renewalSent.$ne)) return false;
    return true;
  };
  const Business = {
    find: (q) => ({ limit: async () => rows.filter((r) => match(r, q)) }),
    updateOne: async (q, u) => {
      const r = rows.find((x) => match(x, q));
      if (!r) return { modifiedCount: 0 };
      if (u.$addToSet) r.renewalSent.push(u.$addToSet.renewalSent);
      if (u.$set) Object.assign(r, u.$set);
      return { modifiedCount: 1 };
    },
  };
  const Subscription = { findOne: () => ({ sort: () => ({ select: async () => ({ period: 'monthly' }) }) }) };
  const sent = [];
  const modelsPath = require.resolve('../src/models');
  const notifPath = require.resolve('../src/services/notification.service');
  require.cache[modelsPath] = { id: modelsPath, filename: modelsPath, loaded: true, exports: { Business, Subscription, Booking: {} } };
  require.cache[notifPath] = { id: notifPath, filename: notifPath, loaded: true, exports: { toOwner: async (b, type, subject, text) => sent.push({ id: b._id, type, text }) } };
  const jobs = require('../src/jobs');

  await jobs.checkSubscriptions();
  await jobs.checkSubscriptions(); // a second run must not repeat anything

  const byId = (id) => sent.filter((s) => s.id === id);
  assert.strictEqual(byId('a').length, 1);
  assert.match(byId('a')[0].text, /in 3 days/);
  assert.match(byId('a')[0].text, /example\.test\/dashboard\/billing/);
  assert.match(byId('a')[0].text, /save/i); // monthly payer sees the yearly nudge
  assert.strictEqual(byId('b').length, 1);
  assert.match(byId('b')[0].text, /tomorrow/);
  assert.strictEqual(byId('c').length, 1);
  assert.strictEqual(byId('c')[0].type, 'subscription_ended');
  assert.strictEqual(get('c').plan, 'free');
  assert.strictEqual(byId('d').length, 0);
  assert.strictEqual(byId('e').length, 0);
  assert.strictEqual(get('a').plan, 'starter'); // not downgraded yet
});
