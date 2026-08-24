/**
 *   npx tsx --test src/lib/keybindings/chord.test.ts
 *
 * DB-free and React-free: chord parsing / matching is pure, so every invariant
 * here runs without a browser, a DOM, or a connection.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  chordId,
  formatChord,
  matchesChord,
  parseChord,
  type Chord,
  type ChordKeyEvent,
} from './chord';

function chord(spec: string): Chord {
  const parsed = parseChord(spec);
  if (!parsed) throw new Error(`expected "${spec}" to parse`);
  return parsed;
}

function ev(partial: Partial<ChordKeyEvent> & { key: string }): ChordKeyEvent {
  return {
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  };
}

describe('parseChord', () => {
  it('parses modifiers in any order and case', () => {
    assert.deepEqual(chord('Mod+Shift+P'), chord('shift+mod+p'));
    assert.equal(chordId(chord('Mod+Shift+P')), chordId(chord('SHIFT+MOD+p')));
  });

  it('reads letters off `key` and everything else off `code`', () => {
    assert.deepEqual(chord('Mod+V'), {
      key: 'v',
      kind: 'letter',
      mod: true,
      shift: false,
      alt: false,
      ctrl: false,
      meta: false,
    });
    // A digit becomes a `code`, because macOS delivers Alt+1 as `key: '¡'`.
    assert.equal(chord('Alt+1').key, 'Digit1');
    assert.equal(chord('Alt+1').kind, 'code');
    assert.equal(chord('Mod+/').key, 'Slash');
    assert.equal(chord('Esc').key, 'Escape');
    assert.equal(chord('F2').key, 'F2');
  });

  it('rejects a spec with no key, two keys, or an unknown single character', () => {
    assert.equal(parseChord('Mod+Shift'), null);
    assert.equal(parseChord('Mod+a+b'), null);
    assert.equal(parseChord(''), null);
    assert.equal(parseChord('   '), null);
    assert.equal(parseChord('Mod+€'), null);
  });

  it('refuses to guess at `+` as a key, because `+` is the separator', () => {
    assert.equal(parseChord('Mod++'), null);
    // Spell it by its code instead — and that does parse.
    assert.equal(chord('Mod+Equal').key, 'Equal');
    assert.equal(chord('Mod+NumpadAdd').key, 'NumpadAdd');
  });
});

describe('matchesChord', () => {
  it('checks every modifier in BOTH directions', () => {
    const cmdShiftV = chord('Mod+Shift+V');
    assert.equal(
      matchesChord(cmdShiftV, ev({ key: 'V', metaKey: true, shiftKey: true })),
      true,
    );
    // An extra Alt must NOT fire it — a predicate that only asserts what it
    // wants is how a chord quietly steals its neighbour.
    assert.equal(
      matchesChord(cmdShiftV, ev({ key: 'V', metaKey: true, shiftKey: true, altKey: true })),
      false,
    );
    // A missing Shift must not fire it either.
    assert.equal(matchesChord(cmdShiftV, ev({ key: 'v', metaKey: true })), false);
  });

  it('Mod matches EITHER ⌘ or Ctrl, but never both at once', () => {
    const modK = chord('Mod+K');
    assert.equal(matchesChord(modK, ev({ key: 'k', metaKey: true })), true);
    assert.equal(matchesChord(modK, ev({ key: 'k', ctrlKey: true })), true);
    assert.equal(matchesChord(modK, ev({ key: 'k' })), false);
    assert.equal(matchesChord(modK, ev({ key: 'k', metaKey: true, ctrlKey: true })), false);
  });

  it('an unmodified chord stands down while a mod key is held', () => {
    const esc = chord('Escape');
    assert.equal(matchesChord(esc, ev({ key: 'Escape', code: 'Escape' })), true);
    assert.equal(
      matchesChord(esc, ev({ key: 'Escape', code: 'Escape', metaKey: true })),
      false,
    );
  });

  it('a digit chord matches through a modifier-mangled `key`', () => {
    // macOS Alt+1 → key '¡'. Matching on `key` here is the documented bug.
    const alt1 = chord('Alt+1');
    assert.equal(matchesChord(alt1, ev({ key: '¡', code: 'Digit1', altKey: true })), true);
  });

  it('a letter chord matches through Shift-mangled case', () => {
    assert.equal(
      matchesChord(chord('Mod+Shift+U'), ev({ key: 'U', metaKey: true, shiftKey: true })),
      true,
    );
  });

  it('explicit Ctrl does not fire on ⌘, and vice versa', () => {
    assert.equal(matchesChord(chord('Ctrl+P'), ev({ key: 'p', ctrlKey: true })), true);
    assert.equal(matchesChord(chord('Ctrl+P'), ev({ key: 'p', metaKey: true })), false);
    assert.equal(matchesChord(chord('Cmd+P'), ev({ key: 'p', metaKey: true })), true);
    assert.equal(matchesChord(chord('Cmd+P'), ev({ key: 'p', ctrlKey: true })), false);
  });
});

describe('formatChord', () => {
  it('paints the platform face, and the label cannot drift from the binding', () => {
    assert.equal(formatChord(chord('Mod+Shift+V'), true), '⌘⇧V');
    assert.equal(formatChord(chord('Mod+Shift+V'), false), 'Ctrl+Shift+V');
    assert.equal(formatChord(chord('Alt+1'), true), '⌥1');
    assert.equal(formatChord(chord('Mod+/'), false), 'Ctrl+/');
    assert.equal(formatChord(chord('Escape'), false), 'Esc');
  });
});

describe('chordId', () => {
  it('is the same for two specs that mean the same chord', () => {
    assert.equal(chordId(chord('Mod+Shift+P')), chordId(chord('shift+MOD+P')));
  });

  it('separates chords that only differ by an unnamed modifier', () => {
    assert.notEqual(chordId(chord('Mod+P')), chordId(chord('Mod+Alt+P')));
    assert.notEqual(chordId(chord('Ctrl+P')), chordId(chord('Mod+P')));
  });
});
