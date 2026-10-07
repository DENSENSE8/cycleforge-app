import assert from 'node:assert/strict';
import { test } from 'node:test';
import { titlePartNumbers } from './line-sku-suggest-contracts';

test('titlePartNumbers pulls part numbers out of a listing title', () => {
  assert.deepEqual(titlePartNumbers('Bose Wave Radio III IV CD Player Drive Mechanism Assembly 360148-0010 AUTHENTIC'), ['360148-0010']);
  assert.deepEqual(titlePartNumbers('Remote RC18T1-27 for Bose Lifestyle 18'), ['RC18T1-27']);
});

test('titlePartNumbers skips words, short codes and models with fewer than three digits in a row', () => {
  assert.deepEqual(titlePartNumbers('Bose Wave Music System III IV AM/FM'), []);
  assert.deepEqual(titlePartNumbers('Lifestyle 18 Series II'), []);
});
