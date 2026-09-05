/**
 *   node --import tsx --test src/lib/item-record/receive-state.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  deriveReceiveState,
  leftoverRemaining,
  lineOsdMouthHeadline,
  receiveStateHeatClass,
  shortRemainingConfirmCopy,
} from './receive-state';

test('Open is got 0 with no exception', () => {
  assert.equal(deriveReceiveState({ counted: 0, expected: 2 }), 'open');
});

test('Partial is 0 < got < listed', () => {
  assert.equal(deriveReceiveState({ counted: 1, expected: 3 }), 'partial');
});

test('Received is got ≥ listed with no exception', () => {
  assert.equal(deriveReceiveState({ counted: 2, expected: 2 }), 'received');
});

test('SHORT / OVER / DAMAGED / WRONG_ITEM outrank qty', () => {
  assert.equal(deriveReceiveState({ counted: 1, expected: 3, exceptionCode: 'SHORT' }), 'short');
  assert.equal(deriveReceiveState({ counted: 4, expected: 2, exceptionCode: 'OVER' }), 'over');
  assert.equal(deriveReceiveState({ counted: 0, expected: 1, exceptionCode: 'DAMAGED' }), 'damaged');
  assert.equal(
    deriveReceiveState({ counted: 0, expected: 1, exceptionCode: 'WRONG_ITEM' }),
    'wrong_item',
  );
});

test('got > listed without a code is Over', () => {
  assert.equal(deriveReceiveState({ counted: 3, expected: 2 }), 'over');
});

test('no listed qty and no exception omits receiveState', () => {
  assert.equal(deriveReceiveState({ counted: 1 }), undefined);
  assert.equal(deriveReceiveState({ expected: null }), undefined);
});

test('§3 Short confirm names N and SHORT', () => {
  assert.equal(shortRemainingConfirmCopy(2), 'Mark 2 not received — write SHORT?');
});

test('mouth headlines stay on WeldedFeedbackPanel copy', () => {
  assert.equal(lineOsdMouthHeadline('SHORT', 2), 'Line · short 2');
  assert.equal(lineOsdMouthHeadline('OVER', 1), 'Line · over 1');
});

test('leftover remaining never goes below zero', () => {
  assert.equal(leftoverRemaining(0, 5), 5);
  assert.equal(leftoverRemaining(5, 5), 0);
  assert.equal(leftoverRemaining(8, 5), 0);
});

test('search / pack / shipped hosts omit receiveState', () => {
  const pack = readFileSync('src/components/packing/PackChecklistLineRow.tsx', 'utf8');
  const searchOrder = readFileSync('src/lib/item-record/shipped-order-item-record.ts', 'utf8');
  const searchUnit = readFileSync('src/lib/item-record/serial-unit-item-record.ts', 'utf8');
  const searchReceiving = readFileSync('src/lib/item-record/receiving-line-item-record.ts', 'utf8');
  assert.doesNotMatch(pack, /receiveState/);
  assert.doesNotMatch(searchOrder, /receiveState/);
  assert.doesNotMatch(searchUnit, /receiveState/);
  assert.doesNotMatch(searchReceiving, /receiveState/);
});

test('Open / Partial / exception heat; Received recedes; omit is no heat', () => {
  assert.equal(receiveStateHeatClass(undefined), null);
  assert.equal(receiveStateHeatClass('received'), null);
  assert.equal(receiveStateHeatClass('open'), 'bg-surface-station-row-hover');
  assert.equal(receiveStateHeatClass('partial'), 'bg-surface-warning');
  assert.equal(receiveStateHeatClass('over'), 'bg-surface-warning');
  assert.equal(receiveStateHeatClass('short'), 'bg-surface-danger');
  assert.equal(receiveStateHeatClass('damaged'), 'bg-surface-danger');
  assert.equal(receiveStateHeatClass('wrong_item'), 'bg-surface-danger');
});
