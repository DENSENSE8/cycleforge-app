import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIT_ACTION } from '@/lib/audit-logs';
import {
  blockedOrderStatus,
  scanOutLabel,
  type ScanOutContext,
  type ScanOutDeps,
  type ScanOutAuditRequest,
  type ScanOutInput,
} from './scan-out';

const ORG = '00000000-0000-0000-0000-00000000000a';

function context(over: Partial<ScanOutContext['carton']> = {}, carrier: Partial<ScanOutContext> = {}): ScanOutContext {
  return {
    carton: {
      shipmentId: 77,
      tracking: '1Z999',
      receivingId: null,
      orderRowId: 501,
      orderId: 'A-1',
      productTitle: null,
      sku: null,
      itemNumber: null,
      condition: null,
      quantity: 1,
      accountSource: 'eBay',
      imageUrl: null,
      orderStatus: 'packed',
      ...over,
    },
    latestStatusCategory: null,
    isTerminal: false,
    ...carrier,
  };
}

interface Captured {
  created: Parameters<ScanOutDeps['createShipConfirm']>[0][];
  audits: Parameters<ScanOutDeps['recordAudit']>[];
  mirrored: Parameters<ScanOutDeps['mirrorAllocations']>[];
  published: Parameters<ScanOutDeps['publishOrderChanged']>[];
  invalidated: string[];
}

function fakes(opts: {
  shipmentId?: number | null;
  ctx?: ScanOutContext;
  existing?: { createdAt: string } | null;
  mirrorThrows?: boolean;
} = {}) {
  const cap: Captured = { created: [], audits: [], mirrored: [], published: [], invalidated: [] };
  const deps: ScanOutDeps = {
    resolveShipment: async () => (opts.shipmentId === undefined ? 77 : opts.shipmentId),
    loadContext: async () => opts.ctx ?? context(),
    findShipConfirm: async () => opts.existing ?? null,
    createShipConfirm: async (p) => {
      cap.created.push(p);
      return 9001;
    },
    recordAudit: async (...args) => {
      cap.audits.push(args);
      return 1;
    },
    mirrorAllocations: async (...args) => {
      cap.mirrored.push(args);
      if (opts.mirrorThrows) throw new Error('mirror down');
      return null;
    },
    invalidateCaches: async (org) => {
      cap.invalidated.push(org);
    },
    publishOrderChanged: async (...args) => {
      cap.published.push(args);
    },
  };
  return { deps, cap };
}

const bulk: ScanOutInput = {
  organizationId: ORG,
  scan: '1Z999',
  actorStaffId: 1,
  createdAt: null,
  origin: 'bulk',
};

function assertNoWrites(cap: Captured) {
  assert.equal(cap.created.length, 0);
  assert.equal(cap.audits.length, 0);
  assert.equal(cap.mirrored.length, 0);
  assert.equal(cap.published.length, 0);
}

test('unresolvable label is unmatched and writes nothing', async () => {
  const { deps, cap } = fakes({ shipmentId: null });
  assert.deepEqual(await scanOutLabel(bulk, deps), { kind: 'unmatched' });
  assertNoWrites(cap);
});

test('a cancelled order is refused before the delivered check, with no departure', async () => {
  const { deps, cap } = fakes({
    ctx: context({ orderStatus: ' Canceled ' }, { latestStatusCategory: 'DELIVERED' }),
  });
  const out = await scanOutLabel(bulk, deps);
  assert.equal(out.kind, 'blocked');
  assert.equal(out.kind === 'blocked' && out.blockReason, 'canceled');
  assertNoWrites(cap);
});

test('carrier-delivered (or terminal non-return) packages are not scanned out', async () => {
  for (const carrier of [
    { latestStatusCategory: 'DELIVERED' },
    { latestStatusCategory: 'EXCEPTION', isTerminal: true },
  ]) {
    const { deps, cap } = fakes({ ctx: context({}, carrier) });
    assert.equal((await scanOutLabel(bulk, deps)).kind, 'already-delivered');
    assertNoWrites(cap);
  }
  const { deps, cap } = fakes({ ctx: context({}, { latestStatusCategory: 'RETURNED', isTerminal: true }) });
  assert.equal((await scanOutLabel(bulk, deps)).kind, 'confirmed');
  assert.equal(cap.created.length, 1);
});

test('a package already scanned out is a duplicate: no second event or audit', async () => {
  const { deps, cap } = fakes({ existing: { createdAt: '2026-09-20 10:00:00' } });
  const out = await scanOutLabel(bulk, deps);
  assert.deepEqual(out.kind === 'duplicate' && out.shipConfirmedAt, '2026-09-20 10:00:00');
  assertNoWrites(cap);
});

test('bulk origin writes SHIP_CONFIRM + system audit attributed to the actor and org', async () => {
  const { deps, cap } = fakes();
  const out = await scanOutLabel(bulk, deps);

  assert.deepEqual(out.kind === 'confirmed' && out.activityId, 9001);
  assert.equal(cap.created.length, 1);
  assert.equal(cap.created[0].organizationId, ORG);
  assert.equal(cap.created[0].staffId, 1);
  assert.equal(cap.created[0].shipmentId, 77);
  assert.equal(cap.created[0].metadata.source, 'bulk-scan-out');
  assert.equal(cap.created[0].metadata.deskSelection, undefined);

  const [auditCtx, auditReq, audit] = cap.audits[0];
  assert.equal(auditCtx, null);
  assert.equal(auditReq, null);
  assert.equal(audit.action, AUDIT_ACTION.SHIP_CONFIRM_SCAN);
  assert.equal(audit.entityId, '77');
  assert.equal(audit.stationActivityLogId, 9001);
  assert.equal(audit.method, 'system');
  assert.equal(audit.actorStaffIdOverride, 1);
  assert.equal(audit.organizationIdOverride, ORG);
  assert.equal(audit.source, 'scripts.scan-out-packed-orders');

  assert.deepEqual(cap.mirrored, [[ORG, { packerLogId: 9001, shipmentId: 77, actorStaffId: 1 }]]);
  assert.deepEqual(cap.published, [[ORG, 501]]);
  assert.deepEqual(cap.invalidated, [ORG]);
});

test('desk selection threads the request ctx into the audit and flags the event; a failing mirror does not fail the scan', async () => {
  const { deps, cap } = fakes({ mirrorThrows: true });
  // A stand-in session: only identity matters — the domain threads it through untouched.
  const reqCtx = { organizationId: ORG, staffId: 5 } as unknown as ScanOutAuditRequest['ctx'];
  const out = await scanOutLabel(
    { ...bulk, origin: 'desk-selection', actorStaffId: 8, auditRequest: { ctx: reqCtx, req: null } },
    deps,
  );
  assert.equal(out.kind, 'confirmed');
  assert.equal(cap.created[0].staffId, 8);
  assert.equal(cap.created[0].metadata.source, 'shipped-scan-out');
  assert.equal(cap.created[0].metadata.deskSelection, true);
  assert.equal(cap.audits[0][0], reqCtx);
  assert.equal(cap.audits[0][2].method, undefined);
  assert.equal(cap.audits[0][2].source, 'api.shipped.scan-out');
});

test('blockedOrderStatus only names hold states', () => {
  assert.equal(blockedOrderStatus('CANCELLED'), 'cancelled');
  assert.equal(blockedOrderStatus('packed'), null);
  assert.equal(blockedOrderStatus(null), null);
  assert.equal(blockedOrderStatus('constructor'), null);
});
