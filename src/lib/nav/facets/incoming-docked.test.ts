import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { NAV_FACET_GROUPS } from './contexts';
import { incomingDockedFacets } from './incoming-docked';

const line = (fields: Partial<ReceivingLineRow>) => ({ scanned_at: '2026-10-03T18:00:00.000Z', ...fields }) as ReceivingLineRow;

const ROWS: ReceivingLineRow[] = [
  line({ id: 11, receiving_id: 1, tracking_number: '1Z999AA10123456784' }),
  line({ id: 12, receiving_id: 1, tracking_number: '1Z999AA10123456784' }),
  line({ id: 21, receiving_id: 2, tracking_number: '9400111899223344556677', intake_type: 'RETURN' }),
  line({ id: 31, receiving_id: null, tracking_number: '420123456789', scanned_at: '2026-09-01T18:00:00.000Z' }),
  // Two "Unfound receiving" placeholders for one tracking collapse into one carton.
  line({ id: -40, receiving_id: 40, tracking_number: 'TBA000111222' }),
  line({ id: -41, receiving_id: 41, tracking_number: 'tba000111222', scanned_at: '2026-10-03T19:00:00.000Z' }),
];

function facets(query: Record<string, string>) {
  const asked: URLSearchParams[] = [];
  const body = incomingDockedFacets(new URLSearchParams(query), async (listParams) => {
    asked.push(listParams);
    return ROWS;
  });
  return { body, asked };
}

test('incoming.docked declares one Status group on the list cut param', () => {
  assert.deepEqual(NAV_FACET_GROUPS['incoming.docked'], [{ id: 'status', label: 'Status', param: 'dflag', multi: true, inline: true }]);
});

test('reads the docked list query and counts the cartons it paints', async () => {
  const { body, asked } = facets({ lane: 'docked', find: '6784', staff: '7' });
  const res = await body;
  const listParams = asked[0]!;
  assert.equal(listParams.get('view'), 'scanned');
  assert.equal(listParams.get('sort'), 'scanned_newest');
  assert.equal(listParams.get('search'), '6784');
  assert.equal(listParams.get('search_field'), 'tracking');
  assert.equal(listParams.get('staff'), '7');
  // Find narrows in the browser too: only carton 1 ends in 6784.
  assert.equal(res.total, 1);
  assert.deepEqual(res.groups[0]!.options, [{ value: 'DOCKED', label: 'Docked', count: 1 }]);
});

test('every carton is one card: lines fold, unfound placeholders dedupe', async () => {
  const res = await facets({ lane: 'docked' }).body;
  assert.equal(res.context, 'incoming.docked');
  // carton 1 · carton 2 · carton-less line 31 · one unfound placeholder
  assert.equal(res.total, 4);
  assert.equal(res.groups[0]!.options[0]!.count, 4);
});

test('Kind and the arrival-date window narrow like the list', async () => {
  assert.equal((await facets({ dkind: 'return' }).body).total, 1);
  assert.equal((await facets({ dkind: 'bogus' }).body).total, 4, 'an unknown kind is no cut');
  assert.equal((await facets({ dateFrom: '2026-10-01' }).body).total, 3);
  assert.equal((await facets({ dateTo: '2026-09-30' }).body).total, 1);
});

test('picking Docked keeps the list; an unknown status value is no cut', async () => {
  const picked = await facets({ dflag: 'DOCKED' }).body;
  assert.equal(picked.total, 4);
  assert.equal(picked.groups[0]!.options[0]!.count, 4);
  assert.equal((await facets({ dflag: 'UNFOUND' }).body).total, 4);
});
