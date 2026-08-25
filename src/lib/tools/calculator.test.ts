/**
 *   npx tsx --test src/lib/tools/calculator.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateExpression, formatCalcValue } from './calculator';

function value(input: string): number {
  const result = evaluateExpression(input);
  if (!result.ok) throw new Error(`expected "${input}" to evaluate: ${result.reason}`);
  return result.value;
}

function reason(input: string): string {
  const result = evaluateExpression(input);
  if (result.ok) throw new Error(`expected "${input}" to fail, got ${result.value}`);
  return result.reason;
}

describe('evaluateExpression', () => {
  it('respects precedence and parentheses', () => {
    assert.equal(value('2 + 3 * 4'), 14);
    assert.equal(value('(2 + 3) * 4'), 20);
    assert.equal(value('2 * (3 + 4) - 1'), 13);
    assert.equal(value('100 / 4 / 5'), 5, 'division is left-associative');
    assert.equal(value('17 % 5'), 2, '% is remainder, not percent-of');
  });

  it('handles signs, decimals and thousands separators', () => {
    assert.equal(value('-4 + 10'), 6);
    assert.equal(value('10 * -2'), -20);
    assert.equal(value('+7'), 7);
    assert.equal(value('.5 * 4'), 2);
    assert.equal(value('1,250 + 250'), 1500, 'a pasted 1,250 is one number');
    assert.equal(value('12 × 2'), 24);
    assert.equal(value('12 ÷ 4'), 3);
  });

  it('never returns a silently wrong answer where `eval` would', () => {
    // `eval('012')` is 10 (legacy octal); `eval('1,2')` is 2 (comma operator);
    // `eval('')` is undefined. All three are things an operator will type.
    assert.equal(value('012'), 12);
    assert.equal(value('1,2'), 12);
    assert.equal(reason(''), 'Nothing to calculate');
  });

  it('refuses division by zero rather than answering ∞', () => {
    assert.match(reason('12 / 0'), /divide by zero/);
    assert.match(reason('12 % 0'), /remainder of zero/);
  });

  it('reports a REASON for every malformed expression', () => {
    assert.match(reason('2 +'), /ends on an operator/);
    assert.match(reason('2 3'), /no operator between them/);
    assert.match(reason('(2 + 3'), /Unbalanced/);
    assert.match(reason('2 + 3)'), /Unbalanced/);
    assert.match(reason('()'), /Empty parentheses/);
    assert.match(reason('2 & 3'), /not something this calculator understands/);
    assert.match(reason('* 3'), /needs a number before it/);
  });
});

describe('formatCalcValue', () => {
  it('is a bench readout, not a float dump', () => {
    assert.equal(formatCalcValue(1500), '1,500');
    assert.equal(formatCalcValue(1 / 3), '0.333333');
    assert.equal(formatCalcValue(-20), '-20');
    assert.equal(formatCalcValue(2.5), '2.5');
  });
});
