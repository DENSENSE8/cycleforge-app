/** DB-free unit tests for {@link receivingLinesTableQuery} — the shared query-options SoT behind the Unbox table + KPI strip dedup. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { receivingLinesTableQuery } from './receiving-queries';
import {
  RECEIVING_MODES,
  type ReceivingModeContext,
} from '@/lib/receiving/receiving-modes';

const ctx: ReceivingModeContext = {
  historySearch: '',
  historySearchField: 'all',
  historySearchScope: 'all',
  historySort: '',
  incomingSearch: '',
  incomingState: null,
  incomingSort: '',
  incomingPoFrom: '',
  incomingPoTo: '',
  incomingPage: 1,
  incomingSource: 'all',
  isDeliveredUnscannedFacet: false,
  isDeliveredNotUnboxedFacet: false,
  staffFilterId: null,
  listSearch: '',
  queueStage: null,
  queueLane: null,
  priorityOnly: false,
  trackingIn: [],
};

/** Capture the URL each queryFn fetches without a network. */
async function captureFetchUrl(queryFn: () => Promise<unknown>): Promise<string> {
  const origFetch = globalThis.fetch;
  let captured = '';
  globalThis.fetch = (async (url: unknown) => {
    captured = String(url);
    return {
      ok: true,
      json: async () => ({ success: true, receiving_lines: [], total: 0, limit: 0, offset: 0 }),
    } as Response;
  }) as typeof fetch;
  try {
    await queryFn();
  } finally {
    globalThis.fetch = origFetch;
  }
  return captured;
}

test('full phase: queryKey identical to the descriptor (shared-cache contract)', () => {
  for (const mode of [
    RECEIVING_MODES.unbox_queue,
    RECEIVING_MODES.unbox_viewed,
    RECEIVING_MODES.history,
    RECEIVING_MODES.receive,
  ]) {
    const q = receivingLinesTableQuery(mode, ctx, 'full');
    assert.deepEqual([...q.queryKey], [...mode.queryKey(ctx)], mode.id);
    assert.equal(q.queryKey[0], 'receiving-lines-table', mode.id);
  }
});

test('full phase: params identical to the descriptor (incl. include=serials)', async () => {
  const url = await captureFetchUrl(
    receivingLinesTableQuery(RECEIVING_MODES.unbox_queue, ctx, 'full').queryFn,
  );
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(url.split('?')[0], '/api/receiving-lines');
  assert.equal(params.get('include'), 'serials');
  assert.equal(params.get('phase'), null);
  assert.equal(params.get('view'), 'scanned');
  assert.equal(params.get('sort'), 'priority');
});

test('spine phase: drops include=serials, sends phase=spine, same view', async () => {
  const url = await captureFetchUrl(
    receivingLinesTableQuery(RECEIVING_MODES.unbox_queue, ctx, 'spine').queryFn,
  );
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('phase'), 'spine');
  assert.equal(params.get('include'), null);
  assert.equal(params.get('view'), 'scanned');
  // Queue's window (50) sits under the paint clamp — untouched.
  assert.equal(params.get('limit'), '50');
});

test('spine phase: clamps deep windows to the paint limit; full keeps depth', async () => {
  const spineUrl = await captureFetchUrl(
    receivingLinesTableQuery(RECEIVING_MODES.history, ctx, 'spine').queryFn,
  );
  const fullUrl = await captureFetchUrl(
    receivingLinesTableQuery(RECEIVING_MODES.history, ctx, 'full').queryFn,
  );
  assert.equal(new URLSearchParams(spineUrl.split('?')[1]).get('limit'), '150');
  assert.equal(new URLSearchParams(fullUrl.split('?')[1]).get('limit'), '3000');
});

test('spine phase: keys as a spine leaf under the SAME full key', () => {
  for (const mode of [
    RECEIVING_MODES.unbox_queue,
    RECEIVING_MODES.unbox_viewed,
    RECEIVING_MODES.history,
  ]) {
    const fullKey = receivingLinesTableQuery(mode, ctx, 'full').queryKey;
    const spineKey = receivingLinesTableQuery(mode, ctx, 'spine').queryKey;
    assert.deepEqual([...spineKey], [...fullKey, 'spine'], mode.id);
  }
});

test('publishLineSerials patches units when provided and leaves them alone when omitted', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  const {
    publishLineSerials,
    receivingSiblingsQueryKey,
  } = await import('./receiving-queries');

  const qc = new QueryClient();
  const receivingId = 42;
  const lineId = 7;
  const units = [
    {
      id: 1,
      ordinal: 1,
      serial_unit_id: null,
      serial: null,
      serial_absent: false,
      serial_absent_reason: null,
      condition_grade: null,
    },
  ];
  qc.setQueryData(receivingSiblingsQueryKey(receivingId), {
    success: true,
    receiving_lines: [{ id: lineId, serials: [], units }],
  });

  publishLineSerials(qc, receivingId, lineId, [{ id: 99, serial_number: 'ABC' }]);
  const afterSerialOnly = qc.getQueryData<{
    receiving_lines: Array<{ serials: unknown; units: unknown }>;
  }>(receivingSiblingsQueryKey(receivingId));
  assert.deepEqual(afterSerialOnly?.receiving_lines[0]?.serials, [
    { id: 99, serial_number: 'ABC' },
  ]);
  assert.deepEqual(afterSerialOnly?.receiving_lines[0]?.units, units);

  const nextUnits = [{ ...units[0], serial_absent: true, serial_absent_reason: 'NOT_SERIALIZED' }];
  publishLineSerials(qc, receivingId, lineId, [], nextUnits);
  const afterUnits = qc.getQueryData<{
    receiving_lines: Array<{ serials: unknown; units: unknown }>;
  }>(receivingSiblingsQueryKey(receivingId));
  assert.deepEqual(afterUnits?.receiving_lines[0]?.units, nextUnits);
});
