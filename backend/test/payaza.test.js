process.env.NODE_ENV = 'test';
process.env.PAYAZA_PUBLIC_KEY = 'PZ78-PKTEST-abc';
process.env.PAYAZA_SECRET_KEY = 'secret-for-tests';
process.env.PAYAZA_MODE = 'Test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
process.env.PUBLIC_BASE_URL = 'https://example.test';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const payaza = require('../src/services/payaza.service');

const reply = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

test('webhook signature: accepts base64 and hex HMAC-SHA512, rejects anything else', () => {
  const raw = Buffer.from(JSON.stringify({ merchant_reference: 'BKG1' }));
  const d = crypto.createHmac('sha512', 'secret-for-tests').update(raw).digest();
  assert.ok(payaza.isValidSignature(raw, d.toString('base64')));
  assert.ok(payaza.isValidSignature(raw, d.toString('hex')));
  assert.ok(!payaza.isValidSignature(raw, 'nope'));
  assert.ok(!payaza.isValidSignature(Buffer.from('{"x":1}'), d.toString('base64')));
  assert.ok(!payaza.isValidSignature(raw, ''));
});

test('verify: completed + full amount is success at the expected kobo amount', async () => {
  global.fetch = reply(200, { success: true, data: { transaction_status: 'Completed', amount_received: 5000, transaction_fee: 75 } });
  const v = await payaza.verifyTransaction('BKG1', 500000);
  assert.equal(v.status, 'success');
  assert.equal(v.amount, 500000);
  assert.equal(v.fees, 7500);
});

test('verify: fee taken out of amount_received still counts as paid in full', async () => {
  global.fetch = reply(200, { success: true, data: { transaction_status: 'Completed', amount_received: 4925, transaction_fee: 75 } });
  assert.equal((await payaza.verifyTransaction('BKG1', 500000)).amount, 500000);
});

test('verify: underpayment returns the smaller amount so settlement flags a mismatch', async () => {
  global.fetch = reply(200, { success: true, data: { transaction_status: 'Completed', amount_received: 1000, transaction_fee: 15 } });
  const v = await payaza.verifyTransaction('BKG1', 500000);
  assert.equal(v.status, 'success');
  assert.equal(v.amount, 100000);
});

test('verify: initialized is pending, failed is failed, 400 (not found) is pending', async () => {
  global.fetch = reply(200, { success: true, data: { transaction_status: 'Initialized' } });
  assert.equal((await payaza.verifyTransaction('x', 100)).status, 'pending');
  global.fetch = reply(200, { success: true, data: { transaction_status: 'Failed' } });
  assert.equal((await payaza.verifyTransaction('x', 100)).status, 'failed');
  global.fetch = reply(400, { message: 'Payment failed' });
  assert.equal((await payaza.verifyTransaction('x', 100)).status, 'pending');
});

test('requests carry the Payaza auth header and tenant', async () => {
  let seen;
  global.fetch = async (url, init) => ((seen = { url, init }), { ok: true, status: 200, json: async () => ({ data: [{ name: 'GTBank', code: '058', active: true, type: 'bank' }, { name: 'MoMo', code: 'M', type: 'mobile_money' }] }) });
  const banks = await payaza.listBanks();
  assert.deepEqual(banks, [{ name: 'GTBank', code: '058' }]);
  assert.equal(seen.init.headers.Authorization, `Payaza ${Buffer.from('PZ78-PKTEST-abc').toString('base64')}`);
  assert.equal(seen.init.headers['X-TenantID'], 'test');
});
