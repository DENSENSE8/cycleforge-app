/**
 * Run: node --import tsx --test src/lib/receiving/preview-scan.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { previewUnboxScan, type PreviewScanDeps } from './preview-scan';

const ORG = 'org-1';

function summary(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 42,
    po_number: 'PO-9931-002',
    zendesk_ticket: '#8814',
    source_platform: 'ebay',
    opened_at: null,
    line_count: 3,
    unit_count: '7',
    title: 'Bose QC45',
    status: 'MATCHED',
    ...over,
  } as never;
}

/**
 * Fakes return VALUES, never replacement functions — an override that swapped
 * the whole impl would silently stop recording its own call, and the ladder
 * order (the thing under test) would go unasserted.
 */
function fakes(hits: {
  tracking?: number | null;
  ticket?: number | null;
  po?: number | null;
  summaryFound?: boolean;
} = {}) {
  const calls: string[] = [];
  const deps: PreviewScanDeps = {
    loadSummary: async (_o, id) => {
      calls.push(`summary:${id}`);
      return hits.summaryFound === false ? null : summary();
    },
    resolveTracking: async () => {
      calls.push('tracking');
      return hits.tracking ?? null;
    },
    resolveTicket: async () => {
      calls.push('ticket');
      return hits.ticket ?? null;
    },
    resolvePo: async () => {
      calls.push('po');
      return hits.po ?? null;
    },
  };
  return { deps, calls };
}

test('armed mode tries exactly that vocabulary — never the others', async () => {
  const { deps, calls } = fakes({ po: 42 });
  const res = await previewUnboxScan(ORG, 'PO-9931-002', 'order', deps);
  assert.equal(res.matched, true);
  assert.equal(res.resolvedMode, 'order');
  assert.deepEqual(calls, ['po', 'summary:42']);
  assert.equal(res.hit?.idKind, 'po');
});

test('auto deep-scans tracking → order → ticket and reports the winner', async () => {
  const { deps, calls } = fakes({ po: 42 });
  const res = await previewUnboxScan(ORG, '1Z999AA10123456784', 'auto', deps);
  assert.equal(res.resolvedMode, 'order');
  assert.deepEqual(calls, ['tracking', 'po', 'summary:42']);
});

test('a ticket-shaped value leads the auto ladder with ticket', async () => {
  const { deps, calls } = fakes({ ticket: 42 });
  const res = await previewUnboxScan(ORG, '#8814', 'auto', deps);
  assert.equal(res.resolvedMode, 'ticket');
  assert.deepEqual(calls, ['ticket', 'summary:42']);
  // Face leads with what the operator presented, not the carton's PO.
  assert.equal(res.hit?.idKind, 'ticket');
  assert.equal(res.hit?.idValue, '#8814');
});

test('a tracking hit carries the canonical number, not the raw scan', async () => {
  const { deps } = fakes({ tracking: 42 });
  const res = await previewUnboxScan(ORG, '  1Z999AA10123456784 ', 'tracking', deps);
  assert.equal(res.hit?.idKind, 'tracking');
  assert.equal(res.hit?.idValue, '1Z999AA10123456784');
});

test('counts survive the string/number seam Postgres returns for sum()', async () => {
  const { deps } = fakes({ tracking: 42 });
  const res = await previewUnboxScan(ORG, 'X', 'tracking', deps);
  assert.equal(res.hit?.lineCount, 3);
  assert.equal(res.hit?.unitCount, 7);
});

test('a resolved id whose carton is gone falls through, it does not 500', async () => {
  const { deps, calls } = fakes({ tracking: 99, summaryFound: false });
  const res = await previewUnboxScan(ORG, 'X', 'auto', deps);
  assert.equal(res.matched, false);
  assert.equal(res.hit, null);
  // Fell through the whole ladder rather than stopping on the dangling id.
  assert.deepEqual(calls, ['tracking', 'summary:99', 'po', 'ticket']);
});

test('no match reports a miss — it never invents a carton', async () => {
  const { deps } = fakes();
  const res = await previewUnboxScan(ORG, 'nothing-here', 'auto', deps);
  assert.deepEqual(res, {
    matched: false,
    resolvedMode: 'tracking',
    value: 'nothing-here',
    hit: null,
  });
});

test('an empty value resolves nothing and touches no table', async () => {
  const { deps, calls } = fakes();
  const res = await previewUnboxScan(ORG, '   ', 'auto', deps);
  assert.equal(res.matched, false);
  assert.deepEqual(calls, []);
});
