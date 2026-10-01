import assert from 'node:assert/strict';
import test from 'node:test';
import type { QueryResultRow } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { decodeStationFeedCursor, encodeStationFeedCursor } from './cursor';
import {
  compareStationFeedItems,
  mapMobileScanRow,
  mapOpsEventRow,
  mapStationActivityRow,
  mergeStationFeedItems,
  type MobileScanFeedRow,
  type OpsEventFeedRow,
  type StationActivityFeedRow,
} from './event-map';
import { parseStationFeedQuery, queryStationLiveFeed, StationFeedInputError } from './query.server';
import type { StationFeedItem } from './types';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

function activity(overrides: Partial<StationActivityFeedRow> = {}): StationActivityFeedRow {
  return {
    id: 9,
    created_at: '2026-09-30T18:00:00.000Z',
    station: 'TECH',
    activity_type: 'QC_RESULT_RECORDED',
    staff_id: 3,
    staff_name: 'Ada',
    avatar_photo_id: 33,
    shipment_id: null,
    scan_ref: null,
    fnsku: null,
    notes: null,
    metadata: {
      origin: 'phone',
      surface: '/m/u/41/qc',
      serial_unit_id: 41,
      serial_number: 'SN-41',
      passed: false,
    },
    order_row_id: null,
    order_id: null,
    order_status: null,
    order_sku: null,
    catalog_product_title: null,
    zoho_item_title: null,
    order_product_title: null,
    catalog_image_url: null,
    listing_cover_photo_id: null,
    zoho_item_id: null,
    zoho_image_document_id: null,
    ...overrides,
  };
}

function mobile(overrides: Partial<MobileScanFeedRow> = {}): MobileScanFeedRow {
  return {
    id: 10,
    created_at: '2026-09-30T18:00:00.000Z',
    staff_id: 3,
    staff_name: 'Ada',
    avatar_photo_id: 33,
    raw_value: 'ORDER-10',
    normalized: 'ORDER-10',
    kind: 'order',
    match_outcome: 'single',
    routed_to: '/m/orders/ORDER-10',
    matched_order_id: 'ORDER-10',
    order_row_id: 10,
    order_id: 'ORDER-10',
    order_status: 'picked',
    order_sku: 'SKU-10',
    catalog_product_title: 'Catalog title',
    zoho_item_title: 'Zoho title',
    order_product_title: 'Order title',
    catalog_image_url: '/catalog.jpg',
    listing_cover_photo_id: null,
    zoho_item_id: null,
    zoho_image_document_id: null,
    ...overrides,
  };
}

function opsEvent(overrides: Partial<OpsEventFeedRow> = {}): OpsEventFeedRow {
  return {
    id: 12,
    occurred_at: '2026-09-30T18:00:00.000Z',
    event_type: 'UNBOX_CONFIRMED',
    entity_type: 'receiving',
    entity_id: 77,
    actor_staff_id: 3,
    staff_name: 'Ada',
    avatar_photo_id: 33,
    workflow_node_id: 'unbox-node',
    payload: {
      origin: 'phone',
      surface: '/m/r/77',
      receiving_id: 77,
      subject_identifier: '1Z77',
    },
    ...overrides,
  };
}

test('activity mapping makes a failed phone QC commit a canonical needs-attention unit row', () => {
  const row = mapStationActivityRow(activity());
  assert.ok(row);
  assert.equal(row.id, 'sal:9');
  assert.equal(row.job, 'quality_control');
  assert.equal(row.outcome, 'needs_attention');
  assert.equal(row.actor.name, 'Ada');
  assert.equal(row.context.surface, '/m/u/41/qc');
  assert.deepEqual(row.subject, {
    entityType: 'unit',
    id: '41',
    title: 'SN-41',
    identifier: 'SN-41',
    imageUrl: null,
    status: null,
    href: '/search?sel=unit%3A41',
  });
});

test('ops-event mapping projects a phone unbox through the unified event spine', () => {
  const row = mapOpsEventRow(opsEvent());
  assert.ok(row);
  assert.equal(row.id, 'ops:12');
  assert.equal(row.job, 'unbox');
  assert.equal(row.context.workflowNodeId, 'unbox-node');
  assert.equal(row.subject.href, '/search?sel=receiving:77');
  assert.equal(row.subject.identifier, '1Z77');
});

test('resolver mapping obeys catalog-first identity and reports unresolved scans honestly', () => {
  const identified = mapMobileScanRow(mobile());
  assert.ok(identified);
  assert.equal(identified.outcome, 'identified');
  assert.equal(identified.subject.title, 'Catalog title');
  assert.equal(identified.subject.href, '/shipping/orders?openOrderId=10');

  const unresolved = mapMobileScanRow(mobile({ id: 11, match_outcome: 'none', order_row_id: null, order_id: null }));
  assert.ok(unresolved);
  assert.equal(unresolved.outcome, 'needs_attention');
  assert.equal(unresolved.subject.entityType, 'scan');
});

test('committed shipment metadata still resolves catalog identity and the canonical order link', () => {
  const packed = mapStationActivityRow(activity({
    activity_type: 'PACK_COMPLETED',
    metadata: { origin: 'phone', subject_entity_type: 'shipment', subject_id: '77', subject_title: 'Shipment 77' },
    shipment_id: 77,
    order_row_id: 10,
    order_id: 'ORDER-10',
    order_sku: 'SKU-10',
    catalog_product_title: 'Catalog title',
    catalog_image_url: '/catalog.jpg',
  }));
  assert.ok(packed);
  assert.equal(packed.subject.title, 'Catalog title');
  assert.equal(packed.subject.imageUrl, '/catalog.jpg');
  assert.equal(packed.subject.href, '/shipping/orders?openOrderId=10');
});

test('same-instant order is SAL, ops event, then MSE, with numeric source id as the final key', () => {
  const sal = mapStationActivityRow(activity({ id: 9, activity_type: 'ARRIVAL_SCANNED', metadata: { origin: 'phone', receiving_id: 4 } }))!;
  const ops = mapOpsEventRow(opsEvent({ id: 12 }))!;
  const mse10 = mapMobileScanRow(mobile({ id: 10 }))!;
  const mse11 = mapMobileScanRow(mobile({ id: 11 }))!;
  assert.deepEqual([mse10, ops, mse11, sal].sort((a, b) => compareStationFeedItems(a, b, 'newest')).map((row) => row.id), [
    'sal:9',
    'ops:12',
    'mse:11',
    'mse:10',
  ]);
});

test('cursor round-trips source rank, id, timestamp, and sort', () => {
  const item = mapMobileScanRow(mobile())!;
  const encoded = encodeStationFeedCursor(item, 'oldest');
  assert.deepEqual(decodeStationFeedCursor(encoded), {
    occurredAt: item.occurredAt,
    sourceRank: 2,
    sourceId: 10,
    sort: 'oldest',
  });
  assert.equal(decodeStationFeedCursor('not-a-cursor'), null);
});

test('realtime merge deduplicates namespaced ids without collapsing different sources', () => {
  const sal = mapStationActivityRow(activity({ id: 10, activity_type: 'PACK_COMPLETED', metadata: { origin: 'phone' } }))!;
  const mse = mapMobileScanRow(mobile({ id: 10 }))!;
  const changed = { ...sal, message: 'new projection' } satisfies StationFeedItem;
  const merged = mergeStationFeedItems([sal, mse], [changed], 'newest');
  assert.equal(merged.length, 2);
  assert.equal(merged.find((row) => row.id === 'sal:10')?.message, 'new projection');
  assert.ok(merged.some((row) => row.id === 'mse:10'));
});

test('query parser accepts multi-value filters and rejects ambiguous cursor catch-up', () => {
  const params = new URLSearchParams('limit=60&staff=2,3&job=arrival&job=pack&outcome=committed,needs_attention&from=2026-09-29&to=2026-09-30&sort=oldest');
  const parsed = parseStationFeedQuery(params);
  assert.deepEqual(parsed.staffIds, [2, 3]);
  assert.deepEqual(parsed.jobs, ['arrival', 'pack']);
  assert.deepEqual(parsed.outcomes, ['committed', 'needs_attention']);
  assert.equal(parsed.limit, 60);
  assert.equal(parsed.sort, 'oldest');
  assert.ok(parsed.from?.endsWith('T07:00:00.000Z'));
  assert.ok(parsed.to?.endsWith('T07:00:00.000Z'));

  assert.throws(
    () => parseStationFeedQuery(new URLSearchParams('limit=101')),
    StationFeedInputError,
  );
  const cursor = encodeStationFeedCursor(mapMobileScanRow(mobile())!, 'newest');
  assert.throws(
    () => parseStationFeedQuery(new URLSearchParams(`before=${cursor}&afterSalId=4`)),
    /cannot be combined/,
  );
});

test('tenant query merges capped sources, returns global watermarks, and emits an opaque next cursor', async () => {
  const calls: Array<{ orgId: OrgId; sql: string; params: readonly unknown[] }> = [];
  const deps = {
    run: async <T extends QueryResultRow>(orgId: OrgId, sql: string, params: readonly unknown[]): Promise<T[]> => {
      calls.push({ orgId, sql, params });
      if (sql.includes('AS sal_id')) return [{ sal_id: 91, ops_id: 71, mse_id: 81 }] as T[];
      if (sql.includes('FROM ops_events oe')) return [opsEvent({ id: 71, occurred_at: '2026-09-30T17:58:00.000Z' })] as T[];
      if (sql.includes('FROM mobile_scan_events')) return [mobile({ id: 81, created_at: '2026-09-30T17:59:00.000Z' })] as T[];
      return [activity({ id: 91, activity_type: 'ARRIVAL_SCANNED', metadata: { origin: 'phone', receiving_id: 91 } }), activity({ id: 90, activity_type: 'PACK_COMPLETED', metadata: { origin: 'phone' } })] as T[];
    },
  };
  const query = parseStationFeedQuery(new URLSearchParams('limit=2'));
  const response = await queryStationLiveFeed(ORG, query, deps);
  assert.deepEqual(response.items.map((row) => row.id), ['sal:91', 'sal:90']);
  assert.deepEqual(response.watermark, { stationActivityId: 91, opsEventId: 71, mobileScanEventId: 81 });
  assert.ok(response.nextBefore);
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.orgId === ORG && call.params[0] === ORG));
  const mseCall = calls.find((call) => call.sql.includes('FROM mobile_scan_events'));
  assert.match(mseCall?.sql ?? '', /committed_ops\.payload->>'mobile_scan_event_id'/);
});
