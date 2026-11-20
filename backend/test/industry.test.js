const test = require('node:test');
const assert = require('node:assert');
const { TEMPLATES, KEYS, seedFor } = require('../src/data/industryTemplates');

test('every template seeds hidden items with whole-kobo prices', () => {
  for (const k of KEYS) {
    const { services, products } = seedFor(k, 'b1', TEMPLATES[k].mode);
    for (const row of [...services, ...products]) {
      assert.strictEqual(row.active, false);
      assert.ok(Number.isInteger(row.price) && row.price >= 0);
      assert.ok(row.name.length <= 120);
    }
    assert.ok(services.length + products.length > 0, k);
  }
});

test('mode filters what is seeded', () => {
  assert.strictEqual(seedFor('fashion', 'b', 'booking').products.length, 0);
  assert.strictEqual(seedFor('fashion', 'b', 'shop').services.length, 0);
  assert.ok(seedFor('fashion', 'b', 'both').products.length > 0);
});

test('unknown industry seeds nothing', () => {
  const r = seedFor('nope', 'b', 'both');
  assert.deepStrictEqual([r.services, r.products], [[], []]);
});
