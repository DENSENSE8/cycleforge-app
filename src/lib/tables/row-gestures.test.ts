import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ROW_GESTURES,
  rowGesture,
  rowGestureForKey,
  rowGestureKeyOf,
} from './row-gestures';

describe('the gesture table', () => {
  it('declares gestures at all', () => {
    assert.ok(ROW_GESTURES.length >= 8);
  });

  it('gives every gesture a unique id', () => {
    const ids = ROW_GESTURES.map((g) => g.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('EVERY verb the pointer can reach, the keyboard can reach', () => {
    // The plan's §11 heading, and the one property this table can actually be
    // checked against. A pointer gesture with no keys is a mouse-only verb.
    const mouseOnly = ROW_GESTURES.filter((g) => g.pointer && g.keys.length === 0);
    assert.deepEqual(
      mouseOnly.map((g) => g.id),
      [],
      'these verbs are reachable by pointer and not by keyboard',
    );
  });

  it('never declares an empty key list', () => {
    for (const gesture of ROW_GESTURES) {
      assert.ok(
        gesture.keys.length > 0,
        `${gesture.id} binds nothing — delete it or give it a key`,
      );
    }
  });

  it('binds no key to two gestures in one layer', () => {
    const seen = new Map<string, string>();
    for (const gesture of ROW_GESTURES) {
      for (const key of gesture.keys) {
        const slot = `${gesture.layer}:${key.toLowerCase()}`;
        const prior = seen.get(slot);
        assert.equal(
          prior,
          undefined,
          `${key} is bound by both ${prior} and ${gesture.id} on the ${gesture.layer} layer`,
        );
        seen.set(slot, gesture.id);
      }
    }
  });

  it('says what each gesture does, in words an operator would use', () => {
    for (const gesture of ROW_GESTURES) {
      assert.ok(
        gesture.does.trim().length >= 10,
        `${gesture.id}: "${gesture.does}" is too thin to be a description`,
      );
    }
  });

  it('reserves the row menu by ABSENCE, not by a dead entry', () => {
    // The plan: "Right-click. Reserved. No per-row menu without a ruling." An
    // entry here would be a binding; a reservation is a comment.
    const contextMenu = ROW_GESTURES.filter(
      (g) => g.pointer?.toLowerCase().includes('right') || g.keys.includes('ContextMenu'),
    );
    assert.deepEqual(contextMenu.map((g) => g.id), []);
  });

  it('never puts a destructive verb on Enter — a scanner ends with Enter', () => {
    const onEnter = ROW_GESTURES.filter((g) => g.keys.includes('Enter'));
    for (const gesture of onEnter) {
      assert.doesNotMatch(
        gesture.does,
        /delete|remove|archive|ship|print/i,
        `${gesture.id} is on Enter and reads destructive`,
      );
    }
  });
});

describe('rowGestureKeyOf', () => {
  it('lower-cases a plain character so caps lock cannot unbind it', () => {
    assert.equal(rowGestureKeyOf({ key: 'X' }), 'x');
  });

  it('does NOT spell Shift into a character key', () => {
    // `shift+x` is just `X` to a scanner and to a caps-lock user, and the table
    // binds `x`. Spelling it would make the binding miss half the time.
    assert.equal(rowGestureKeyOf({ key: 'X', shiftKey: true }), 'x');
  });

  it('DOES spell Shift into a named key, which is how extend is expressed', () => {
    assert.equal(rowGestureKeyOf({ key: 'ArrowDown', shiftKey: true }), 'shift+ArrowDown');
  });

  it('spells ⌘ and Ctrl the same, so a binding cannot be platform-specific', () => {
    assert.equal(rowGestureKeyOf({ key: 'a', metaKey: true }), 'mod+a');
    assert.equal(rowGestureKeyOf({ key: 'a', ctrlKey: true }), 'mod+a');
  });
});

describe('rowGestureForKey', () => {
  it('resolves the plan’s map', () => {
    assert.equal(rowGestureForKey('j')?.id, 'cursor-next');
    assert.equal(rowGestureForKey('arrowup')?.id, 'cursor-prev');
    assert.equal(rowGestureForKey('x')?.id, 'toggle-select');
    assert.equal(rowGestureForKey(' ')?.id, 'toggle-select');
    assert.equal(rowGestureForKey('shift+arrowdown')?.id, 'extend-next');
    assert.equal(rowGestureForKey('mod+a')?.id, 'select-all');
    assert.equal(rowGestureForKey('enter')?.id, 'open-record');
    assert.equal(rowGestureForKey('o')?.id, 'open-record');
    assert.equal(rowGestureForKey('escape')?.id, 'dismiss');
  });

  it('resolves nothing for an unbound key', () => {
    assert.equal(rowGestureForKey('q'), null);
  });

  it('round-trips a real event shape through both helpers', () => {
    const spelling = rowGestureKeyOf({ key: 'ArrowDown', shiftKey: true });
    assert.equal(rowGestureForKey(spelling)?.id, 'extend-next');
  });
});

describe('rowGesture', () => {
  it('throws by NAME for an undeclared id, rather than returning undefined', () => {
    // @ts-expect-error — the point is the runtime guard behind the type.
    assert.throws(() => rowGesture('nope'), /nope/);
  });
});
