import test from 'node:test';
import assert from 'node:assert/strict';

import type { RecordActionVerb } from './RecordActionStrip';
import { findDuplicateVerbHotkeys, scopeRecordVerbs } from './record-verb-scope';

const NOUN = { one: 'order', many: 'orders' };
const VERBS: RecordActionVerb[] = [
  { id: 'urgent', label: 'Mark urgent' },
  { id: 'label', label: 'Label', scope: 'single' },
  { id: 'merge', label: 'Merge', scope: 'bulk' },
  { id: 'scan-out', label: 'Scan out', scope: 'single', disabled: true, disabledReason: 'Already shipped' },
];

const face = (verbs: RecordActionVerb[]) => verbs.map((v) => [v.id, v.disabled ?? false, v.disabledReason ?? null]);

test('one checked: single verbs live, bulk verbs disabled with the reason', () => {
  assert.deepEqual(face(scopeRecordVerbs(VERBS, 1, NOUN)), [
    ['urgent', false, null],
    ['label', false, null],
    ['merge', true, 'Check two or more orders'],
    ['scan-out', true, 'Already shipped'],
  ]);
});

test('many checked: the same verbs in the same order; single verbs disabled, never dropped', () => {
  assert.deepEqual(face(scopeRecordVerbs(VERBS, 3, NOUN)), [
    ['urgent', false, null],
    ['label', true, 'One order at a time'],
    ['merge', false, null],
    ['scan-out', true, 'Already shipped'],
  ]);
});

test('duplicate hotkeys: case-insensitive, every claimant listed in order, unkeyed verbs ignored', () => {
  assert.deepEqual(
    findDuplicateVerbHotkeys([
      { id: 'resolve', hotkey: 'r' },
      { id: 'notes', hotkey: 'N' },
      { id: 'paperwork' },
      { id: 'create-rule', hotkey: 'R' },
      { id: 'focus-note', hotkey: 'n' },
      { id: 'blank', hotkey: ' ' },
      { id: 'blank-2', hotkey: '' },
      { id: 'urgent', hotkey: 'u' },
    ]),
    [
      { hotkey: 'r', ids: ['resolve', 'create-rule'] },
      { hotkey: 'n', ids: ['notes', 'focus-note'] },
    ],
  );
});

test('duplicate hotkeys: none when every letter is unique', () => {
  assert.deepEqual(findDuplicateVerbHotkeys([{ id: 'a', hotkey: 'a' }, { id: 'b', hotkey: 'b' }]), []);
});
