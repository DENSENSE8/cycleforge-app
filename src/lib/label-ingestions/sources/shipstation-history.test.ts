import test from 'node:test';
import assert from 'node:assert/strict';
import type { ShipStationV1Shipment } from '@/lib/shipping/shipstation/orders-v1';
import type { ShipStationLabelRecord } from '@/lib/shipping/shipstation/client';
import type { ShipStationOrderRow } from '@/lib/integrations/connectors/shipstation-tracking';
import type { PublicLabelIngestion, ShipStationIngestionOutcome, ShipStationLabelIngestionInput } from '../ingestion-service';
import {
  decideShipStationLabel,
  planShipStationHistory,
  runShipStationLabelBackfill,
  type ShipStationHistoryDeps,
  type ShipStationLabelCandidate,
} from './shipstation-history';

/**
 * DB-free: the ShipStation historical-label adapter's mapping, exception and
 * idempotency decisions against fake ShipStation + ledger + order IO.
 * Run: node --require ./scripts/register-server-only-shim.cjs --import tsx --test src/lib/label-ingestions/sources/shipstation-history.test.ts
 */

const PDF = Buffer.from('%PDF-1.7 label');
const SINCE = new Date('2026-09-17T00:00:00Z');

let nextId = 5000;
function shipment(over: Partial<ShipStationV1Shipment>): ShipStationV1Shipment {
  nextId += 1;
  return {
    shipmentId: nextId,
    orderId: 1,
    orderNumber: '100',
    createDate: '2026-09-20T10:00:00.0000000',
    shipDate: '2026-09-20',
    trackingNumber: `9400111899223197${String(nextId).padStart(6, '0')}`,
    carrierCode: 'stamps_com',
    serviceCode: 'usps_ground_advantage',
    isReturnLabel: false,
    voided: false,
    shipmentCost: 4.25,
    insuranceCost: null,
    ...over,
  };
}

function orderRow(orderNumber: string, orderRowId: number, accountSource: string | null, currentTracking: string | null = null): ShipStationOrderRow {
  return { orderNumber, orderRowId, accountSource, currentTracking };
}

function candidate(over: Partial<ShipStationLabelCandidate> = {}): ShipStationLabelCandidate {
  return {
    shipmentId: 1,
    labelId: 'se-1',
    orderNumber: 'A-1',
    trackingNumberRaw: '9400111899223197428490',
    trackingNumberNormalized: '9400111899223197428490',
    carrier: 'USPS',
    carrierCode: 'stamps_com',
    serviceCode: 'usps_ground_advantage',
    shipmentCost: 4.25,
    insuranceCost: null,
    primary: true,
    ...over,
  };
}

function ledgerRow(over: Partial<PublicLabelIngestion>): PublicLabelIngestion {
  return {
    id: 1, clientEventId: 'x', state: 'MATCHED', rowVersion: 1, sha256: 'a'.repeat(64), fileBasename: 'f.pdf', byteSize: 10,
    parserVersion: 'shipstation-api-v1', matchMethod: 'MARKETPLACE_ORDER_ID', trackingNumberRaw: null, trackingNumberNormalized: null, carrier: null,
    quarantineReasonCode: null, createdAt: '', updatedAt: '', source: 'SHIPSTATION_API', observedAt: '', accountSource: null, marketplaceOrderId: null,
    matchedOrderId: null, appliedAt: null, shipstationShipmentId: null, shipstationLabelId: null,
    ...over,
  };
}

// ─── plan ────────────────────────────────────────────────────────────────────

test('plan: voided, return and tracking-less labels are counted and dropped; a re-label is the order primary', () => {
  const first = shipment({ orderNumber: 'A', createDate: '2026-09-20T10:00:00' });
  const relabel = shipment({ orderNumber: 'A', createDate: '2026-09-21T10:00:00' });
  const plan = planShipStationHistory([
    first,
    relabel,
    shipment({ orderNumber: 'B', voided: true }),
    shipment({ orderNumber: 'C', isReturnLabel: true }),
    shipment({ orderNumber: 'D', trackingNumber: null }),
  ]);
  assert.deepEqual(
    { seen: plan.seen, voided: plan.voided, returns: plan.returns, noTracking: plan.noTracking },
    { seen: 5, voided: 1, returns: 1, noTracking: 1 },
  );
  assert.deepEqual(
    plan.candidates.map((c) => [c.shipmentId, c.primary, c.labelId]),
    [[first.shipmentId, false, `se-${first.shipmentId}`], [relabel.shipmentId, true, `se-${relabel.shipmentId}`]],
  );
});

test('plan: ShipStation carrier codes land in the stored vocabulary; tracking is normalized', () => {
  const [c] = planShipStationHistory([shipment({ carrierCode: 'ups_walleted', trackingNumber: ' 1z999aa10123456784 ' })]).candidates;
  assert.equal(c!.carrier, 'UPS');
  assert.equal(c!.trackingNumberNormalized, '1Z999AA10123456784');
});

// ─── decide ──────────────────────────────────────────────────────────────────

test('decide: a ShipStation order adopts its marketplace rows (never a parallel order)', () => {
  const d = decideShipStationLabel(candidate(), [orderRow('A-1', 12, 'ebay'), orderRow('A-1', 11, 'ebay')]);
  assert.equal(d.kind, 'MATCHED');
  assert.ok(d.kind === 'MATCHED');
  assert.deepEqual(d.orderIds, [11, 12]);
  assert.deepEqual(d.exactOrder, { accountSource: 'ebay', marketplaceOrderId: 'A-1', matchMethod: 'MARKETPLACE_ORDER_ID', cycleforgeReference: null });
  assert.equal(d.trackingCurrent, false);
});

test('decide: its own shipstation row wins over marketplace rows', () => {
  const d = decideShipStationLabel(candidate(), [orderRow('A-1', 3, 'ebay'), orderRow('A-1', 4, 'shipstation')]);
  assert.ok(d.kind === 'MATCHED');
  assert.deepEqual(d.orderIds, [4]);
  assert.equal(d.exactOrder.accountSource, 'shipstation');
});

test('decide: unresolvable labels stay exceptions with the precise reason — nothing is guessed', () => {
  assert.deepEqual(decideShipStationLabel(candidate({ orderNumber: null }), []), { kind: 'QUARANTINED', reason: 'TRACKING_ONLY' });
  assert.deepEqual(decideShipStationLabel(candidate(), []), { kind: 'QUARANTINED', reason: 'ORDER_NOT_FOUND' });
  assert.deepEqual(
    decideShipStationLabel(candidate(), [orderRow('A-1', 1, 'ECWID'), orderRow('A-1', 2, 'ecwid')]),
    { kind: 'QUARANTINED', reason: 'AMBIGUOUS_ORDER_MATCH' },
  );
  assert.deepEqual(
    decideShipStationLabel(candidate({ primary: false }), [orderRow('A-1', 1, 'ebay')]),
    { kind: 'QUARANTINED', reason: 'MULTI_PACKAGE_EVIDENCE' },
  );
  assert.deepEqual(
    decideShipStationLabel(candidate(), [orderRow('A-1', 1, '  ')]),
    { kind: 'QUARANTINED', reason: 'MISSING_ACCOUNT_CONTEXT' },
  );
});

test('decide: tracking already on every row (after normalization) needs no attach', () => {
  const current = decideShipStationLabel(candidate(), [orderRow('A-1', 1, 'ebay', '9400 1118 9922 3197 4284 90')]);
  assert.ok(current.kind === 'MATCHED' && current.trackingCurrent);
  const partial = decideShipStationLabel(candidate(), [
    orderRow('A-1', 1, 'ebay', '9400111899223197428490'),
    orderRow('A-1', 2, 'ebay', null),
  ]);
  assert.ok(partial.kind === 'MATCHED' && !partial.trackingCurrent);
});

// ─── run ─────────────────────────────────────────────────────────────────────

interface Fake {
  deps: ShipStationHistoryDeps;
  writes: string[];
  recorded: Array<Omit<ShipStationLabelIngestionInput, 'organizationId'>>;
  downloads: string[];
}

function fakeDeps(opts: {
  shipments: ShipStationV1Shipment[];
  orders?: ShipStationOrderRow[];
  ledger?: PublicLabelIngestion[];
  purchased?: string[];
  /** Label ids already on an order's label list (import / pairing / unlinked). */
  listed?: string[];
  labels?: Record<string, Partial<ShipStationLabelRecord> | null>;
  pdf?: Buffer;
  recordOutcome?: ShipStationIngestionOutcome;
}): Fake {
  const writes: string[] = [];
  const recorded: Fake['recorded'] = [];
  const downloads: string[] = [];
  let ids = 100;
  const deps: ShipStationHistoryDeps = {
    listShipments: async () => opts.shipments,
    findIngestions: async (shipmentIds) => (opts.ledger ?? []).filter((r) => shipmentIds.includes(r.shipstationShipmentId!)),
    findOrders: async (numbers) => (opts.orders ?? []).filter((r) => numbers.includes(r.orderNumber)),
    findPurchasedLabelIds: async () => new Set(opts.purchased ?? []),
    findListedLabelIds: async () => new Set(opts.listed ?? []),
    recordListedLabel: async ({ purpose, orderId, labelId, ingestionId }) => {
      writes.push(`list:${purpose}:${orderId}:${labelId}:${ingestionId ?? '-'}`);
    },
    getLabel: async (labelId) => {
      const over = opts.labels?.[labelId];
      if (over === null) return null;
      return {
        labelId, status: 'completed', engineShipmentId: null, trackingNumber: '', carrierCode: 'usps', carrierId: null, serviceCode: null,
        shipDate: null, cost: 0, currency: 'USD', voided: false, isReturnLabel: false,
        labelDownload: { pdf: `https://api.shipstation.com/v2/downloads/${labelId}.pdf`, png: null, zpl: null, href: null },
        ...over,
      } as ShipStationLabelRecord;
    },
    downloadLabel: async (url) => {
      downloads.push(url);
      return { buffer: opts.pdf ?? PDF, contentType: 'application/pdf' };
    },
    recordIngestion: async (input) => {
      recorded.push(input);
      writes.push(`record:${input.shipmentId}`);
      const outcome = opts.recordOutcome ?? 'CREATED';
      return {
        outcome,
        ingestion: ledgerRow({ id: ++ids, state: input.exactOrder ? 'MATCHED' : 'QUARANTINED', shipstationShipmentId: input.shipmentId }),
      };
    },
    promoteQuarantined: async (ingestion) => {
      writes.push(`promote:${ingestion.id}`);
      return { ...ingestion, state: 'MATCHED', rowVersion: ingestion.rowVersion + 1 };
    },
    attachTracking: async ({ orderIds, trackingNumber }) => { writes.push(`track:${orderIds.join('+')}:${trackingNumber}`); },
    findShipmentRow: async () => 77,
    storeLabelDocument: async ({ orderId, labelId }) => { writes.push(`doc:${orderId}:${labelId}`); return 900; },
    markApplied: async ({ ingestionId, expectedRowVersion, shipmentId, documentId }) => {
      writes.push(`applied:${ingestionId}@${expectedRowVersion}:${shipmentId}:${documentId}`);
    },
    onError: () => {},
    now: () => new Date('2026-09-24T12:00:00Z'),
  };
  return { deps, writes, recorded, downloads };
}

test('run (dry): reports every bucket, downloads to prove fetchability, writes nothing', async () => {
  const matched = shipment({ orderNumber: 'M' });
  const unmatched = shipment({ orderNumber: 'GHOST' });
  const voidedInV2 = shipment({ orderNumber: 'M2' });
  const inApp = shipment({ orderNumber: 'M' , createDate: '2026-09-19T00:00:00' });
  const fake = fakeDeps({
    shipments: [matched, unmatched, voidedInV2, inApp, shipment({ voided: true }), shipment({ isReturnLabel: true })],
    orders: [orderRow('M', 1, 'ebay'), orderRow('M2', 2, 'ebay')],
    purchased: [`se-${inApp.shipmentId}`],
    labels: { [`se-${voidedInV2.shipmentId}`]: { voided: true } },
  });
  const report = await runShipStationLabelBackfill({ since: SINCE, apply: false }, fake.deps);
  assert.deepEqual(fake.writes, []);
  assert.equal(fake.downloads.length, 2);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.shipmentsSeen, 6);
  assert.equal(report.voidedSkipped, 1);
  assert.equal(report.returnLabels, 1);
  // The return label's order ('100') is not in the org — it stays off every list.
  assert.deepEqual(report.returnsUnresolved, { ORDER_NOT_FOUND: 1 });
  assert.equal(report.returnsListed, 0);
  assert.equal(report.purchasedInApp, 1);
  assert.equal(report.pdfFetchable, 2);
  assert.deepEqual(report.pdfUnavailable, { LABEL_VOIDED: 1 });
  assert.equal(report.ingested, 2);
  assert.equal(report.trackingAttached, 1);
  assert.equal(report.applied, 1);
  assert.equal(report.listed, 1);
  assert.deepEqual(report.unresolved, { ORDER_NOT_FOUND: 1 });
});

test('run (apply): a matched label is recorded, tracked, documented, then finalized; an unmatched one only recorded', async () => {
  const matched = shipment({ orderNumber: 'M' });
  const unmatched = shipment({ orderNumber: 'GHOST' });
  const fake = fakeDeps({ shipments: [matched, unmatched], orders: [orderRow('M', 5, 'ebay'), orderRow('M', 6, 'ebay')] });
  const report = await runShipStationLabelBackfill({ since: SINCE, apply: true }, fake.deps);
  assert.deepEqual(fake.writes, [
    `record:${matched.shipmentId}`,
    `track:5+6:${matched.trackingNumber}`,
    `doc:5:se-${matched.shipmentId}`,
    'applied:101@1:77:900',
    `list:outbound:5:se-${matched.shipmentId}:101`,
    `record:${unmatched.shipmentId}`,
  ]);
  assert.equal(fake.recorded[1]!.quarantineReason, 'ORDER_NOT_FOUND');
  assert.equal(fake.recorded[1]!.exactOrder, null);
  assert.equal(fake.recorded[0]!.fileBasename, `shipstation-se-${matched.shipmentId}.pdf`);
  assert.equal(report.ingested, 2);
  assert.equal(report.applied, 1);
  assert.equal(report.listed, 1);
  assert.deepEqual(report.unresolved, { ORDER_NOT_FOUND: 1 });
});

test('run (apply): a re-run over an APPLIED / still-QUARANTINED ledger is a no-op — no download, no write', async () => {
  const done = shipment({ orderNumber: 'M' });
  const stuck = shipment({ orderNumber: 'GHOST' });
  const fake = fakeDeps({
    shipments: [done, stuck],
    orders: [orderRow('M', 5, 'ebay')],
    ledger: [
      ledgerRow({ id: 1, state: 'APPLIED', shipstationShipmentId: done.shipmentId }),
      ledgerRow({ id: 2, state: 'QUARANTINED', quarantineReasonCode: 'ORDER_NOT_FOUND', shipstationShipmentId: stuck.shipmentId }),
    ],
  });
  const report = await runShipStationLabelBackfill({ since: SINCE, apply: true }, fake.deps);
  assert.deepEqual(fake.writes, []);
  assert.deepEqual(fake.downloads, []);
  assert.deepEqual(report.alreadyIngested, { APPLIED: 1, QUARANTINED: 1 });
  assert.deepEqual(report.unresolved, { ORDER_NOT_FOUND: 1 });
});

test('run (apply): a quarantined label whose order has since landed is promoted and finished; a crashed MATCHED row is finished', async () => {
  const landed = shipment({ orderNumber: 'LATE' });
  const crashed = shipment({ orderNumber: 'M' });
  const fake = fakeDeps({
    shipments: [landed, crashed],
    orders: [orderRow('LATE', 8, 'walmart'), orderRow('M', 5, 'ebay', crashed.trackingNumber)],
    ledger: [
      ledgerRow({ id: 3, state: 'QUARANTINED', rowVersion: 1, shipstationShipmentId: landed.shipmentId }),
      ledgerRow({ id: 4, state: 'MATCHED', rowVersion: 2, accountSource: 'ebay', marketplaceOrderId: 'M', shipstationShipmentId: crashed.shipmentId }),
    ],
  });
  const report = await runShipStationLabelBackfill({ since: SINCE, apply: true }, fake.deps);
  assert.deepEqual(fake.writes, [
    'promote:3',
    `track:8:${landed.trackingNumber}`,
    `doc:8:se-${landed.shipmentId}`,
    'applied:3@2:77:900',
    `list:outbound:8:se-${landed.shipmentId}:3`,
    // tracking already current → no attach, but the PDF is (re)fetched and stored
    `doc:5:se-${crashed.shipmentId}`,
    'applied:4@2:77:900',
    `list:outbound:5:se-${crashed.shipmentId}:4`,
  ]);
  assert.equal(report.promoted, 1);
  assert.equal(report.trackingAlreadyCurrent, 1);
  assert.equal(report.applied, 2);
});

test('run (apply): a MATCHED ledger row whose order no longer resolves the same way is left alone', async () => {
  const s = shipment({ orderNumber: 'M' });
  const fake = fakeDeps({
    shipments: [s],
    orders: [orderRow('M', 5, 'amazon')],
    ledger: [ledgerRow({ id: 4, state: 'MATCHED', accountSource: 'ebay', marketplaceOrderId: 'M', shipstationShipmentId: s.shipmentId })],
  });
  const report = await runShipStationLabelBackfill({ since: SINCE, apply: true }, fake.deps);
  assert.deepEqual(fake.writes, []);
  assert.equal(report.failed, 1);
});

test('run (apply): byte-identical PDFs already ingested are not attached again; a non-PDF body is never recorded', async () => {
  const dup = shipment({ orderNumber: 'M' });
  const dupFake = fakeDeps({ shipments: [dup], orders: [orderRow('M', 5, 'ebay')], recordOutcome: 'DUPLICATE_PDF' });
  const dupReport = await runShipStationLabelBackfill({ since: SINCE, apply: true }, dupFake.deps);
  assert.deepEqual(dupFake.writes, [`record:${dup.shipmentId}`]);
  assert.equal(dupReport.duplicatePdf, 1);

  const html = fakeDeps({ shipments: [shipment({ orderNumber: 'M' })], orders: [orderRow('M', 5, 'ebay')], pdf: Buffer.from('<html>') });
  const htmlReport = await runShipStationLabelBackfill({ since: SINCE, apply: true }, html.deps);
  assert.deepEqual(html.writes, []);
  assert.deepEqual(htmlReport.pdfUnavailable, { NOT_A_PDF: 1 });
});

test('run (apply): a failed tracking attach leaves the row MATCHED (not finalized) and counts the failure', async () => {
  const s = shipment({ orderNumber: 'M' });
  const fake = fakeDeps({ shipments: [s], orders: [orderRow('M', 5, 'ebay')] });
  fake.deps.attachTracking = async () => { throw new Error('tracking owned by another order'); };
  const report = await runShipStationLabelBackfill({ since: SINCE, apply: true }, fake.deps);
  assert.deepEqual(fake.writes, [`record:${s.shipmentId}`]);
  assert.equal(report.failed, 1);
  assert.equal(report.applied, 0);
});

// ─── order-label list: returns, pairings, repairs ───────────────────────────

test('run (apply): a ShipStation return label lands on its order as a return — never its tracking, never re-imported', async () => {
  const outbound = shipment({ orderNumber: 'R-1' });
  const ret = shipment({ orderNumber: 'R-1', isReturnLabel: true });
  const unlinkedRet = shipment({ orderNumber: 'R-1', isReturnLabel: true });
  const fake = fakeDeps({
    shipments: [outbound, ret, unlinkedRet],
    orders: [orderRow('R-1', 40, 'ebay'), orderRow('R-1', 41, 'ebay')],
    // An operator unlinked this one — the list remembers it.
    listed: [`se-${unlinkedRet.shipmentId}`],
  });
  const report = await runShipStationLabelBackfill({ since: SINCE, apply: true }, fake.deps);
  assert.ok(fake.writes.includes(`list:return:40:se-${ret.shipmentId}:-`));
  // The return never attaches tracking nor stores a label document.
  assert.equal(fake.writes.filter((w) => w.includes(`se-${ret.shipmentId}`)).length, 1);
  assert.ok(!fake.writes.some((w) => w.startsWith('track:') && w.includes(ret.trackingNumber!)));
  assert.ok(!fake.writes.some((w) => w.includes(`se-${unlinkedRet.shipmentId}`)));
  assert.equal(report.returnLabels, 2);
  assert.equal(report.returnsListed, 1);
  assert.equal(report.returnsKnown, 1);
  // Returns never enter the ingestion ledger or the outbound candidate pass.
  assert.deepEqual(fake.recorded.map((r) => r.shipmentId), [outbound.shipmentId]);
});

test('run (apply): a second live label an operator paired (LINKED) is resolved — no promote, no download, no write', async () => {
  const first = shipment({ orderNumber: 'P', createDate: '2026-09-20T10:00:00' });
  const second = shipment({ orderNumber: 'P', createDate: '2026-09-21T10:00:00' });
  const fake = fakeDeps({
    shipments: [first, second],
    orders: [orderRow('P', 9, 'ebay')],
    ledger: [
      ledgerRow({ id: 20, state: 'APPLIED', matchedOrderId: 9, shipstationShipmentId: second.shipmentId }),
      ledgerRow({ id: 21, state: 'LINKED', matchedOrderId: 9, quarantineReasonCode: 'MULTI_PACKAGE_EVIDENCE', shipstationShipmentId: first.shipmentId }),
    ],
    listed: [`se-${second.shipmentId}`, `se-${first.shipmentId}`],
  });
  const report = await runShipStationLabelBackfill({ since: SINCE, apply: true }, fake.deps);
  assert.deepEqual(fake.writes, []);
  assert.deepEqual(fake.downloads, []);
  assert.deepEqual(report.alreadyIngested, { APPLIED: 1, LINKED: 1 });
  assert.deepEqual(report.unresolved, {});
});

test('run (apply): an APPLIED label missing from its order list is listed once (repair), dry-run only counts it', async () => {
  const s = shipment({ orderNumber: 'M' });
  const ledger = [ledgerRow({ id: 30, state: 'APPLIED', matchedOrderId: 5, shipstationShipmentId: s.shipmentId })];
  const dry = fakeDeps({ shipments: [s], orders: [orderRow('M', 5, 'ebay')], ledger });
  const dryReport = await runShipStationLabelBackfill({ since: SINCE, apply: false }, dry.deps);
  assert.deepEqual(dry.writes, []);
  assert.equal(dryReport.listed, 1);

  const fake = fakeDeps({ shipments: [s], orders: [orderRow('M', 5, 'ebay')], ledger });
  const report = await runShipStationLabelBackfill({ since: SINCE, apply: true }, fake.deps);
  assert.deepEqual(fake.writes, [`list:outbound:5:se-${s.shipmentId}:30`]);
  assert.equal(report.listed, 1);

  const again = fakeDeps({ shipments: [s], orders: [orderRow('M', 5, 'ebay')], ledger, listed: [`se-${s.shipmentId}`] });
  await runShipStationLabelBackfill({ since: SINCE, apply: true }, again.deps);
  assert.deepEqual(again.writes, []);
});
