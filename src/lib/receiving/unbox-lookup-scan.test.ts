/**
 * DB-free contract for the lookup-scan server half (house `Deps` pattern).
 *
 * Run: `npx tsx --test src/lib/receiving/unbox-lookup-scan.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordUnboxLookupScan,
  resolveUnboxScanKind,
  resolveUnboxScanState,
  type UnboxLookupScanDeps,
} from './unbox-lookup-scan';

interface Captured {
  queries: Array<{ text: string; params: unknown[] }>;
  events: Array<Record<string, unknown>>;
}

function fakes(opts?: {
  rows?: Array<Record<string, unknown>>;
  throwOnQuery?: boolean;
}): { deps: UnboxLookupScanDeps; captured: Captured } {
  const captured: Captured = { queries: [], events: [] };
  const deps: UnboxLookupScanDeps = {
    query: async (text, params) => {
      captured.queries.push({ text, params });
      if (opts?.throwOnQuery) throw new Error('db down');
      return { rows: opts?.rows ?? [] };
    },
    recordOpsEvent: (async (input: Record<string, unknown>) => {
      captured.events.push(input);
    }) as unknown as UnboxLookupScanDeps['recordOpsEvent'],
    resolveWorkflowNodeId: async () => 'node-unbox',
  };
  return { deps, captured };
}

test('resolveUnboxScanKind reads the street milestone, org-scoped', async () => {
  const { deps, captured } = fakes({ rows: [{ unboxed_at: null }] });
  await resolveUnboxScanKind('org-1', 482, 'unbox', deps);
  assert.equal(captured.queries.length, 1);
  assert.match(captured.queries[0].text, /receiving_unbox/);
  assert.match(captured.queries[0].text, /organization_id = \$2/);
  assert.deepEqual(captured.queries[0].params, [482, 'org-1']);
});

test('resolveUnboxScanKind returns lookup for an unboxed carton', async () => {
  const { deps } = fakes({ rows: [{ unboxed_at: '2026-07-10T18:03:00.000Z' }] });
  assert.equal(await resolveUnboxScanKind('org-1', 482, 'unbox', deps), 'lookup');
});

test('resolveUnboxScanKind returns work when never unboxed', async () => {
  const { deps } = fakes({ rows: [{ unboxed_at: null }] });
  assert.equal(await resolveUnboxScanKind('org-1', 482, 'unbox', deps), 'work');
});

test('a missing street row reads as work', async () => {
  const { deps } = fakes({ rows: [] });
  assert.equal(await resolveUnboxScanKind('org-1', 482, 'unbox', deps), 'work');
});

test('triage short-circuits without touching the DB', async () => {
  const { deps, captured } = fakes({ rows: [{ unboxed_at: '2026-07-10T18:03:00.000Z' }] });
  assert.equal(await resolveUnboxScanKind('org-1', 482, 'triage', deps), 'work');
  assert.equal(captured.queries.length, 0);
});

test('a failed read fails OPEN to work, never to lookup', async () => {
  // Direction matters: a misclassified work scan loses nothing; a misclassified
  // lookup silently skips a real attribution write.
  const { deps } = fakes({ throwOnQuery: true });
  assert.equal(await resolveUnboxScanKind('org-1', 482, 'unbox', deps), 'work');
});

test('resolveUnboxScanState returns the receipt facts in ONE round trip', async () => {
  // The receipt needs who-unboxed-it and the PO for its search jump. Both live
  // on the row we already read to classify, so a second query would be pure
  // cost on the scan hot path.
  const { deps, captured } = fakes({
    rows: [
      {
        unboxed_at: '2026-07-10T18:03:00.000Z',
        unboxed_by_name: 'Dana',
        zoho_purchaseorder_number: 'PO-4471',
      },
    ],
  });
  const state = await resolveUnboxScanState('org-1', 482, 'unbox', deps);
  assert.equal(captured.queries.length, 1);
  assert.deepEqual(state, {
    kind: 'lookup',
    unboxedAt: '2026-07-10T18:03:00.000Z',
    unboxedByName: 'Dana',
    poNumber: 'PO-4471',
  });
});

test('resolveUnboxScanState LEFT JOINs so an unfound / never-opened carton still resolves', async () => {
  // An unfound carton has no PO number and a never-opened one has no street
  // row; an INNER join would drop both to "no row" and read as work by
  // accident rather than by rule.
  const { deps, captured } = fakes({
    rows: [{ unboxed_at: null, unboxed_by_name: null, zoho_purchaseorder_number: null }],
  });
  const state = await resolveUnboxScanState('org-1', 482, 'unbox', deps);
  assert.match(captured.queries[0].text, /LEFT JOIN\s+receiving_unbox/);
  assert.match(captured.queries[0].text, /LEFT JOIN staff/);
  assert.deepEqual(state, {
    kind: 'work',
    unboxedAt: null,
    unboxedByName: null,
    poNumber: null,
  });
});

test('resolveUnboxScanState fails OPEN to work with empty facts', async () => {
  const { deps } = fakes({ throwOnQuery: true });
  assert.deepEqual(await resolveUnboxScanState('org-1', 482, 'unbox', deps), {
    kind: 'work',
    unboxedAt: null,
    unboxedByName: null,
    poNumber: null,
  });
});

test('resolveUnboxScanKind delegates — one query, one fail-open branch', async () => {
  const { deps, captured } = fakes({
    rows: [{ unboxed_at: '2026-07-10T18:03:00.000Z', unboxed_by_name: 'Dana', zoho_purchaseorder_number: 'PO-1' }],
  });
  assert.equal(await resolveUnboxScanKind('org-1', 482, 'unbox', deps), 'lookup');
  assert.equal(captured.queries.length, 1, 'the wrapper must not run its own second query');
});

test('recordUnboxLookupScan writes ONLY an append-only ops event', async () => {
  const { deps, captured } = fakes();
  await recordUnboxLookupScan(
    {
      organizationId: 'org-1',
      receivingId: 482,
      actorStaffId: 7,
      trackingNumber: '1Z999',
      occurredAt: new Date('2026-07-28T10:00:00.000Z'),
    },
    deps,
  );
  // No receiving_scans upsert — that row holds the WORK attribution.
  assert.equal(captured.queries.length, 0);
  assert.equal(captured.events.length, 1);
  const ev = captured.events[0];
  assert.equal(ev.eventType, 'RECEIVING_LOOKUP_SCAN');
  assert.equal(ev.entityType, 'receiving');
  assert.equal(ev.entityId, 482);
  assert.equal(ev.actorStaffId, 7);
  assert.equal(ev.workflowNodeId, 'node-unbox');
  assert.equal(
    ev.clientEventId,
    'unbox-lookup-scan:org-1:482:2026-07-28T10:00:00.000Z',
  );
});

test('recordUnboxLookupScan never throws on a writer failure', async () => {
  const { deps } = fakes();
  const boom: UnboxLookupScanDeps = {
    ...deps,
    recordOpsEvent: (async () => {
      throw new Error('ops down');
    }) as unknown as UnboxLookupScanDeps['recordOpsEvent'],
  };
  await recordUnboxLookupScan(
    { organizationId: 'org-1', receivingId: 482, actorStaffId: 7, trackingNumber: '1Z999' },
    boom,
  );
});
