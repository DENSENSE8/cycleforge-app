import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAnimatedStatValue } from './animated-stat-model';

test('formats finite values independently of animation', () => {
  assert.deepEqual(resolveAnimatedStatValue(1234.5, 'en-US', { maximumFractionDigits: 1 }), {
    kind: 'number',
    value: 1234.5,
    formatted: '1,234.5',
  });
});

test('projects every non-finite value to the missing face', () => {
  assert.deepEqual(resolveAnimatedStatValue(Number.NaN), { kind: 'missing', formatted: '—' });
  assert.deepEqual(resolveAnimatedStatValue(Number.POSITIVE_INFINITY), { kind: 'missing', formatted: '—' });
});
