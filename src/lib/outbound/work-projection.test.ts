import assert from 'node:assert/strict';
import test from 'node:test';
import { listOutboundWork } from './work-projection';
import {
  OUTBOUND_SAVED_VIEWS,
  buildOutboundWorkComponents,
  outboundWorkPageSchema,
  outboundWorkQuerySchema,
} from './work-contract';
import { readFileSync } from 'node:fs';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
/**
 * The fixture derives `material` from the row it describes rather than
 * carrying an independent copy: a fixture that can contradict the server rule
 * it stands in for stops being evidence (the lesson from the aged at-risk
 * deadlines in V1.1).
 */
const row = (overrides: Record<string, unknown> = {}) => {
  const merged = {
    id: 875, order_reference: '00875', account_source: 'AMAZON', product_title: 'Soundbar', sku: 'TECH-00875', item_number: '114455667788', paired: true, zoho_item_title: null, catalog_product_title: null, thumbnail_url: null, condition: 'USED', quantity: '1', sale_amount: '149.00', is_urgent: true, is_out_of_stock: false, ship_by: '2026-09-18T14:30:00.000Z', warehouse_stage: 'PACKED', view_ids: ['all', 'at-risk', 'ship-now'], shipment_id: 8, tracking_number: '1Z999AA10123456784', carrier: 'UPS', tracking_category: 'LABEL_CREATED', label_ingestion_id: 9, label_state: 'MATCHED', document_count: 1, updated_at: '2026-09-18T13:00:00.000Z', created_at: '2026-09-18T12:00:00.000Z',
    acknowledged_at: null, acknowledged_by: null, acknowledged_by_name: null, fulfillment_route: null, stock_ready: 2, stock_received: 1,
    live_label_live: true, live_label_document_id: null, live_label_source: 'shipstation_api', live_label_tracking: '1Z999AA10123456784', live_label_carrier: 'UPS', live_label_shipstation_label_id: 'se-123', live_label_shipment_id: 8,
    ...overrides,
  } as Record<string, unknown>;
  return {
    ...merged,
    material: merged.material ?? {
      orderId: String(merged.id),
      stage: merged.warehouse_stage,
      labelState: merged.label_state ?? 'NONE',
      labelIngestionId: merged.label_ingestion_id == null ? null : String(merged.label_ingestion_id),
      labelRowVersion: merged.label_ingestion_id == null ? null : 3,
      shipmentId: merged.shipment_id == null ? null : String(merged.shipment_id),
      units: `${merged.id}/41:PACKED:PACKED`,
      orderSet: String(merged.id),
    },
  };
};

test('work projection is explicitly tenant-scoped and never reads marketplace order status', async () => {
  let tenant = ''; let sql = ''; let values: readonly unknown[] = [];
  const result = await listOutboundWork(ORG_A, { limit: 1 }, { query: async (organizationId, text, args) => { tenant = organizationId; sql = text; values = args; return { rows: [row(), row({ id: 876, created_at: '2026-09-18T11:00:00.000Z' })] as never[] }; } });
  assert.equal(tenant, ORG_A);
  assert.equal(values[0], ORG_A);
  assert.match(sql, /WHERE o\.organization_id = \$1/);
  assert.match(sql, /stn\.organization_id = o\.organization_id/);
  assert.equal(/o\.status\b/.test(sql), false);
  assert.equal(result.items[0]?.warehouseStage, 'PACKED');
  // Every display join added for Triage reaches a tenant-owned table; each
  // must be scoped to the order's own org, never the SKU string alone.
  for (const scoped of [/\bsc\.organization_id = o\.organization_id/, /\bi\.organization_id = o\.organization_id/, /\bsu\.organization_id = o\.organization_id/, /lbl_stn\.organization_id = o\.organization_id/, /JOIN orders o ON o\.id = page\.id AND o\.organization_id = \$1/]) {
    assert.match(sql, scoped);
  }
  assert.deepEqual(result.items[0]?.allowedActions, ['APPLY_LABEL']);
  assert.ok(result.nextCursor);
});

test('projection cannot be steered by a query organization id and rejects malformed cursors', async () => {
  assert.equal(outboundWorkQuerySchema.safeParse({ organizationId: ORG_B }).success, false);
  await assert.rejects(() => listOutboundWork(ORG_A, { cursor: 'not-a-cursor' }, { query: async () => ({ rows: [] }) }), /Invalid outbound work cursor/);
});

test('operational search remains tenant-scoped and parameterized', async () => {
  let values: readonly unknown[] = []; let sql = '';
  await listOutboundWork(ORG_A, { query: 'TECH-00875' }, { query: async (_organizationId, text, args) => { sql = text; values = args; return { rows: [row()] as never[] }; } });
  assert.equal(values[0], ORG_A);
  assert.equal(values[5], 'TECH-00875');
  assert.match(sql, /o\.organization_id = \$1/);
  assert.match(sql, /o\.sku ILIKE/);
  assert.equal(outboundWorkQuerySchema.safeParse({ query: 'x'.repeat(121) }).success, false);
});

test('out-of-stock state wins over every downstream lifecycle state', async () => {
  const result = await listOutboundWork(ORG_A, {}, { query: async () => ({ rows: [row({ is_out_of_stock: true, warehouse_stage: 'OUT_OF_STOCK', label_state: 'APPLIED' })] as never[] }) });
  assert.equal(result.items[0]?.warehouseStage, 'OUT_OF_STOCK');
  assert.deepEqual(result.items[0]?.allowedActions, []);
});

test('what the projection returns is exactly what the published contract promises', async () => {
  const page = await listOutboundWork(ORG_A, {}, { query: async () => ({ rows: [row(), row({ id: 876, label_ingestion_id: null, tracking_number: null, ship_by: null, account_source: null, sku: null })] as never[] }) });
  // The server's own output must satisfy the schema the clients are handed;
  // .strict() means an undocumented field fails here rather than shipping.
  outboundWorkPageSchema.parse(page);

  const published = JSON.parse(readFileSync('docs/openapi/cycleforge-v1.json', 'utf8'));
  assert.deepEqual(published.components.schemas.OutboundWorkItem, buildOutboundWorkComponents().OutboundWorkItem);
  assert.deepEqual(
    published.paths['/api/v1/outbound/work'].get.responses['200'].content['application/json'].schema,
    { $ref: '#/components/schemas/OutboundWorkPage' },
  );
  // Every projected field is documented: no silent gap between them.
  assert.deepEqual(
    Object.keys(published.components.schemas.OutboundWorkItem.properties).sort(),
    Object.keys(page.items[0]).sort(),
  );
  // The page envelope is documented too: `view`/`views` cannot be added to the
  // response and forgotten in the published contract.
  assert.deepEqual(
    Object.keys(published.components.schemas.OutboundWorkPage.properties).sort(),
    Object.keys(page).sort(),
  );
});

test('the requested saved view is a bound parameter and every catalog view has a server rule', async () => {
  let sql = ''; let values: readonly unknown[] = [];
  await listOutboundWork(ORG_A, { view: 'exceptions' }, { query: async (_organizationId, text, args) => { sql = text; values = args; return { rows: [] }; } });
  assert.equal(values[7], 'exceptions');
  assert.equal(values[6], 51, 'limit must stay bound to $7 while the view binds to $8');
  assert.match(sql, /AND \$8::text = ANY \(membership\.view_ids\)/);
  // A view in the catalog without a membership rule would silently return the
  // whole queue, so the rule has to exist in the SQL that computes view_ids.
  for (const view of OUTBOUND_SAVED_VIEWS) assert.match(sql, new RegExp(`'${view.id}'`), `${view.id} has no server membership rule`);
  assert.equal(outboundWorkQuerySchema.parse({}).view, 'all');
  assert.equal(outboundWorkQuerySchema.safeParse({ view: 'urgent' }).success, false);
});

test('an exact order id narrows the read through a bound parameter, and its absence binds null', async () => {
  const capture = async (query: Parameters<typeof listOutboundWork>[1]) => {
    let sql = ''; let values: readonly unknown[] = [];
    await listOutboundWork(ORG_A, query, { query: async (_organizationId, text, args) => { sql = text; values = args; return { rows: [] }; } });
    return { sql, values };
  };
  const narrowed = await capture({ id: 7 });
  assert.equal(narrowed.values[8], 7);
  assert.match(narrowed.sql, /o\.id = \$9/);
  assert.equal((await capture({})).values[8], null, 'no id must leave the whole queue readable');
  assert.equal(outboundWorkQuerySchema.safeParse({ id: 0 }).success, false);
});

test('membership travels with the record and an unrecognized view fails closed', async () => {
  const page = await listOutboundWork(ORG_A, {}, { query: async () => ({ rows: [row({ view_ids: ['all', 'pending'] })] as never[] }) });
  assert.deepEqual(page.items[0]?.views, ['all', 'pending']);
  assert.equal(page.view, 'all');
  assert.deepEqual(page.views.map((view) => view.id), OUTBOUND_SAVED_VIEWS.map((view) => view.id));
  for (const broken of [['all', 'invented'], ['ready'], []]) {
    await assert.rejects(
      () => listOutboundWork(ORG_A, {}, { query: async () => ({ rows: [row({ view_ids: broken })] as never[] }) }),
      /unknown saved-view membership/,
    );
  }
});

test('the server names the next permitted action and only authorizes the existing command', async () => {
  const actionFor = async (overrides: Record<string, unknown>) => {
    const page = await listOutboundWork(ORG_A, {}, { query: async () => ({ rows: [row(overrides)] as never[] }) });
    return page.items[0]?.nextAction;
  };
  assert.deepEqual(await actionFor({}), { kind: 'APPLY_LABEL', label: 'Apply label', command: 'APPLY_LABEL' });
  assert.deepEqual(await actionFor({ view_ids: ['all', 'exceptions'], is_out_of_stock: true, warehouse_stage: 'OUT_OF_STOCK' }),
    { kind: 'RESOLVE_EXCEPTION', label: 'Resolve exception', command: null });
  assert.deepEqual(await actionFor({ view_ids: ['all', 'completed'], warehouse_stage: 'SCANNED_OUT' }),
    { kind: 'VIEW_RECEIPT', label: 'View receipt', command: null });
  assert.deepEqual(await actionFor({ view_ids: ['all', 'ready'], warehouse_stage: 'READY', label_state: 'NONE' }),
    { kind: 'START_PICK', label: 'Start pick', command: null });
  assert.deepEqual(await actionFor({ view_ids: ['all', 'pending'], warehouse_stage: 'PICKED', label_state: 'NONE' }),
    { kind: 'CONTINUE_FULFILLMENT', label: 'Continue fulfillment', command: null });
  // A quarantined label is an exception even while the stage looks shippable.
  assert.equal((await actionFor({ view_ids: ['all', 'exceptions'], label_state: 'QUARANTINED' }))?.command, null);
});

test('allowedActions and nextAction.command can never disagree about a permitted command', async () => {
  // Two published fields, one fact. Every stage/label combination the
  // projection can emit is checked, so a change to one field that forgets the
  // other fails here instead of shipping two authorities to the clients.
  const stages = ['READY', 'PICKED', 'PACKED', 'LABELED', 'SCANNED_OUT', 'OUT_OF_STOCK'] as const;
  const states = ['NONE', 'MATCHED', 'APPLIED', 'QUARANTINED', 'FAILED'] as const;
  const rows = stages.flatMap((warehouse_stage) => states.map((label_state) => row({
    warehouse_stage, label_state, is_out_of_stock: warehouse_stage === 'OUT_OF_STOCK',
    view_ids: ['all'],
  })));
  const page = await listOutboundWork(ORG_A, { limit: rows.length }, { query: async () => ({ rows: rows as never[] }) });
  assert.equal(page.items.length, rows.length);
  for (const item of page.items) {
    assert.equal(item.nextAction.command !== null, item.allowedActions.includes('APPLY_LABEL'),
      `${item.warehouseStage}/${item.label.state} disagrees about APPLY_LABEL`);
    if (item.nextAction.command) assert.equal(item.nextAction.kind, 'APPLY_LABEL');
  }
});

test('the row revision follows unit progress, not only the order row', async () => {
  // A unit moving PICKED -> PACKED is the change the queue exists to reveal,
  // so the projected revision must move with it. `orders` has no updated_at;
  // the SQL derives this from the order's own timestamps and its units.
  let sql = '';
  await listOutboundWork(ORG_A, {}, { query: async (_organizationId, text) => { sql = text; return { rows: [row()] as never[] }; } });
  assert.equal(/\bo\.updated_at\b/.test(sql), false, 'orders has no updated_at column; selecting it fails with 42703');
  assert.match(sql, /MAX\(su\.updated_at\) AS last_unit_update/);
  assert.match(sql, /GREATEST\(o\.created_at[\s\S]*unit_progress\.last_unit_update\) AS updated_at/);
});

test('the fingerprint moves with material state and ignores the display revision', async () => {
  // §2.3 needs a token that changes exactly when the decision would change.
  // A timestamp cannot do that job (V1.1 said so in writing), so these are the
  // two properties that make the fingerprint usable instead: state-sensitive,
  // and clock-insensitive.
  const fingerprintOf = async (overrides: Record<string, unknown>) => {
    const page = await listOutboundWork(ORG_A, {}, { query: async () => ({ rows: [row(overrides)] as never[] }) });
    return page.items[0]?.fingerprint ?? '';
  };
  const base = await fingerprintOf({});
  assert.match(base, /^[0-9a-f]{64}$/);
  assert.equal(await fingerprintOf({}), base, 'an unchanged record must keep its fingerprint');
  assert.equal(
    await fingerprintOf({ updated_at: '2026-09-19T23:59:00.000Z' }),
    base,
    'the display revision is not material state and must not disturb the token',
  );
  // The material set the digest covers is the LOGICAL ORDER SET: apply
  // requires every active allocation of every sibling row to be PACKED, so a
  // sibling's unit moving, or a sibling appearing at all, must invalidate the
  // token — otherwise two operators command two siblings and the second apply
  // fails mid-command with ALLOCATION_NOT_PACKED.
  const material = (changes: Record<string, unknown>) => ({
    material: {
      orderId: '875', stage: 'PACKED', labelState: 'MATCHED', labelIngestionId: '9', labelRowVersion: 3,
      shipmentId: '8', units: '875/41:PACKED:PACKED', orderSet: '875', ...changes,
    },
  });
  for (const changed of [
    { warehouse_stage: 'LABELED' },
    { label_state: 'APPLIED' },
    { label_ingestion_id: 10 },
    { shipment_id: 9 },
    material({ labelRowVersion: 4 }),
    material({ units: '875/42:PACKED:PACKED' }),
    material({ units: '875/41:PACKED:PACKED,876/42:PACKED:PACKED' }),
    material({ units: '875/41:PACKED:PACKED,876/42:PACKED:PICKED' }),
    material({ orderSet: '875,876' }),
  ]) {
    assert.notEqual(await fingerprintOf(changed), base, `${JSON.stringify(changed)} must change the fingerprint`);
  }
  await assert.rejects(
    () => listOutboundWork(ORG_A, {}, { query: async () => ({ rows: [row({ material: { orderId: '875' } })] as never[] }) }),
    /unreadable material state/,
    'a material state the contract cannot read must fail closed, never publish a guessed token',
  );
});

test('the published view catalog clients read is generated from this contract', () => {
  const artifact = JSON.parse(readFileSync('docs/contracts/outbound-views.v1.json', 'utf8'));
  assert.deepEqual(artifact, { version: '1.0', views: OUTBOUND_SAVED_VIEWS });
});

test('triage facts: the Zoho item governs the title, acknowledgment and the live label travel with the record', async () => {
  const itemFor = async (overrides: Record<string, unknown>) => {
    const page = await listOutboundWork(ORG_A, { view: 'triage' }, { query: async () => ({ rows: [row({ view_ids: ['all', 'triage'], ...overrides })] as never[] }) });
    outboundWorkPageSchema.parse(page);
    return page.items[0]!;
  };
  // One SKU, one title: the Zoho item name beats the catalog and the marketplace listing title.
  const zoho = await itemFor({ zoho_item_title: 'Bose Wave Music System', catalog_product_title: 'Bose SoundDock remote', thumbnail_url: '/api/zoho/items/42/image' });
  assert.equal(zoho.product.title, 'Bose Wave Music System');
  assert.deepEqual(zoho.product.thumbnail, { alt: 'Bose Wave Music System', url: '/api/zoho/items/42/image', version: null });
  assert.equal((await itemFor({ catalog_product_title: 'Catalog title' })).product.title, 'Catalog title');
  assert.equal((await itemFor({})).product.title, 'Soundbar');
  assert.equal((await itemFor({})).product.paired, true);
  assert.equal((await itemFor({ paired: false })).product.paired, false, 'an unpaired order is listed in triage and says so');

  const acked = await itemFor({ acknowledged_at: '2026-09-23T15:00:00.000Z', acknowledged_by: 7, acknowledged_by_name: 'Ana', fulfillment_route: 'QC' });
  assert.deepEqual(acked.acknowledgment, { at: '2026-09-23T15:00:00.000Z', by: 7, byName: 'Ana', route: 'QC' });
  assert.deepEqual(acked.stock, { ready: 2, received: 1 });
  assert.deepEqual(acked.shippingLabel, { live: true, documentId: null, source: 'shipstation_api', tracking: '1Z999AA10123456784', carrier: 'UPS', shipstationLabelId: 'se-123' });

  const bare = await itemFor({ live_label_live: false, live_label_source: null, live_label_tracking: null, live_label_carrier: null, live_label_shipstation_label_id: null, live_label_shipment_id: null });
  assert.equal(bare.shippingLabel.live, false);
  await assert.rejects(() => itemFor({ fulfillment_route: 'SHIP' }), /unknown fulfillment route/);
});
