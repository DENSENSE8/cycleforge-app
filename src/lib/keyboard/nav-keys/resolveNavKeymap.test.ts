/**
 *   node --import tsx --test src/lib/keyboard/nav-keys/resolveNavKeymap.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchNavKey, resolveNavKeymap } from './resolveNavKeymap';

describe('resolveNavKeymap', () => {
  it('honors a declared preferred key when free', () => {
    const km = resolveNavKeymap([
      { id: 'photos', preferredKey: 'p' },
      { id: 'ticket', preferredKey: 't' },
    ]);
    assert.equal(km.get('photos'), 'p');
    assert.equal(km.get('ticket'), 't');
  });

  it('resolves a preferred-key collision deterministically by order', () => {
    const km = resolveNavKeymap([
      { id: 'photos', preferredKey: 'p' },
      { id: 'pairing', preferredKey: 'p' },
    ]);
    assert.equal(km.get('photos'), 'p', 'first in order keeps the letter');
    assert.notEqual(km.get('pairing'), 'p', 'second falls back');
    assert.ok(km.get('pairing'), 'second still gets a letter');
  });

  it('derives from the id then a–z for undeclared targets', () => {
    const km = resolveNavKeymap([{ id: 'units' }]);
    assert.equal(km.get('units'), 'u', 'first free letter of the id');
  });

  it('assigns unique letters within a live set', () => {
    const km = resolveNavKeymap([
      { id: 'a-one', preferredKey: 'x' },
      { id: 'b-two', preferredKey: 'x' },
      { id: 'c-three', preferredKey: 'x' },
    ]);
    const letters = [...km.values()];
    assert.equal(new Set(letters).size, letters.length, 'no duplicate letters');
    assert.equal(letters.length, 3, 'every target got a letter');
  });

  it('is deterministic for the same input', () => {
    const input = [
      { id: 'ticket', preferredKey: 't' },
      { id: 'photos', preferredKey: 'p' },
      { id: 'linkage', preferredKey: 'k' },
    ];
    const a = resolveNavKeymap(input);
    const b = resolveNavKeymap(input);
    assert.deepEqual([...a.entries()], [...b.entries()]);
  });

  it('ignores empty / multi-char / non-letter preferences (still assigns a letter)', () => {
    const km = resolveNavKeymap([
      { id: 'zeta', preferredKey: '' },
      { id: 'octo', preferredKey: '99' },
      { id: 'nova', preferredKey: '#' },
    ]);
    for (const id of ['zeta', 'octo', 'nova']) {
      const v = km.get(id);
      assert.ok(v && v.length === 1 && v >= 'a' && v <= 'z', `${id} got a real letter`);
    }
  });
});

describe('matchNavKey', () => {
  const km = resolveNavKeymap([{ id: 'photos', preferredKey: 'p' }]);

  it('matches a bare letter to its target id, case-insensitively', () => {
    assert.equal(matchNavKey('p', km), 'photos');
    assert.equal(matchNavKey('P', km), 'photos');
  });

  it('returns null for an unmapped letter', () => {
    assert.equal(matchNavKey('z', km), null);
  });

  it('returns null for non-letters (digits, named keys, space)', () => {
    assert.equal(matchNavKey('1', km), null);
    assert.equal(matchNavKey('Enter', km), null);
    assert.equal(matchNavKey(' ', km), null);
  });
});
