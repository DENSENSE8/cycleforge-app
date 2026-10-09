import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOW_STOCK_AT, stockQtyLevel, stockQtyToneClass } from './stock-qty';

test('stock count level: none is out, up to the low line is low', () => {
  assert.equal(stockQtyLevel(0), 'out');
  assert.equal(stockQtyLevel(-2), 'out');
  assert.equal(stockQtyLevel(1), 'low');
  assert.equal(stockQtyLevel(LOW_STOCK_AT), 'low');
  assert.equal(stockQtyLevel(LOW_STOCK_AT + 1), 'in');
});

test('a healthy count wears the surface ink; alerts are red / yellow on either ground', () => {
  assert.equal(stockQtyToneClass(0), 'text-text-danger');
  assert.equal(stockQtyToneClass(3), 'text-text-warning');
  assert.equal(stockQtyToneClass(40, { inkClass: 'text-mode-ink' }), 'text-mode-ink');
  assert.equal(stockQtyToneClass(0, { on: 'dark' }), 'text-red-500');
  assert.equal(stockQtyToneClass(3, { on: 'dark' }), 'text-yellow-300');
  assert.equal(stockQtyToneClass(40, { on: 'dark' }), 'text-white');
});
