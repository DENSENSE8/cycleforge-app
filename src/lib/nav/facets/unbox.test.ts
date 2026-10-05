import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { NAV_FACET_GROUPS } from './contexts';
import { unboxFacets, type UnboxFacetContext } from './unbox';

const line = (fields: Partial<ReceivingLineRow>) =>
  ({ unboxed_at: '2026-10-01T18:00:00.000Z', quantity_expected: 1, quantity_received: 1, workflow_status: 'DONE', ...fields }) as ReceivingLineRow;

const ROWS: ReceivingLineRow[] = [
  // Carton 10 matched no PO: Unfound.
  line({ id: 1, receiving_id: 10, receiving_source: 'unmatched', quantity_expected: null, workflow_status: 'UNBOXED' }),
  // Carton 20: a filed damage claim and a short line, plus a clean stuck line.
  line({ id: 2, receiving_id: 20, zoho_purchaseorder_number: 'PO-2', quantity_expected: 3, quantity_received: 1, ticket_reasons: [{ code: 'DAMAGED', ticket: '#5' }] as ReceivingLineRow['ticket_reasons'] }),
  line({ id: 3, receiving_id: 20, zoho_purchaseorder_number: 'PO-2', workflow_status: 'ERROR' }),
  // Carton 30 is clean.
  line({ id: 4, receiving_id: 30, zoho_purchaseorder_number: 'PO-4', item_name: 'Bose speaker', is_priority: true }),
  // Carton 40, a return, is short.
  line({ id: 5, receiving_id: 40, zoho_purchaseorder_number: 'PO-5', quantity_expected: 2, quantity_received: 0, intake_type: 'RETURN', workflow_status: 'AWAITING_TEST' }),
];

function facets(context: UnboxFacetContext, query: Record<string, string>) {
  const asked: URLSearchParams[] = [];
  const body = unboxFacets(context, new URLSearchParams(query), async (listParams) => {
    asked.push(listParams);
    return ROWS;
  });
  return { body, asked };
}

const counts = (group: { options: readonly { value: string; count: number }[] } | undefined) =>
  Object.fromEntries((group?.options ?? []).map((option) => [option.value, option.count]));

test('Unboxed and the Unbox station expose only the shared Status pills', () => {
  assert.deepEqual(NAV_FACET_GROUPS['incoming.unboxed'], [{ id: 'status', label: 'Status', param: 'dflag', multi: true, inline: true }]);
  assert.deepEqual(NAV_FACET_GROUPS.receive.map((group) => [group.param, group.multi]), [['dflag', true]]);
});

test('reads the Unboxed list query and counts cartons per pill', async () => {
  const { body, asked } = facets('incoming.unboxed', { lane: 'unboxed' });
  const res = await body;
  const listParams = asked[0]!;
  assert.equal(listParams.get('view'), 'activity');
  assert.equal(listParams.get('sort'), 'unboxed_newest');
  assert.equal(listParams.get('include'), null, 'no Find, no serial hydration');
  assert.equal(res.context, 'incoming.unboxed');
  assert.equal(res.total, 4);
  assert.deepEqual(counts(res.groups[0]), { UNFOUND: 1, CLAIM: 1, SHORT: 2 });
});

test('picking pills narrows the total (any-of) but never the pills themselves', async () => {
  const short = await facets('incoming.unboxed', { lane: 'unboxed', dflag: 'SHORT' }).body;
  assert.equal(short.total, 2);
  assert.deepEqual(counts(short.groups[0]), { UNFOUND: 1, CLAIM: 1, SHORT: 2 });
  assert.equal((await facets('incoming.unboxed', { lane: 'unboxed', dflag: 'UNFOUND,CLAIM' }).body).total, 2);
  assert.equal((await facets('incoming.unboxed', { lane: 'unboxed', dflag: 'BOGUS' }).body).total, 4, 'an unknown pill is no cut');
});

test('Find, Kind and the unboxed-date window narrow like the ledger', async () => {
  const { body, asked } = facets('incoming.unboxed', { lane: 'unboxed', find: 'bose' });
  const found = await body;
  assert.equal(asked[0]!.get('include'), 'serials', 'Find reads serials');
  assert.equal(found.total, 1);
  assert.deepEqual(counts(found.groups[0]), { UNFOUND: 0, CLAIM: 0, SHORT: 0 });
  const returns = await facets('incoming.unboxed', { lane: 'unboxed', dkind: 'return' }).body;
  assert.equal(returns.total, 1);
  assert.deepEqual(counts(returns.groups[0]), { UNFOUND: 0, CLAIM: 0, SHORT: 1 });
  assert.equal((await facets('incoming.unboxed', { lane: 'unboxed', dateFrom: '2026-10-02' }).body).total, 0);
  assert.equal((await facets('incoming.unboxed', { lane: 'unboxed', dateTo: '2026-10-01' }).body).total, 4);
});

test('Unbox History exposes only its Status pills', async () => {
  const res = await facets('receive', { unboxview: 'history' }).body;
  assert.equal(res.context, 'receive');
  assert.deepEqual(counts(res.groups[0]), { UNFOUND: 1, CLAIM: 1, SHORT: 2 });
  const short = await facets('receive', { unboxview: 'history', dflag: 'SHORT' }).body;
  assert.deepEqual(counts(short.groups[0]), { UNFOUND: 1, CLAIM: 1, SHORT: 2 });
  assert.equal(res.groups.length, 1);
});

test('Unbox Queue and Inbound expose no KPI-priority facet', async () => {
  const { body, asked } = facets('receive', {});
  const queue = await body;
  assert.equal(asked[0]!.get('view'), 'scanned');
  assert.equal(asked[0]!.get('sort'), 'priority');
  assert.deepEqual(queue.groups[0]!.options, [], 'the cards do not cut by the pills');
  assert.equal(queue.groups.length, 1);
  assert.equal(queue.total, 4);
  const inbound = facets('receive', { unboxview: 'incoming' });
  const res = await inbound.body;
  assert.equal(inbound.asked.length, 0);
  assert.deepEqual(res.groups.map((group) => group.options), [[]]);
});
