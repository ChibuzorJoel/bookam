process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;

let subs = [];
let deleted = null;
const PushSubscription = {
  find: () => ({ lean: async () => subs }),
  deleteMany: async (q) => { deleted = q; },
};
const id = require.resolve(path.join('../src', 'models'));
require.cache[id] = { id, filename: id, loaded: true, exports: { PushSubscription } };

const sent = [];
webpush.sendNotification = async (sub, payload) => {
  if (sub.endpoint.includes('gone')) { const e = new Error('gone'); e.statusCode = 410; throw e; }
  sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
};
const push = require('../src/services/push.service');

test('sends to every device and removes the ones that no longer exist', async () => {
  subs = [
    { _id: 'a', endpoint: 'https://push.example/a', keys: { p256dh: 'x', auth: 'y' } },
    { _id: 'b', endpoint: 'https://push.example/gone', keys: { p256dh: 'x', auth: 'y' } },
  ];
  const r = await push.notifyBusiness('biz1', { title: 'New booking', body: 'Ada booked Braids', url: '/dashboard/bookings' });
  assert.deepStrictEqual(r, { sent: 1, removed: 1 });
  assert.strictEqual(sent[0].payload.title, 'New booking');
  assert.deepStrictEqual(deleted, { _id: { $in: ['b'] } });
});

test('is silent and harmless when push is not configured', async () => {
  const env = require('../src/config/env');
  const saved = env.VAPID_PRIVATE_KEY;
  env.VAPID_PRIVATE_KEY = '';
  assert.strictEqual(push.enabled(), false);
  assert.deepStrictEqual(await push.notifyBusiness('biz1', { title: 't', body: 'b' }), { sent: 0, removed: 0 });
  env.VAPID_PRIVATE_KEY = saved;
});
