import assert from 'node:assert/strict';
import test from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import type { LabelPrintRow, PaperworkDocumentRow } from './contracts';
import { orderPacketQuerySchema, type PacketLabelDocument } from './order-packet-contracts';
import {
  buildOrderPacket,
  canonicalPacketLabels,
  deriveLabelSlotState,
  matchLabelSuggestions,
  orderPacketQueue,
  packetLabelMismatches,
  type PacketSource,
  type UnpairedLabelCandidate,
} from './order-packet-derive';
import { ORDER_PACKETS_SQL, orderPacketsParams, parseOrderPacketSearchParams } from './order-packets';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

function label(overrides: Partial<LabelPrintRow> = {}): LabelPrintRow {
  return {
    id: 1,
    documentId: null,
    state: 'MATCHED',
    rowVersion: 1,
    source: 'MANUAL_UPLOAD',
    fileBasename: 'label.pdf',
    carrier: 'USPS',
    trackingNumber: '9400111111111111111111',
    quarantineReasonCode: null,
    observedAt: '2026-10-01T00:00:00.000Z',
    orderId: 10,
    orderRef: '100618',
    shipstationShipmentId: null,
    printCount: 0,
    lastPrintedAt: null,
    lastPrintedBy: null,
    lastStationName: null,
    orderAccountSource: 'eBay',
    orderLines: [],
    ...overrides,
  };
}

function labelDocument(documentId: number, printCount = 0): PacketLabelDocument {
  return {
    key: `doc:${documentId}`,
    documentId,
    title: 'Shipping label',
    src: `/api/documents/${documentId}/content`,
    trackingNumber: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    printCount,
    lastPrintedAt: printCount ? '2026-10-02T00:00:00.000Z' : null,
  };
}

function slip(documentId: number, printCount = 0): PaperworkDocumentRow {
  return {
    key: `doc:${documentId}`,
    kind: 'packing_slip',
    documentId,
    manualId: null,
    title: 'Packing slip',
    src: `/api/documents/${documentId}/content`,
    printCount,
    lastPrintedAt: null,
    association: { source: 'order', orderLineIds: [10], itemNumber: null, sku: null, skuCatalogId: null },
  };
}

function manual(manualId: number, orderLineIds: number[], printCount = 0): PaperworkDocumentRow {
  return {
    key: `manual:${manualId}`,
    kind: 'manual',
    documentId: null,
    manualId,
    title: `Manual ${manualId}`,
    src: `/api/manuals/${manualId}/content`,
    printCount,
    lastPrintedAt: null,
    association: { source: 'sku', orderLineIds, itemNumber: null, sku: 'SKU-A', skuCatalogId: 7 },
  };
}

function line(orderLineId: number, overrides: Partial<PacketSource['lines'][number]> = {}): PacketSource['lines'][number] {
  return {
    orderLineId,
    itemNumber: null,
    skuCatalogId: 7,
    sku: 'SKU-A',
    title: 'Brake pads',
    quantity: 1,
    photoUrl: null,
    paperworkNotRequired: false,
    docsNotRequired: false,
    ...overrides,
  };
}

function source(overrides: Partial<PacketSource> = {}): PacketSource {
  return {
    orderId: 10,
    orderRef: '100618',
    accountSource: 'eBay',
    orderedAt: '2026-10-01T00:00:00.000Z',
    shipByAt: null,
    pickup: false,
    docsNotRequired: false,
    buyerNames: ['Jane Doe'],
    labels: [],
    labelDocuments: [],
    documents: [],
    lines: [line(10)],
    ...overrides,
  };
}

test('label slot: pickup is not required; an unapplied match is review; nothing is missing; applied / linked / ShipStation / document is filled', () => {
  assert.equal(deriveLabelSlotState({ pickup: true, labels: [], documents: [] }), 'not_required');
  assert.equal(deriveLabelSlotState({ pickup: false, labels: [], documents: [] }), 'missing');
  assert.equal(deriveLabelSlotState({ pickup: false, labels: [label({ state: 'MATCHED' })], documents: [] }), 'review');
  assert.equal(deriveLabelSlotState({ pickup: false, labels: [label({ state: 'QUARANTINED' })], documents: [] }), 'review');
  assert.equal(deriveLabelSlotState({ pickup: false, labels: [label({ state: 'APPLIED', documentId: 5 })], documents: [] }), 'filled');
  assert.equal(deriveLabelSlotState({ pickup: false, labels: [label({ state: 'LINKED', source: 'SHIPSTATION_API' })], documents: [] }), 'filled');
  assert.equal(deriveLabelSlotState({ pickup: false, labels: [], documents: [labelDocument(5)] }), 'filled');
  // A review label never counts as filled on its own, and pickup wins over a held label.
  assert.equal(deriveLabelSlotState({ pickup: true, labels: [label()], documents: [] }), 'not_required');
});

test('one APPLIED label and its document are ONE label', () => {
  const applied = label({ id: 3, state: 'APPLIED', documentId: 55 });
  const canonical = canonicalPacketLabels([applied], [labelDocument(55), labelDocument(56), labelDocument(56)]);
  assert.deepEqual(canonical.labels.map((row) => row.id), [3]);
  assert.deepEqual(canonical.documents.map((doc) => doc.documentId), [56]);
  const packet = buildOrderPacket(source({ labels: [applied], labelDocuments: [labelDocument(55)] }), []);
  assert.equal(packet.label.labels.length + packet.label.documents.length, 1);
  assert.equal(packet.label.state, 'filled');
});

test('line paperwork: not required via the SKU and via the order exemption; a slip is exempt only by the order', () => {
  const bySku = buildOrderPacket(source({ lines: [line(10, { paperworkNotRequired: true }), line(11, { sku: 'SKU-B', skuCatalogId: 8 })] }), []);
  assert.deepEqual(bySku.lines.map((row) => row.state), ['not_required', 'missing']);
  assert.equal(bySku.slip.state, 'missing');

  const byOrder = buildOrderPacket(source({ docsNotRequired: true, lines: [line(10), line(11)] }), []);
  assert.deepEqual(byOrder.lines.map((row) => row.state), ['not_required', 'not_required']);
  assert.equal(byOrder.slip.state, 'not_required');

  const byLineFlag = buildOrderPacket(source({ lines: [line(10, { docsNotRequired: true })] }), []);
  assert.equal(byLineFlag.lines[0]!.state, 'not_required');

  // Paperwork on file wins over an exemption.
  const filled = buildOrderPacket(source({ docsNotRequired: true, documents: [slip(1), manual(9, [10])] }), []);
  assert.equal(filled.slip.state, 'filled');
  assert.equal(filled.lines[0]!.state, 'filled');
});

test('a manual covering two lines appears on both lines', () => {
  const packet = buildOrderPacket(source({ lines: [line(10), line(11), line(12, { sku: 'SKU-C' })], documents: [manual(9, [10, 11])] }), []);
  assert.deepEqual(packet.lines.map((row) => row.documents.map((doc) => doc.key)), [['manual:9'], ['manual:9'], []]);
  assert.deepEqual(packet.lines.map((row) => row.state), ['filled', 'filled', 'missing']);
  // The slip never lists as line paperwork.
  assert.equal(buildOrderPacket(source({ documents: [slip(1)] }), []).lines[0]!.documents.length, 0);
});

test('status: any gap is Missing; every printable printed is Printed; else Ready', () => {
  const complete = { labels: [label({ state: 'APPLIED', documentId: 5 })], documents: [slip(1), manual(9, [10])] };
  const missing = buildOrderPacket(source({ ...complete, documents: [slip(1)] }), []);
  assert.equal(missing.status, 'missing');
  assert.equal(missing.gapCount, 1);

  const ready = buildOrderPacket(source(complete), []);
  assert.equal(ready.gapCount, 0);
  assert.equal(ready.status, 'ready');

  const printed = buildOrderPacket(
    source({ labels: [label({ state: 'APPLIED', documentId: 5, printCount: 1, lastPrintedAt: '2026-10-03T00:00:00.000Z' })], documents: [slip(1, 2), manual(9, [10], 1)] }),
    [],
  );
  assert.equal(printed.status, 'printed');
  assert.equal(printed.printCount, 4);
  assert.equal(printed.lastPrintedAt, '2026-10-03T00:00:00.000Z');

  // A review label is a gap even when everything else is on file.
  assert.equal(buildOrderPacket(source({ ...complete, labels: [label()] }), []).status, 'missing');
});

test('suggestions: the order number on the label, then the buyer-name rule; only for a Missing label; capped', () => {
  const unpaired = (id: number, overrides: Partial<UnpairedLabelCandidate> = {}): UnpairedLabelCandidate => ({
    ingestionId: id,
    rowVersion: 1,
    fileBasename: `l${id}.pdf`,
    batchId: null,
    pageNumber: null,
    trackingNumber: null,
    carrier: null,
    observedAt: '2026-10-01T00:00:00.000Z',
    shipToName: null,
    marketplaceOrderId: null,
    ...overrides,
  });
  const candidates = [
    unpaired(1, { marketplaceOrderId: '10-0618' }),
    unpaired(2, { shipToName: 'JANE Q DOE' }),
    unpaired(3, { shipToName: 'Jane Smith' }),
    unpaired(4, { shipToName: 'Doe' }),
  ];
  const found = matchLabelSuggestions({ orderRef: '100618', buyerNames: ['Jane Doe'] }, candidates);
  assert.deepEqual(found.map((row) => [row.ingestionId, row.matchMethod]), [[1, 'MARKETPLACE_ORDER_ID'], [2, 'BUYER_NAME']]);
  assert.equal(matchLabelSuggestions({ orderRef: '100618', buyerNames: ['Jane Doe'] }, candidates, 1).length, 1);
  assert.equal(buildOrderPacket(source(), candidates).label.suggestions.length, 2);
  assert.equal(buildOrderPacket(source({ labels: [label()] }), candidates).label.suggestions.length, 0);
});

test('mismatch: a label whose tracking is none of the order\'s boxes, or whose ship-to is not the buyer, is flagged', () => {
  const order = { buyerNames: ['Jane Doe', 'Doe Household'], trackingNumbers: ['9400111111111111111111', '1Z999AA10123456784'] };
  const evidence = (key: string, trackingNumber: string | null, shipToName: string | null) => ({ key, trackingNumber, shipToName });

  // Agreeing labels stay quiet: a second box, a spaced / lower-case number, the resolver's same-buyer rule.
  assert.deepEqual(
    packetLabelMismatches({ ...order, labels: [evidence('label:1', '1z999aa1 0123456784', 'JANE Q DOE'), evidence('doc:2', '9400 1111 1111 1111 1111 11', null)] }),
    [],
  );
  // USPS routing prefix (420 + ZIP) in front of the order's number is the same parcel.
  assert.deepEqual(packetLabelMismatches({ ...order, labels: [evidence('label:1', '420902109400111111111111111111', null)] }), []);

  assert.deepEqual(packetLabelMismatches({ ...order, labels: [evidence('label:3', '9400222222222222222222', 'John Smith')] }), [
    { labelKey: 'label:3', kind: 'tracking', label: '9400222222222222222222', order: '9400111111111111111111, 1Z999AA10123456784' },
    { labelKey: 'label:3', kind: 'ship_to', label: 'John Smith', order: 'Jane Doe' },
  ]);

  // Nothing to compare against is not a mismatch: no order tracking yet, a one-word name either side, nothing read.
  assert.deepEqual(packetLabelMismatches({ buyerNames: ['Jane Doe'], trackingNumbers: [], labels: [evidence('label:4', '9400222222222222222222', null)] }), []);
  assert.deepEqual(packetLabelMismatches({ ...order, labels: [evidence('label:5', null, 'Smith')] }), []);
  assert.deepEqual(packetLabelMismatches({ buyerNames: ['Jane'], trackingNumbers: [], labels: [evidence('label:6', null, 'John Smith')] }), []);
  assert.deepEqual(packetLabelMismatches({ ...order, labels: [evidence('label:7', null, null)] }), []);
});

test('packet: mismatches read the ingestion ship-to and every box; the primary shipment stands in when no box list is given', () => {
  const held = label({ id: 8, state: 'APPLIED', documentId: 5, trackingNumber: '9400222222222222222222' });
  const packet = buildOrderPacket(
    source({
      labels: [held],
      labelShipTo: [{ ingestionId: 8, name: 'John Smith' }],
      trackingNumbers: ['9400222222222222222222', '9400111111111111111111'],
    }),
    [],
  );
  assert.deepEqual(packet.labelMismatches.map((m) => [m.labelKey, m.kind]), [['label:8', 'ship_to']]);

  const primaryOnly = buildOrderPacket(source({ labels: [held], shipment: { trackingNumber: '9400111111111111111111', carrier: 'USPS' } }), []);
  assert.deepEqual(primaryOnly.labelMismatches.map((m) => [m.labelKey, m.kind]), [['label:8', 'tracking']]);
});

test('packet lines carry their listing on the order\'s platform', () => {
  const ebay = buildOrderPacket(source({ orderRef: '19-15205-47811', accountSource: 'ebay purchasing', lines: [line(10, { itemNumber: '226611849000' })] }), []);
  assert.deepEqual(ebay.lines[0]!.listing, { href: 'https://www.ebay.com/itm/226611849000', source: 'built', storefront: 'ebay', missing: null });

  const ecwid = buildOrderPacket(
    source({
      orderRef: '5067',
      accountSource: 'usav',
      platformSlug: 'ecwid',
      lines: [line(10, { sku: '01241', skuCatalogId: null, storedListings: [{ platform: 'ecwid', itemId: null, url: 'https://usavshop.com/01241-p1.html' }] })],
    }),
    [],
  );
  assert.equal(ecwid.lines[0]!.listing.href, 'https://usavshop.com/01241-p1.html');
  assert.equal(ecwid.lines[0]!.listing.source, 'stored');

  const bare = buildOrderPacket(source({ orderRef: '5067', accountSource: 'ecwid', lines: [line(10, { sku: '01241' })] }), []);
  assert.equal(bare.lines[0]!.listing.href, null);
  assert.match(bare.lines[0]!.listing.missing ?? '', /Ecwid/);
});

test('queue: rows under every filter, sorted and paged; each facet counted under every OTHER filter', () => {
  const packets = [
    buildOrderPacket(source({ orderId: 1, orderRef: 'A1', accountSource: 'eBay', shipByAt: '2026-10-09T00:00:00.000Z' }), []),
    buildOrderPacket(source({ orderId: 2, orderRef: 'A2', accountSource: 'Ecwid', pickup: true, docsNotRequired: true }), []),
    buildOrderPacket(source({ orderId: 3, orderRef: 'A3', accountSource: 'eBay', shipByAt: '2026-10-07T00:00:00.000Z', documents: [slip(1)] }), []),
  ];
  assert.deepEqual(packets.map((packet) => packet.status), ['missing', 'ready', 'missing']);

  const all = orderPacketQueue(packets, orderPacketQuerySchema.parse({}));
  assert.deepEqual(all.rows.map((row) => row.orderId), [3, 1, 2]);
  assert.deepEqual(all.counts, { all: 3, missing: 2, ready: 1, printed: 0 });
  assert.deepEqual(all.gapCounts, { label: 2, slip: 1, paperwork: 2 });
  assert.deepEqual(all.channelCounts, { eBay: 2, Ecwid: 1 });

  const cut = orderPacketQueue(packets, orderPacketQuerySchema.parse({ status: 'missing', gap: ['slip'], channel: ['eBay'], limit: 1 }));
  assert.deepEqual(cut.rows.map((row) => row.orderId), [1]);
  assert.equal(cut.total, 1);
  // Status counted under gap=slip + channel=eBay; gaps under status + channel; channels under status + gap.
  assert.deepEqual(cut.counts, { all: 1, missing: 1, ready: 0, printed: 0 });
  assert.deepEqual(cut.gapCounts, { label: 2, slip: 1, paperwork: 2 });
  assert.deepEqual(cut.channelCounts, { eBay: 1 });

  const paged = orderPacketQueue(packets, orderPacketQuerySchema.parse({ sort: 'order', offset: 1, limit: 1 }));
  assert.deepEqual(paged.rows.map((row) => row.orderId), [2]);
  assert.equal(paged.total, 3);
});

test('URL params: multi facets as comma lists or repeated; unknown values refused, the page URL\'s own params ignored', () => {
  const parsed = parseOrderPacketSearchParams(new URLSearchParams('status=missing&gap=label,slip&gap=slip&channel=eBay&channel=Ecwid&q=%20100618%20&limit=50'));
  assert.ok(parsed.success);
  assert.deepEqual(parsed.data, { status: 'missing', gap: ['label', 'slip'], channel: ['eBay', 'Ecwid'], sort: 'priority', q: '100618', limit: 50, offset: 0 });
  assert.equal(parseOrderPacketSearchParams(new URLSearchParams('gap=box')).success, false);
  assert.ok(parseOrderPacketSearchParams(new URLSearchParams('view=orders')).success);
});

test('params: org first, Find escaped for ILIKE, last 8 digits for an order or tracking number', () => {
  assert.deepEqual(orderPacketsParams(ORG, {}), [ORG, null, null, null]);
  assert.deepEqual(orderPacketsParams(ORG, { q: '50%_off' }), [ORG, '%50\\%\\_off%', null, null]);
  assert.deepEqual(orderPacketsParams(ORG, { q: '12-34567-89012' }), [ORG, '%12-34567-89012%', '56789012', null]);
  assert.deepEqual(orderPacketsParams(ORG, { ids: [7, 9] }), [ORG, null, null, [7, 9]]);
});

test('tenant isolation: every table the Orders statement reads is predicated on the org ($1)', () => {
  const sql = ORDER_PACKETS_SQL.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
  const ctes = new Set([...sql.matchAll(/(?:WITH|,)\s*(\w+) AS \(/g)].map((m) => m[1]));
  const reads = [...sql.matchAll(/(?<!DISTINCT )\b(?:FROM|JOIN)\s+(\w+)(?:\s+(?!ON\b|WHERE\b|JOIN\b|LEFT\b|CROSS\b|GROUP\b|ORDER\b)(\w+))?/g)]
    .filter((m) => !ctes.has(m[1]) && !/^(LATERAL|unnest|pk_\w+)$/i.test(m[1]));
  const tables = new Set(reads.map((m) => m[1]));
  for (const table of ['orders', 'label_ingestions', 'documents', 'document_entity_links', 'product_manuals', 'sku_catalog', 'label_print_events', 'paperwork_print_events', 'document_print_jobs', 'shipping_tracking_numbers', 'customers']) {
    assert.ok(tables.has(table), `expected the Orders statement to read ${table}`);
  }
  for (const [, table, alias] of reads) {
    assert.ok(alias, `${table} is read without an alias, so its org predicate cannot be checked`);
    assert.match(sql, new RegExp(`\\b${alias}\\.organization_id = (\\$1\\b|\\w+\\.organization_id)`), `${table} ${alias} is not predicated on organization_id`);
  }
  assert.doesNotMatch(sql, /\$\{/);
  // Four binds (org, Find LIKE, Find last-8, named order rows) — none past them.
  assert.doesNotMatch(sql, /\$5\b/);
});
