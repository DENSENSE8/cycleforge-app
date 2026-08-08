/**
 *   node --import tsx --test src/lib/keyboard/segment-chords.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { segmentChordHint, segmentChordIndexFromEvent } from './segment-chords';

function key(partial: Partial<KeyboardEvent> & { code: string }): KeyboardEvent {
  return {
    altKey: true,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    key: '1',
    preventDefault() {},
    stopPropagation() {},
    ...partial,
  } as KeyboardEvent;
}

describe('segmentChordIndexFromEvent', () => {
  it('maps Alt+Digit1…3 by code (macOS Alt+1 key drift safe)', () => {
    assert.equal(segmentChordIndexFromEvent(key({ code: 'Digit1', key: '¡' })), 0);
    assert.equal(segmentChordIndexFromEvent(key({ code: 'Digit2' })), 1);
    assert.equal(segmentChordIndexFromEvent(key({ code: 'Digit3' })), 2);
  });

  it('refuses bare digits and meta/ctrl/shift chords', () => {
    assert.equal(segmentChordIndexFromEvent(key({ code: 'Digit1', altKey: false })), null);
    assert.equal(segmentChordIndexFromEvent(key({ code: 'Digit1', metaKey: true })), null);
    assert.equal(segmentChordIndexFromEvent(key({ code: 'Digit1', ctrlKey: true })), null);
    assert.equal(segmentChordIndexFromEvent(key({ code: 'Digit1', shiftKey: true })), null);
  });

  it('ignores Digit4+', () => {
    assert.equal(segmentChordIndexFromEvent(key({ code: 'Digit4' })), null);
  });
});

describe('segmentChordHint', () => {
  it('returns empty outside 1–3', () => {
    assert.equal(segmentChordHint(0), '');
    assert.equal(segmentChordHint(4), '');
  });

  it('includes the slot digit', () => {
    const label = segmentChordHint(1);
    assert.match(label, /1/);
    assert.match(label, /⌥|Alt\+/);
  });
});
