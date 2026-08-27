/**
 * The default row-menu every recent rail gets from its published identity facts.
 * Run: npx tsx --test src/components/sidebar/rail-shell/rail-row-verbs.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { railIdentityActions } from './rail-row-verbs';
import type { RailPeekFact } from './RailPeekIdentityFacts';

const ctx = (
  over: Partial<{ copy: (v: string, l: string) => void; share: (() => void) | null }> = {},
) => ({ copy: () => {}, share: null, ...over });

test('one Copy per identity, in fact order — and no Open', () => {
  const facts: RailPeekFact[] = [
    { tone: 'order', value: '8101' },
    { tone: 'tracking', value: '1Z999' },
    { tone: 'sku', value: 'ABC-1' },
  ];
  assert.deepEqual(
    railIdentityActions(ctx(), facts).map((a) => a.label),
    ['Copy order', 'Copy tracking', 'Copy SKU'],
  );
});

test('Share is appended when the rail can link the row, omitted when it cannot', () => {
  const facts: RailPeekFact[] = [{ tone: 'order', value: '8101' }];
  assert.deepEqual(
    railIdentityActions(ctx({ share: () => {} }), facts).map((a) => a.id),
    ['copy:order', 'share'],
  );
  assert.deepEqual(railIdentityActions(ctx(), facts).map((a) => a.id), ['copy:order']);
});

test('a blank fact is omitted — even one flagged keepEmpty for the peek card', () => {
  const facts: RailPeekFact[] = [
    { tone: 'order', value: '   ', keepEmpty: true },
    { tone: 'serial', value: '' },
    { tone: 'bin', value: 'A-12' },
  ];
  assert.deepEqual(
    railIdentityActions(ctx(), facts).map((a) => a.id),
    ['copy:bin'],
  );
});

test('no facts and no share → no menu at all, rather than an empty shell', () => {
  assert.deepEqual(railIdentityActions(ctx(), undefined), []);
  assert.deepEqual(railIdentityActions(ctx(), []), []);
});

test('a repeated tone keeps both items, with distinct ids (React keys)', () => {
  const facts: RailPeekFact[] = [
    { tone: 'serial', value: 'SN-1' },
    { tone: 'serial', value: 'SN-2' },
  ];
  const ids = railIdentityActions(ctx(), facts).map((a) => a.id);
  assert.deepEqual(ids, ['copy:serial', 'copy:serial:2']);
  assert.equal(new Set(ids).size, ids.length);
});

test('Copy hands the TRIMMED value and the operator-facing label to the clipboard', () => {
  const calls: Array<[string, string]> = [];
  const actions = railIdentityActions(ctx({ copy: (v, l) => calls.push([v, l]) }), [
    { tone: 'tracking', value: '  1Z999  ' },
  ]);
  actions.find((a) => a.id === 'copy:tracking')!.onSelect();
  assert.deepEqual(calls, [['1Z999', 'tracking']]);
});

test('every item is a `read` verb — the default menu cannot change anything', () => {
  const facts: RailPeekFact[] = [{ tone: 'order', value: '8101' }];
  const actions = railIdentityActions(ctx({ share: () => {} }), facts);
  assert.ok(actions.length > 0);
  assert.ok(actions.every((a) => a.group === 'read'));
});
