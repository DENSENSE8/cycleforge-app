/**
 *   npx tsx --test src/lib/keyboard/wedge-scan-machine.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  WEDGE_IDLE,
  WEDGE_MAX_INTER_KEY_MS,
  WEDGE_MIN_LENGTH,
  wedgeReduce,
  wedgeValueAcceptable,
  type WedgeKeyInput,
  type WedgeScanState,
} from './wedge-scan-machine';

const OPTS = { maxInterKeyMs: WEDGE_MAX_INTER_KEY_MS, minLength: WEDGE_MIN_LENGTH };

function key(
  partial: Partial<WedgeKeyInput> & Pick<WedgeKeyInput, 'key'>,
): WedgeKeyInput {
  return {
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    timeStamp: 0,
    editable: false,
    ...partial,
  };
}

function typeBurst(chars: string, startAt = 0, gap = 8): WedgeScanState {
  let state = WEDGE_IDLE;
  for (let i = 0; i < chars.length; i++) {
    const step = wedgeReduce(
      state,
      key({ key: chars[i]!, timeStamp: startAt + i * gap }),
      OPTS,
    );
    state = step.state;
    assert.equal(step.kind, 'append', `expected append for ${chars[i]}`);
  }
  return state;
}

describe('wedgeReduce — printable burst', () => {
  it('appends printable chars inside the inter-key window', () => {
    const state = typeBurst('1Z999AA10123456784');
    assert.equal(state.buffer, '1Z999AA10123456784');
    assert.ok(state.lastKeyAt > 0);
  });

  it('starts a fresh buffer when the inter-key gap is too long', () => {
    let state = typeBurst('ABC', 0, 8);
    const late = wedgeReduce(
      state,
      key({ key: 'X', timeStamp: state.lastKeyAt + WEDGE_MAX_INTER_KEY_MS + 1 }),
      OPTS,
    );
    assert.equal(late.kind, 'append');
    assert.equal(late.state.buffer, 'X');
  });
});

describe('wedgeReduce — commit / ignore / reset', () => {
  it('Enter commits the buffer and asks the listener to preventDefault', () => {
    const buffered = typeBurst('TRACK123456');
    const step = wedgeReduce(buffered, key({ key: 'Enter', timeStamp: 200 }), OPTS);
    assert.equal(step.kind, 'commit');
    if (step.kind !== 'commit') return;
    assert.equal(step.value, 'TRACK123456');
    assert.equal(step.preventDefault, true);
    assert.deepEqual(step.state, WEDGE_IDLE);
  });

  it('Tab commits the same way as Enter (some wedges terminate with Tab)', () => {
    const buffered = typeBurst('BIN-A-12');
    const step = wedgeReduce(buffered, key({ key: 'Tab', timeStamp: 80 }), OPTS);
    assert.equal(step.kind, 'commit');
    if (step.kind !== 'commit') return;
    assert.equal(step.value, 'BIN-A-12');
  });

  it('Enter with an empty buffer is ignored (does not steal the key)', () => {
    const step = wedgeReduce(WEDGE_IDLE, key({ key: 'Enter' }), OPTS);
    assert.equal(step.kind, 'ignore');
    assert.deepEqual(step.state, WEDGE_IDLE);
  });

  it('modifier chords reset without consuming', () => {
    const buffered = typeBurst('ABC');
    const step = wedgeReduce(buffered, key({ key: 'c', metaKey: true }), OPTS);
    assert.equal(step.kind, 'reset');
    assert.deepEqual(step.state, WEDGE_IDLE);
  });

  it('editable focus resets so a search box is never hijacked', () => {
    const buffered = typeBurst('ABC');
    const step = wedgeReduce(
      buffered,
      key({ key: 'd', editable: true, timeStamp: 40 }),
      OPTS,
    );
    assert.equal(step.kind, 'reset');
    assert.deepEqual(step.state, WEDGE_IDLE);
  });

  it('Backspace / Escape / arrows cancel the run', () => {
    const buffered = typeBurst('ABC');
    for (const k of ['Backspace', 'Escape', 'ArrowLeft']) {
      const step = wedgeReduce(buffered, key({ key: k }), OPTS);
      assert.equal(step.kind, 'reset', k);
      assert.deepEqual(step.state, WEDGE_IDLE);
    }
  });
});

describe('wedgeValueAcceptable', () => {
  it('rejects short accidental keystrokes and accepts a real payload', () => {
    assert.equal(wedgeValueAcceptable('AB', WEDGE_MIN_LENGTH), false);
    assert.equal(wedgeValueAcceptable('ABC', WEDGE_MIN_LENGTH), true);
    assert.equal(wedgeValueAcceptable('1Z999AA10123456784', WEDGE_MIN_LENGTH), true);
  });
});
