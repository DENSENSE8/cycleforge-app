/**
 * The chat print request boundary: what a browser verb may ask the station to
 * print, and which runs wait for the operator's tap.
 * Run: node --import tsx --test src/lib/assistant/chat-print-job.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialChatPrintPhase, parseChatPrintRequest, TOTE_RUN_CONFIRM_ABOVE } from './chat-print-job';

test('tote labels: existing handles reprint; a count mints new totes, bounded by the tote run ceiling', () => {
  assert.deepEqual(parseChatPrintRequest('print_handling_unit_labels', { handlingUnitIds: [351, 351, 350] }), {
    kind: 'tote_reprint',
    codes: ['H-351', 'H-350'],
  });
  assert.deepEqual(parseChatPrintRequest('print_handling_unit_labels', { count: 50 }), { kind: 'tote_new', count: 50 });
  assert.equal(parseChatPrintRequest('print_handling_unit_labels', { count: 201 }), null);
  assert.equal(parseChatPrintRequest('print_handling_unit_labels', { count: 0 }), null);
  assert.equal(parseChatPrintRequest('print_handling_unit_labels', { handlingUnitIds: [-1] }), null);
});

test('a new-tote run above the threshold waits for a tap; smaller runs and reprints look for the station at once', () => {
  assert.equal(initialChatPrintPhase({ kind: 'tote_new', count: TOTE_RUN_CONFIRM_ABOVE + 1 }).kind, 'confirm');
  assert.equal(initialChatPrintPhase({ kind: 'tote_new', count: TOTE_RUN_CONFIRM_ABOVE }).kind, 'finding');
  assert.equal(initialChatPrintPhase({ kind: 'tote_reprint', codes: ['H-1'] }).kind, 'finding');
});

test('order papers: a resolved device action parses; duplicates, runaway lists and unknown papers print nothing', () => {
  const order = (id: number) => ({ orderRowId: id, orderNumber: String(4000 + id), papers: 'packing slip' });
  assert.deepEqual(
    parseChatPrintRequest('print_order_paperwork', { orders: [order(1)], documents: ['packing_slip', 'invoice'], reprint: true }),
    { kind: 'papers', orders: [order(1)], documents: ['packing_slip'], reprint: true },
  );
  assert.equal(parseChatPrintRequest('print_order_paperwork', { orders: [order(1), order(1)], documents: ['packing_slip'] }), null);
  const many = Array.from({ length: 26 }, (_, i) => order(i + 1));
  assert.equal(parseChatPrintRequest('print_order_paperwork', { orders: many, documents: ['packing_slip'] }), null);
  assert.equal(parseChatPrintRequest('print_order_paperwork', { orders: [order(1)], documents: ['invoice'] }), null);
});
