import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIT_ACTION } from '@/lib/audit-logs';
import {
  blockedOrderStatus,
  scanOutBlockedMessage,
  scanOutBlockReason,
  scanOutCanRegister,
  scanOutKnownShipment,
  scanOutLabel,
  type ScanOutContext,
  type ScanOutDeps,
  type ScanOutAuditRequest,
  type ScanOutInput,
} from './scan-out';

const ORG = '00000000-0000-0000-0000-00000000000a';

/** Enough of an anonymous session for the writer to thread into the audit. */
function auditRequestCtx(staffId: number): ScanOutAuditRequest['ctx'] {
  return {
    user: null,
    session: null,
    staffId,
    organizationId: ORG,
    role: null,
    permissions: new Set(),
    authorizationMode: null,
    storedPermissions: new Set(),
    can: () => false,
    markAuditWritten: () => {},
  };
}

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
    isPacked: true,
    ...carrier,
  };
}

interface Captured {
  created: Parameters<ScanOutDeps['createShipConfirm']>[0][];
  audits: Parameters<ScanOutDeps['recordAudit']>[];
  mirrored: Parameters<ScanOutDeps['mirrorAllocations']>[];
  published: Parameters<ScanOutDeps['publishOrderChanged']>[];
  invalidated: string[];
  unmatched: Parameters<ScanOutDeps['recordUnmatched']>[0][];
}

function fakes(opts: {
  shipmentId?: number | null;
  ctx?: ScanOutContext;
  existing?: { createdAt: string } | null;
  mirrorThrows?: boolean;
  /** What `recordUnmatched` returns: the held exception id, or null when the label cannot be held. */
  unmatchedId?: number | null;
} = {}) {
  const cap: Captured = { created: [], audits: [], mirrored: [], published: [], invalidated: [], unmatched: [] };
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
    recordUnmatched: async (p) => {
      cap.unmatched.push(p);
      return opts.unmatchedId === undefined ? 3371 : opts.unmatchedId;
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
  assert.equal(cap.unmatched.length, 0);
}

test('an unresolvable label is held as an outbound unmatched scan and audited, with no scan-out', async () => {
  const { deps, cap } = fakes({ shipmentId: null });
  const reqCtx = auditRequestCtx(5);
  const out = await scanOutLabel(
    { ...bulk, scan: 'X-UNKNOWN-1', origin: 'dock', actorStaffId: 8, auditRequest: { ctx: reqCtx, req: null } },
    deps,
  );

  assert.deepEqual(out, { kind: 'unmatched', exceptionId: 3371 });
  assert.deepEqual(cap.unmatched, [
    { organizationId: ORG, scan: 'X-UNKNOWN-1', staffId: 8, notes: 'Scanned out at dock — no matching shipment' },
  ]);
  assert.equal(cap.audits.length, 1);
  const [auditCtx, , audit] = cap.audits[0];
  assert.equal(auditCtx, reqCtx);
  assert.equal(audit.action, AUDIT_ACTION.SHIP_CONFIRM_UNMATCHED);
  assert.equal(audit.entityId, '3371');
  assert.equal(audit.actorStaffIdOverride, 8);
  assert.equal(audit.organizationIdOverride, ORG);
  assert.equal(cap.created.length, 0);
  assert.equal(cap.mirrored.length, 0);
  assert.equal(cap.published.length, 0);
});

test('a re-scanned miss returns the same held exception (the dep upserts one open row)', async () => {
  const { deps, cap } = fakes({ shipmentId: null });
  const first = await scanOutLabel({ ...bulk, origin: 'phone' }, deps);
  const again = await scanOutLabel({ ...bulk, origin: 'phone' }, deps);
  assert.deepEqual(first, again);
  assert.equal(cap.unmatched[1]?.notes, 'Scanned out on phone — no matching shipment');
});

test('a miss that cannot be held is unmatched with no exception and no audit', async () => {
  const { deps, cap } = fakes({ shipmentId: null, unmatchedId: null });
  assert.deepEqual(await scanOutLabel(bulk, deps), { kind: 'unmatched', exceptionId: null });
  assert.equal(cap.unmatched.length, 1);
  assert.equal(cap.audits.length, 0);
  assert.equal(cap.created.length, 0);
});

test('bulk known-shipment scan-out never re-resolves a legacy tracking value', async () => {
  const { deps, cap } = fakes({
    shipmentId: null,
    ctx: context({ shipmentId: 88 }),
  });
  let resolveCalls = 0;
  deps.resolveShipment = async () => {
    resolveCalls += 1;
    return 999;
  };

  const out = await scanOutKnownShipment({ ...bulk, shipmentId: 88 }, deps);

  assert.equal(out.kind, 'confirmed');
  assert.equal(resolveCalls, 0);
  assert.equal(cap.created[0]?.shipmentId, 88);
});

test('a cancelled order is refused before scan-out, regardless of carrier status', async () => {
  const { deps, cap } = fakes({
    ctx: context({ orderStatus: ' Canceled ' }, { latestStatusCategory: 'DELIVERED' }),
  });
  const out = await scanOutLabel(bulk, deps);
  assert.equal(out.kind, 'blocked');
  assert.equal(out.kind === 'blocked' && out.blockReason, 'canceled');
  assertNoWrites(cap);
});

test('an unpacked order still scans out', async () => {
  const { deps, cap } = fakes({ ctx: context({}, { isPacked: false }) });
  const out = await scanOutLabel({ ...bulk, origin: 'dock' }, deps);
  assert.equal(out.kind, 'confirmed');
  assert.equal(cap.created.length, 1);
  assert.equal(cap.unmatched.length, 0);
});

test('carrier-delivered and terminal packages still scan out', async () => {
  for (const carrier of [
    { latestStatusCategory: 'DELIVERED' },
    { latestStatusCategory: 'EXCEPTION', isTerminal: true },
  ]) {
    const { deps, cap } = fakes({ ctx: context({}, carrier) });
    assert.equal((await scanOutLabel(bulk, deps)).kind, 'confirmed');
    assert.equal(cap.created.length, 1);
  }
});

test('a package already fulfilled is a duplicate: no second event or audit', async () => {
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
  assert.equal(cap.unmatched.length, 0);
});

test('desk selection threads the request ctx into the audit and flags the event; a failing mirror does not fail the scan', async () => {
  const { deps, cap } = fakes({ mirrorThrows: true });
  // A stand-in session: only identity matters — the domain threads it through untouched.
  const reqCtx = auditRequestCtx(5);
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

test('phone scan-out records resolver correlation and the canonical subject', async () => {
  const { deps, cap } = fakes();
  const out = await scanOutLabel({
    ...bulk,
    origin: 'phone',
    actorStaffId: 12,
    correlation: {
      clientEventId: '2e0c2964-a785-49b9-ac54-2a01cbdd1f0b',
      mobileScanEventId: 44,
      surface: '/m/id/scan-out/A-1',
    },
  }, deps);
  assert.equal(out.kind, 'confirmed');
  assert.deepEqual(cap.created[0].metadata, {
    source: 'shipped-scan-out',
    origin: 'phone',
    surface: '/m/id/scan-out/A-1',
    client_event_id: '2e0c2964-a785-49b9-ac54-2a01cbdd1f0b',
    mobile_scan_event_id: 44,
    order_row_id: 501,
    order_id: 'A-1',
    subject_entity_type: 'order',
    subject_id: '501',
    subject_identifier: 'A-1',
  });
});

test('a replayed dock miss records the scan-out though never pack-scanned, as its scanner at its instant', async () => {
  const { deps, cap } = fakes({ ctx: context({}, { isPacked: false }) });
  const out = await scanOutKnownShipment(
    { ...bulk, origin: 'resolved-miss', actorStaffId: 8, createdAt: '2026-10-01 14:05:09', heldExceptionId: 3371, shipmentId: 77 },
    deps,
  );
  assert.equal(out.kind, 'confirmed');
  assert.equal(cap.created[0]?.staffId, 8);
  assert.equal(cap.created[0]?.createdAt, '2026-10-01 14:05:09');
  assert.equal(cap.created[0]?.metadata.source, 'unmatched-scan-out-replay');
  assert.equal(cap.created[0]?.metadata.orders_exception_id, 3371);
  assert.equal(cap.audits[0]?.[2].method, 'system');
  assert.equal(cap.unmatched.length, 0);
});

test('a replayed dock miss on a cancelled order is still refused', async () => {
  const { deps, cap } = fakes({ ctx: context({ orderStatus: 'cancelled' }, { isPacked: false }) });
  const out = await scanOutKnownShipment({ ...bulk, origin: 'resolved-miss', shipmentId: 77 }, deps);
  assert.equal(out.kind === 'blocked' && out.blockReason, 'cancelled');
  assertNoWrites(cap);
});

test('scan-out refuses a cancelled order and records any other label', () => {
  assert.equal(blockedOrderStatus('CANCELLED'), 'cancelled');
  assert.equal(blockedOrderStatus('packed'), null);
  assert.equal(blockedOrderStatus(null), null);
  assert.equal(blockedOrderStatus('constructor'), null);
  assert.equal(scanOutBlockReason('packed'), null);
  assert.equal(scanOutBlockReason(' Canceled '), 'canceled');
  assert.equal(scanOutBlockedMessage('canceled'), 'Order is cancelled — do not ship. Pull this package.');
  assert.equal(scanOutCanRegister('FBA15ABCDEFGH'), true);
  assert.equal(scanOutCanRegister('1Z999AA10123456784'), true);
  assert.equal(scanOutCanRegister('X001234567'), false);
  assert.equal(scanOutCanRegister('SKU:2'), false);
  assert.equal(scanOutCanRegister('1234'), false);
});
