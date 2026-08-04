/**
 * The lane note's visibility gate — the correctness half of the note.
 *
 * Run: `npx tsx --test src/lib/receiving/incoming-lane-note.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveIncomingLaneNote } from './incoming-lane-note';

const base = {
  view: 'incoming' as const,
  trackingFiltered: false,
  rowCount: 12,
  providerLabel: 'Zoho Inventory',
};

test('the default lane states the constant once, at lane altitude', () => {
  const note = resolveIncomingLaneNote(base);
  assert.ok(note);
  assert.match(note.text, /Zoho Inventory/);
  assert.match(note.tip, /paste its tracking number/i);
});

test('a tracking paste SUPPRESSES it — that param relaxes the predicate stated', () => {
  // The note would be a confident false statement sitting directly above the
  // vendor-received rows the paste deliberately brought back.
  assert.equal(resolveIncomingLaneNote({ ...base, trackingFiltered: true }), null);
});

test('the removed lane suppresses it — that lane exists to show removed rows', () => {
  assert.equal(resolveIncomingLaneNote({ ...base, view: 'incoming_removed' }), null);
});

test('an empty lane suppresses it — a caption stacked on a teaching empty is noise', () => {
  assert.equal(resolveIncomingLaneNote({ ...base, rowCount: 0 }), null);
});

test('no connected provider degrades to the capability noun, never a vendor sentence', () => {
  for (const providerLabel of [null, undefined, '', '   ']) {
    const note = resolveIncomingLaneNote({ ...base, providerLabel });
    assert.ok(note);
    assert.match(note.text, /your purchasing source/);
    assert.doesNotMatch(note.text, /Zoho/);
  }
});
