/**
 * A unit's serials ride one TEXT value; these are the rules every reader and
 * writer relies on.
 *
 *   npx tsx --test src/lib/kiosk/serial-list.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendSerial, joinSerials, removeSerial, splitSerials } from './serial-list';

test('a legacy single serial is a one-item list and round-trips unchanged', () => {
  assert.deepEqual(splitSerials('0483221'), ['0483221']);
  assert.equal(joinSerials(splitSerials('0483221')), '0483221');
  assert.deepEqual(splitSerials(''), []);
  assert.deepEqual(splitSerials(null), []);
});

test('typed commas and newlines are separate serials; blanks are dropped', () => {
  assert.deepEqual(splitSerials(' A1 ,B2\n\n C3 ,'), ['A1', 'B2', 'C3']);
  assert.equal(joinSerials(['A1', '', '  ', 'B2']), 'A1, B2');
});

test('one unit never stores the same serial twice (case-blind), order kept', () => {
  assert.equal(joinSerials(['abc123', 'X9', 'ABC123']), 'abc123, X9');
  assert.equal(appendSerial('A1, B2', 'b2'), 'A1, B2');
  assert.equal(appendSerial('A1', 'C3'), 'A1, C3');
});

test('removing one serial leaves the others', () => {
  assert.equal(removeSerial('A1, B2, C3', 'b2'), 'A1, C3');
  assert.equal(removeSerial('A1', 'A1'), '');
});
