import test from 'node:test';
import assert from 'node:assert/strict';
import { listNavRecents, recordNavRecentOpen, type NavRecentsDeps } from './service';
import type { NavRecentDbRow } from './store';
import type { NavRecentAdapterDeps } from './adapters';

const ORG = '00000000-0000-0000-0000-000000000001';

interface Captured {
  reads: Array<{ orgId: string; params: readonly unknown[] }>;
  writes: Array<{ orgId: string; params: readonly unknown[] }>;
  techLogCalls: Array<{ orgId: string; techId: number | null; limit: number }>;
  sessionCalls: Array<{ orgId: string; staffId: number; limit: number; before?: string; q?: string }>;
}

function fakes(storedRows: NavRecentDbRow[] = []) {
  const cap: Captured = { reads: [], writes: [], techLogCalls: [], sessionCalls: [] };
  const adapters = {
    fetchTechLogRows: async (orgId: string, opts: { techId: number | null; limit: number }) => {
      cap.techLogCalls.push({ orgId, techId: opts.techId, limit: opts.limit });
      return [];
    },
    listAssistantSessions: async (orgId: string, staffId: number, opts: { limit: number; before?: string; q?: string }) => {
      cap.sessionCalls.push({ orgId, staffId, ...opts });
      return {
        sessions: [{ id: 'a1b2', title: 'Label printer', updatedAt: '2026-09-27T10:00:00.000Z', messageCount: 4 }],
        nextBefore: 'cursor-2',
      };
    },
  } as unknown as NavRecentAdapterDeps;
  const deps: NavRecentsDeps = {
    store: {
      read: async (orgId, _sql, params) => {
        cap.reads.push({ orgId, params });
        return storedRows;
      },
      write: async (orgId, _sql, params) => {
        cap.writes.push({ orgId, params });
      },
    },
    adapters,
  };
  return { deps, cap };
}

const caller = (permissions: string[] = [], staffId = 7) => ({ orgId: ORG, staffId, permissions: new Set(permissions) });

test('POST to an adapter surface is refused with 400 and writes nothing', async () => {
  const { deps, cap } = fakes();
  const res = await recordNavRecentOpen(
    caller(['receiving.view']),
    { surface: 'receiving.viewed', entityType: 'receiving_line', entityId: '5', label: 'x' },
    deps,
  );
  assert.deepEqual(res, { ok: false, status: 400, error: 'SURFACE_NOT_WRITABLE' });
  assert.equal(cap.writes.length, 0);
});

test('a surface the caller lacks the permission for is 403 on read and write, before any IO', async () => {
  const { deps, cap } = fakes();
  const read = await listNavRecents(caller([]), { surface: 'support.tickets' }, deps);
  const write = await recordNavRecentOpen(
    caller([]),
    { surface: 'support.tickets', entityType: 'ticket', entityId: '9600', label: 'Refund' },
    deps,
  );
  assert.deepEqual(read, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'integrations.zendesk' });
  assert.deepEqual(write, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'integrations.zendesk' });
  assert.equal(cap.reads.length + cap.writes.length, 0);
});

test('entity types outside the surface vocabulary, and ids that cannot become a safe link, are 400', async () => {
  const { deps, cap } = fakes();
  const cases = [
    { surface: 'support.tickets', entityType: 'order', entityId: '1' },
    { surface: 'support.tickets', entityType: 'ticket', entityId: 'abc' },
    { surface: 'detail_stacks', entityType: 'claim', entityId: '3' },
    { surface: 'command_bar', entityType: 'page', entityId: '//evil.example/x' },
    { surface: 'command_bar', entityType: 'page', entityId: 'https://evil.example' },
    { surface: 'command_bar', entityType: 'order', entityId: '0' },
  ] as const;
  for (const c of cases) {
    const res = await recordNavRecentOpen(caller(['integrations.zendesk']), { ...c, label: '' }, deps);
    assert.equal(res.ok, false, JSON.stringify(c));
    assert.equal(!res.ok && res.status, 400, JSON.stringify(c));
  }
  assert.equal(cap.writes.length, 0);
});

test('an open is written for the caller (org + staff from auth) with that surface’s own cap', async () => {
  const { deps, cap } = fakes();
  await recordNavRecentOpen(
    caller(['integrations.zendesk'], 11),
    { surface: 'support.tickets', entityType: 'ticket', entityId: '9600', label: 'Refund request' },
    deps,
  );
  await recordNavRecentOpen(caller([], 11), { surface: 'command_bar', entityType: 'page', entityId: '/shipping/orders?queue=pick', label: 'Pick list' }, deps);
  assert.equal(cap.writes.length, 2);
  // [org, staff, surface, entity_type, entity_id, label, keep-others]; keep-others = cap − 1.
  assert.deepEqual(cap.writes[0].params, [ORG, 11, 'support.tickets', 'ticket', '9600', 'Refund request', 7]);
  assert.equal(cap.writes[0].orgId, ORG);
  assert.deepEqual(cap.writes[1].params.slice(0, 5), [ORG, 11, 'command_bar', 'page', '/shipping/orders?queue=pick']);
  assert.equal(cap.writes[1].params[6], 5);
});

test('store surfaces list newest-first rows as NavRecentRow with links built on read, limit clamped to the cap', async () => {
  const stored: NavRecentDbRow[] = [
    { entity_type: 'order', entity_id: '812', label_snapshot: 'Order #A-812', opened_at: new Date('2026-09-26T18:00:00Z') },
    { entity_type: 'receiving', entity_id: '55', label_snapshot: '', opened_at: '2026-09-26T17:00:00.000Z' },
    { entity_type: 'shipment', entity_id: '9', label_snapshot: 'FBA15', opened_at: '2026-09-26T16:00:00.000Z' },
  ];
  const { deps, cap } = fakes(stored);
  const res = await listNavRecents(caller([], 3), { surface: 'detail_stacks', limit: 40 }, deps);
  assert.equal(res.ok, true);
  assert.deepEqual(cap.reads[0].params, [ORG, 3, 'detail_stacks', 8]);
  if (!res.ok) return;
  assert.deepEqual(
    res.rows.map((r) => [r.id, r.title, r.href, r.at]),
    [
      ['order:812', 'Order #A-812', '/shipping/orders?openOrderId=812', '2026-09-26T18:00:00.000Z'],
      ['receiving:55', 'receiving 55', '/search?sel=receiving:55', '2026-09-26T17:00:00.000Z'],
      ['shipment:9', 'FBA15', '/fba?openShipmentId=9', '2026-09-26T16:00:00.000Z'],
    ],
  );
});

test('trace and labels-lookup recents link to the serial journey and the labels history pane', async () => {
  const { deps } = fakes([{ entity_type: 'serial', entity_id: 'SN 12/3', label_snapshot: 'SN 12/3', opened_at: '2026-09-26T10:00:00Z' }]);
  const trace = await listNavRecents(caller(['operations.view']), { surface: 'audit_log.trace' }, deps);
  assert.ok(trace.ok);
  assert.equal(trace.rows[0].href, '/operations?mode=history&dim=serial&serial=SN+12%2F3');

  const { deps: deps2 } = fakes([{ entity_type: 'unit', entity_id: '4410', label_snapshot: 'U-4410', opened_at: '2026-09-26T10:00:00Z' }]);
  const lookups = await listNavRecents(caller(['sku_stock.view']), { surface: 'labels.lookups' }, deps2);
  assert.ok(lookups.ok);
  assert.equal(lookups.rows[0].href, '/products?view=labels&labelsView=history&historyId=4410');
});

test('adapter surfaces read the caller’s own feed (tech scans are MY scans, not the org’s)', async () => {
  const { deps, cap } = fakes();
  const res = await listNavRecents(
    caller(['tech.view'], 21),
    // An unpaged, un-findable surface ignores the cursor and the text.
    { surface: 'tech.scans', limit: 10, before: 'cursor', q: 'x' },
    deps,
  );
  assert.deepEqual(res, { ok: true, surface: 'tech.scans', rows: [], nextBefore: null });
  assert.deepEqual(cap.techLogCalls, [{ orgId: ORG, techId: 21, limit: 10 }]);
});

test('chat threads are MY threads, paged by cursor and narrowed by Find, rows linking to the thread', async () => {
  const { deps, cap } = fakes();
  const denied = await listNavRecents(caller([], 21), { surface: 'assistant.sessions' }, deps);
  assert.deepEqual(denied, { ok: false, status: 403, error: 'FORBIDDEN', permission: 'assistant.chat' });

  const res = await listNavRecents(
    caller(['assistant.chat'], 21),
    { surface: 'assistant.sessions', limit: 30, before: 'cursor-1', q: 'label' },
    deps,
  );
  assert.ok(res.ok);
  assert.deepEqual(cap.sessionCalls, [{ orgId: ORG, staffId: 21, limit: 30, before: 'cursor-1', q: 'label' }]);
  assert.equal(res.nextBefore, 'cursor-2');
  assert.deepEqual(
    res.rows.map((row) => [row.entityId, row.title, row.at, row.href]),
    [['a1b2', 'Label printer', '2026-09-27T10:00:00.000Z', '/ai-chat?session=a1b2']],
  );
});
