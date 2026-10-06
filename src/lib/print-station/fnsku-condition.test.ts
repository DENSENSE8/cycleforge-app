import test from 'node:test';
import assert from 'node:assert/strict';
import { fnskuConditionMissing, fnskuConditionRequiredMessage, printStationConditionMissingOnly, printStationConditionWords } from './fnsku';

test('a condition token matches the words the label prints', () => {
  assert.equal(printStationConditionWords('very-good'), 'used - very good');
  assert.equal(printStationConditionWords('VERY-GOOD'), 'used - very good');
  assert.equal(printStationConditionWords('new'), 'new');
  assert.equal(printStationConditionWords('acceptable'), 'used - acceptable');
  assert.equal(printStationConditionWords(''), null);
  assert.equal(printStationConditionWords('none'), null);
  assert.equal(printStationConditionWords('mystery'), null);
  assert.equal(printStationConditionMissingOnly('none'), true);
  assert.equal(printStationConditionMissingOnly('NONE'), true);
  assert.equal(printStationConditionMissingOnly('good'), false);
  assert.equal(printStationConditionMissingOnly(''), false);
});

test('a blank condition refuses a print', () => {
  assert.equal(fnskuConditionMissing(null), true);
  assert.equal(fnskuConditionMissing('  '), true);
  assert.equal(fnskuConditionMissing('B+ Used - Very Good'), false);
  assert.match(fnskuConditionRequiredMessage('X001'), /X001/);
  assert.match(fnskuConditionRequiredMessage('X001'), /condition/);
});
