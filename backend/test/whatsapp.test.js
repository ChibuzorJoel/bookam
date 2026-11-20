process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const { oneLine } = require('../src/services/whatsapp.service');

test('whatsapp template text is flattened to one line (Meta rejects new lines in variables)', () => {
  assert.strictEqual(oneLine('Hi Ada\n\nYour booking\tis    set\r\nSee you'), 'Hi Ada | Your booking is set | See you');
  assert.ok(!/[\n\t]/.test(oneLine('a\nb\tc')));
  assert.strictEqual(oneLine(undefined), '');
  assert.ok(oneLine('x'.repeat(5000)).length <= 1000);
});
