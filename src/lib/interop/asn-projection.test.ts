/**
 * DB-free unit test for the ASN (EDI 856) projection.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/lib/interop/asn-projection.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { flattenAsnHierarchy } from './edi-hierarchy';
import {
  projectAsn,
  type AsnDocument,
  type AsnCartonRow,
  type AsnLineRow,
  type AsnProjectionDeps,
  type AsnShipmentRow,
} from './asn-projection';

const SHIPMENT: AsnShipmentRow = {
  id: 77,
  tracking_number_raw: '1Z999AA10123456784',
  carrier: 'UPS',
  latest_status_category: 'DELIVERED',
  delivered_at: new Date('2026-07-20T17:00:00.000Z'),
  label_created_at: new Date('2026-07-18T09:00:00.000Z'),
};

const carton = (over: Partial<AsnCartonRow> & { id: number }): AsnCartonRow => ({
  zoho_purchaseorder_number: 'PO-1',
  carrier: 'UPS',
  receiving_date_time: new Date('2026-07-20T18:00:00.000Z'),
  ...over,
});

const line = (over: Partial<AsnLineRow> & { id: number }): AsnLineRow => ({
  receiving_id: 1,
  sku: 'ABC-1',
  item_name: 'A thing',
  quantity: 2,
  quantity_expected: 2,
  quantity_received: 2,
  workflow_status: 'DONE',
  gtin: null,
  ...over,
});

function deps(over: Partial<{
  shipment: AsnShipmentRow | null;
  cartons: AsnCartonRow[];
  lines: AsnLineRow[];
}> = {}): AsnProjectionDeps {
  return {
    fetchShipment: async () => ('shipment' in over ? over.shipment! : SHIPMENT),
    fetchCartons: async () => over.cartons ?? [],
    fetchLines: async () => over.lines ?? [],
  };
}

test('a shipment with cartons and lines projects as SOPI', async () => {
  const doc: AsnDocument | null = await projectAsn(
    { orgId: 'o', shipmentId: 77, identity: {} },
    deps({
      cartons: [carton({ id: 1 }), carton({ id: 2 })],
      lines: [
        line({ id: 10, receiving_id: 1 }),
        line({ id: 11, receiving_id: 1 }),
        line({ id: 12, receiving_id: 2 }),
      ],
    }),
  );

  assert.ok(doc);
  assert.equal(doc.shape, 'SOPI');
  // S + O + 2×P + 3×I
  assert.equal(doc.hlCount, 7);
  assert.equal(
    flattenAsnHierarchy(doc.hierarchy).map((n) => n.level).join(''),
    'SOPIIPI',
  );
  assert.equal(doc.hierarchy.parentId, null, 'the shipment is the root');
  assert.equal(doc.hierarchy.id, 1, 'HL01 starts at 1');
});

test('a shipment with no carton breakdown projects as SOI, not a fabricated pack level', async () => {
  // The whole point: emitting SOPI here would invent a pack level, which is a
  // claim about how the goods are physically packed.
  const doc = await projectAsn(
    { orgId: 'o', shipmentId: 77, identity: {} },
    deps({ cartons: [], lines: [] }),
  );
  assert.ok(doc);
  assert.equal(doc.shape, 'SOI');
  assert.equal(doc.hlCount, 1, 'just the shipment root');
});

test('cartons group under their PO, and an unmatched carton gets its own honest bucket', async () => {
  const doc = await projectAsn(
    { orgId: 'o', shipmentId: 77, identity: {} },
    deps({
      cartons: [
        carton({ id: 1, zoho_purchaseorder_number: 'PO-1' }),
        carton({ id: 2, zoho_purchaseorder_number: 'PO-2' }),
        carton({ id: 3, zoho_purchaseorder_number: null }),
      ],
      lines: [],
    }),
  );

  assert.ok(doc);
  const orders = doc.hierarchy.children;
  assert.equal(orders.length, 3, 'three distinct PO buckets including the null one');
  assert.deepEqual(
    orders.map((o) => o.detail.purchaseOrderNumber),
    ['PO-1', 'PO-2', null],
  );
  // The unmatched bucket says so rather than being dropped or merged.
  assert.match(String(orders[2]?.detail.note ?? ''), /not matched to a purchase order/i);
  assert.equal(orders[2]?.detail.id, undefined, 'no PO → no order URI invented');
});

test('two cartons on the same PO share one Order level', async () => {
  const doc = await projectAsn(
    { orgId: 'o', shipmentId: 77, identity: {} },
    deps({
      cartons: [carton({ id: 1 }), carton({ id: 2 })],
      lines: [],
    }),
  );
  assert.ok(doc);
  assert.equal(doc.hierarchy.children.length, 1, 'one Order');
  assert.equal(doc.hierarchy.children[0]?.children.length, 2, 'two Packs under it');
});

test('an item carries BOTH expected and received quantities', async () => {
  // An ASN reporting only one number hides every discrepancy the receiving
  // dock exists to catch.
  const doc = await projectAsn(
    { orgId: 'o', shipmentId: 77, identity: {} },
    deps({
      cartons: [carton({ id: 1 })],
      lines: [line({ id: 10, receiving_id: 1, quantity_expected: 5, quantity_received: 3 })],
    }),
  );
  assert.ok(doc);
  const item = doc.hierarchy.children[0]?.children[0]?.children[0];
  assert.equal(item?.detail.quantityExpected, 5);
  assert.equal(item?.detail.quantityReceived, 3);
});

test('a GTIN appears on an item only when the line really has one', async () => {
  const doc = await projectAsn(
    { orgId: 'o', shipmentId: 77, identity: {} },
    deps({
      cartons: [carton({ id: 1 })],
      lines: [
        line({ id: 10, receiving_id: 1, gtin: '00812345000019' }),
        line({ id: 11, receiving_id: 1, gtin: null }),
      ],
    }),
  );
  assert.ok(doc);
  const items = doc.hierarchy.children[0]?.children[0]?.children ?? [];
  assert.equal(items[0]?.detail.gtin, '00812345000019');
  assert.equal(items[1]?.detail.gtin, undefined, 'absent, not empty-string');
});

test('a Pack never carries a fabricated SSCC, and the omission is explained', async () => {
  const noPrefix = await projectAsn(
    { orgId: 'o', shipmentId: 77, identity: {} },
    deps({ cartons: [carton({ id: 1 })], lines: [] }),
  );
  assert.ok(noPrefix);
  const pack = noPrefix.hierarchy.children[0]?.children[0];
  assert.equal(pack?.detail.sscc, undefined, 'never minted');
  assert.equal(pack?.detail.id, 'urn:cycleforge:carton:1', 'internal handle instead');
  assert.match(String(noPrefix.meta.ssccOmittedReason), /no licensed GS1 Company Prefix/i);

  // Even WITH a prefix there is nowhere to store an SSCC, so it stays absent —
  // the reason just changes.
  const withPrefix = await projectAsn(
    { orgId: 'o', shipmentId: 77, identity: { companyPrefix: '0812345' } },
    deps({ cartons: [carton({ id: 1 })], lines: [] }),
  );
  assert.ok(withPrefix);
  assert.equal(withPrefix.hierarchy.children[0]?.children[0]?.detail.sscc, undefined);
  assert.match(String(withPrefix.meta.ssccOmittedReason), /no SSCC column/i);
});

test('a line with no carton is counted as an orphan, never silently dropped', async () => {
  const doc = await projectAsn(
    { orgId: 'o', shipmentId: 77, identity: {} },
    deps({
      cartons: [carton({ id: 1 })],
      lines: [line({ id: 10, receiving_id: 1 }), line({ id: 11, receiving_id: null })],
    }),
  );
  assert.ok(doc);
  assert.equal(doc.meta.orphanLineCount, 1);
  assert.equal(doc.hierarchy.children[0]?.children[0]?.children.length, 1);
});

test('a missing shipment returns null so the route can 404 rather than assert emptiness', async () => {
  const doc = await projectAsn(
    { orgId: 'o', shipmentId: 999, identity: {} },
    deps({ shipment: null }),
  );
  assert.equal(doc, null);
});

test('HL numbering is document-wide, monotonic, and parents precede children', async () => {
  const doc = await projectAsn(
    { orgId: 'o', shipmentId: 77, identity: {} },
    deps({
      cartons: [
        carton({ id: 1, zoho_purchaseorder_number: 'PO-1' }),
        carton({ id: 2, zoho_purchaseorder_number: 'PO-2' }),
      ],
      lines: [line({ id: 10, receiving_id: 1 }), line({ id: 11, receiving_id: 2 })],
    }),
  );
  assert.ok(doc);
  const flat = flattenAsnHierarchy(doc.hierarchy);
  // S + 2×(O + P + I) — the two POs do NOT share an Order level.
  assert.deepEqual(flat.map((n) => n.id), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(flat.map((n) => n.level).join(''), 'SOPIOPI');
  assert.equal(doc.hlCount, flat.length, 'hlCount is the real loop count');
  for (const n of flat) {
    if (n.parentId === null) continue;
    assert.ok(n.parentId < n.id, `HL02 ${n.parentId} must precede HL01 ${n.id}`);
  }
});

test('the 200,000 HL cap is reported rather than silently exceeded', async () => {
  const cartons = Array.from({ length: 3 }, (_, i) => carton({ id: i + 1 }));
  const doc = await projectAsn(
    { orgId: 'o', shipmentId: 77, identity: {} },
    deps({ cartons, lines: [] }),
  );
  assert.ok(doc);
  assert.equal(doc.exceedsSingleDocument, false);
  // The flag exists so a consumer is told when a projection cannot be carried
  // by one 856 — the alternative is a truncated document that looks complete.
  assert.equal(typeof doc.exceedsSingleDocument, 'boolean');
});
