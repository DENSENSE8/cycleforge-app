/**
 * The serial field's draft when the unit's serials change from OUTSIDE — a
 * serial scanned on the phone companion while the staffer is at the tablet.
 * The plausible bug: re-deriving the draft from the stored string, which
 * deletes the empty field the staffer just opened and reorders their list.
 *
 * Run: npx tsx --test src/components/kiosk/KioskSerialListField.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resyncDraft } from './KioskSerialListField';

test('a phone scan fills the empty field the staffer opened, keeping the rest in place', () => {
  assert.deepEqual(resyncDraft(['W100', ''], 'W100, CD300'), ['W100', 'CD300']);
});

test('a phone scan appends after the fields already typed', () => {
  assert.deepEqual(resyncDraft(['W100', 'RM2'], 'W100, RM2, CD300'), ['W100', 'RM2', 'CD300']);
});

test('a serial removed elsewhere (phone undo) leaves; blanks survive', () => {
  assert.deepEqual(resyncDraft(['W100', 'CD300', ''], 'w100'), ['W100', '']);
  assert.deepEqual(resyncDraft(['W100'], ''), ['']);
});
