import { test } from 'node:test';
import { strictEqual } from 'node:assert';

import { suggestQcFailRemedy } from './fail-remedy';

const remedyOf = (failed: number, total: number, conditionGrade: string | null = 'USED_A') =>
  suggestQcFailRemedy({ failed, total, conditionGrade }).remedy;

test('a minority of failed checks suggests a partial refund — one in three is the line', () => {
  strictEqual(remedyOf(1, 8), 'partial_refund');
  strictEqual(remedyOf(1, 3), 'partial_refund');
  strictEqual(remedyOf(2, 6), 'partial_refund');
  strictEqual(remedyOf(2, 5), 'return');
  strictEqual(remedyOf(3, 3), 'return');
});

test('a fail with no failing check on record, or no checklist at all, suggests a return', () => {
  strictEqual(remedyOf(0, 8), 'return');
  strictEqual(remedyOf(0, 0), 'return');
});

test('a parts grade suggests a return however few checks failed', () => {
  strictEqual(remedyOf(1, 10, 'parts'), 'return');
});
