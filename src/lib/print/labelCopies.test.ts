import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampLabelCopies,
  parseLabelCopies,
  parseLabelCopiesWire,
  toteRunPlateCount,
} from './labelCopies';

test('clampLabelCopies keeps 1..99 and defaults junk to 1', () => {
  assert.equal(clampLabelCopies(1), 1);
  assert.equal(clampLabelCopies(12), 12);
  assert.equal(clampLabelCopies(99), 99);
  assert.equal(clampLabelCopies(100), 99);
  assert.equal(clampLabelCopies(0), 1);
  assert.equal(clampLabelCopies(-4), 1);
  assert.equal(clampLabelCopies(2.9), 2);
  assert.equal(clampLabelCopies(undefined), 1);
  assert.equal(clampLabelCopies(Number.NaN), 1);
});

test('parseLabelCopiesWire only round-trips 1..99 integers', () => {
  assert.equal(parseLabelCopiesWire('1'), '1');
  assert.equal(parseLabelCopiesWire('99'), '99');
  assert.equal(parseLabelCopiesWire('01'), null);
  assert.equal(parseLabelCopiesWire('100'), null);
  assert.equal(parseLabelCopiesWire('0'), null);
  assert.equal(parseLabelCopiesWire('nope'), null);
});

test('parseLabelCopies reads the print-page count param', () => {
  assert.equal(parseLabelCopies(null), 1);
  assert.equal(parseLabelCopies('8'), 8);
  assert.equal(parseLabelCopies('nope'), 1);
});

test('toteRunPlateCount is totes × copies with no side doubling', () => {
  assert.equal(toteRunPlateCount(24, 4), 96);
  assert.equal(toteRunPlateCount(1, 4), 4);
});
