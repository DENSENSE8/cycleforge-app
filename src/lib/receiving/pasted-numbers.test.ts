import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { pastedNumberPlaceholderId, pastedNumbers, removePastedNumbers } from './pasted-numbers';
import type { ReconEntry } from './reconcile';

const entry = (ref: string): ReconEntry => ({
  ref,
  key: ref.replace(/[^a-z0-9]/gi, '').toUpperCase(),
  status: 'not_received',
  reasonCode: 'no_match',
  detail: 'No match anywhere',
  pending: false,
  poNumber: null,
  vendor: null,
  exception: null,
});
const line = (id: number, patch: Partial<ReceivingLineRow>) =>
  ({ id, tracking_number: null, zoho_purchaseorder_number: null, source_order_id: null, ...patch }) as ReceivingLineRow;

test('every pasted number gets a place, in paste order; a line belongs to the first number it carries', () => {
  const rows = [
    line(1, { tracking_number: 'TRK-1', zoho_purchaseorder_number: 'PO-1' }),
    line(2, { zoho_purchaseorder_number: 'PO-2' }),
  ];
  // PO-1 is pasted after TRK-1: line 1 carries both and belongs to TRK-1.
  const numbers = pastedNumbers([entry('PO-2'), entry('TRK-1'), entry('JUNK'), entry('PO-1')], rows);
  assert.deepEqual(
    numbers.map((n) => [n.entry.ref, n.lines.map((l) => l.id), n.sharedWith]),
    [
      ['PO-2', [2], null],
      ['TRK-1', [1], null],
      ['JUNK', [], null],
      ['PO-1', [], 'TRK-1'],
    ],
  );
});

test('a number filtered out of the shown list leaves its lines to the next number carrying them', () => {
  const rows = [line(1, { tracking_number: 'TRK-1', zoho_purchaseorder_number: 'PO-1' })];
  const numbers = pastedNumbers([entry('PO-1')], rows);
  assert.deepEqual(numbers[0]!.lines.map((l) => l.id), [1]);
  assert.equal(numbers[0]!.sharedWith, null);
});

test('Find keeps a number by its own string, else only with matching lines', () => {
  const rows = [line(1, { tracking_number: 'TRK-1', item_name: 'Brake' }), line(2, { tracking_number: 'TRK-1', item_name: 'Chain' })];
  const find = (query: string) => ({ query, matches: (row: ReceivingLineRow) => (row.item_name ?? '').toLowerCase().includes(query) });
  const entries = [entry('TRK-1'), entry('JUNK')];
  assert.deepEqual(pastedNumbers(entries, rows, find('chain')).map((n) => [n.entry.ref, n.lines.map((l) => l.id)]), [['TRK-1', [2]]]);
  assert.deepEqual(pastedNumbers(entries, rows, find('junk')).map((n) => n.entry.ref), ['JUNK']);
  assert.deepEqual(pastedNumbers(entries, rows, find('trk')).map((n) => n.lines.length), [2]);
});

test('placeholder ids are negative, non-zero and stable per key', () => {
  const a = pastedNumberPlaceholderId('JUNK1');
  assert.ok(a < 0);
  assert.equal(a, pastedNumberPlaceholderId('JUNK1'));
  assert.notEqual(a, pastedNumberPlaceholderId('JUNK2'));
});

test('removing numbers rewrites ref_in; the last one out drops the filters too', () => {
  const params = new URLSearchParams({ ref_in: 'A-1,B-2,C-3', recon: 'not_received', recon_reason: 'no_match', page: '2' });
  assert.deepEqual(removePastedNumbers(params, new Set(['B2'])), ['A-1', 'C-3']);
  assert.equal(params.get('ref_in'), 'A-1,C-3');
  assert.equal(params.get('recon'), 'not_received');
  assert.equal(params.has('page'), false);
  assert.deepEqual(removePastedNumbers(params, new Set(['A1', 'C3'])), []);
  assert.equal(params.has('ref_in') || params.has('recon') || params.has('recon_reason'), false);
});
