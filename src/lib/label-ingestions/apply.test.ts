import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PoolClient } from 'pg';
import {
  applyLabelIngestion,
  type ApplyLabelIngestionDependencies,
  type ApplyPhase,
} from './apply';
import { serverOrganizationId } from './types';

const ORG_A = serverOrganizationId('11111111-1111-4111-8111-111111111111');
const ORG_B = serverOrganizationId('22222222-2222-4222-8222-222222222222');

interface FakeIngestion {
  id: number;
  organization_id: string;
  client_event_id: string;
  state: string;
  row_version: number;
  match_method: string;
  detected_cycleforge_reference: string;
  matched_account_source: string;
  matched_marketplace_order_id: string;
  tracking_number_raw: string;
  tracking_number_normalized: string;
  carrier: string;
  staged_storage_provider: string;
  staged_object_key: string;
  mime_type: string;
  sha256: string;
  byte_size: number;
  file_basename: string;
  matched_order_id: number | null;
  shipment_id: number | null;
  document_id: number | null;
  actor_staff_id?: number | null;
  attempt_count?: number;
  applied_at?: string | null;
}

interface FakeState {
  staff: Array<{ id: number; organization_id: string }>;
  ingestions: FakeIngestion[];
  orders: Array<{
    id: number;
    organization_id: string;
    account_source: string;
    order_id: string;
    status: string;
    shipment_id: number | null;
  }>;
  allocations: Array<{
    id: number;
    organization_id: string;
    order_id: number;
    serial_unit_id: number;
    state: string;
  }>;
  units: Array<{ id: number; organization_id: string; current_status: string }>;
  shipments: Array<{
    id: number;
    organization_id: string;
    tracking_number_raw: string;
    tracking_number_normalized: string;
    carrier: string;
  }>;
  shipmentLinks: Array<{
    id: number;
    organization_id: string;
    owner_id: number;
    shipment_id: number;
    is_primary: boolean;
  }>;
  documents: Array<{ id: number; organization_id: string; document_data: unknown }>;
  documentLinks: Array<{
    organization_id: string;
    document_id: number;
    entity_type: string;
    entity_id: number;
    link_role: string;
  }>;
  ingestionOrders: Array<{
    organization_id: string;
    ingestion_id: number;
    order_id: number;
    ordinal: number;
  }>;
  inventoryEvents: Array<{
    id: number;
    organization_id: string;
    serial_unit_id: number;
    event_type: string;
    payload: Record<string, unknown>;
  }>;
  audits: Array<{ id: number; organization_id: string; entity_id: string }>;
  nextShipmentId: number;
  nextDocumentId: number;
  nextEventId: number;
  nextAuditId: number;
}

function seedState(): FakeState {
  return {
    staff: [{ id: 7, organization_id: ORG_A }],
    ingestions: [{
      id: 41,
      organization_id: ORG_A,
      client_event_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      state: 'MATCHED',
      row_version: 3,
      match_method: 'MARKETPLACE_ORDER_ID',
      detected_cycleforge_reference: 'CF-9001',
      matched_account_source: 'EBAY_MAIN',
      matched_marketplace_order_id: 'MARKET-9001',
      tracking_number_raw: '1Z999AA10123456784',
      tracking_number_normalized: '1Z999AA10123456784',
      carrier: 'UPS',
      staged_storage_provider: 'gcs',
      staged_object_key: 'labels/org-a/sha.pdf',
      mime_type: 'application/pdf',
      sha256: 'a'.repeat(64),
      byte_size: 2048,
      file_basename: 'label.pdf',
      matched_order_id: null,
      shipment_id: null,
      document_id: null,
      attempt_count: 0,
      applied_at: null,
    }],
    orders: [
      {
        id: 101,
        organization_id: ORG_A,
        account_source: 'EBAY_MAIN',
        order_id: 'MARKET-9001',
        status: 'AWAITING_SHIPMENT',
        shipment_id: null,
      },
      {
        id: 102,
        organization_id: ORG_A,
        account_source: 'EBAY_MAIN',
        order_id: 'MARKET-9001',
        status: 'AWAITING_SHIPMENT',
        shipment_id: null,
      },
    ],
    allocations: [
      { id: 301, organization_id: ORG_A, order_id: 101, serial_unit_id: 501, state: 'PACKED' },
      { id: 302, organization_id: ORG_A, order_id: 102, serial_unit_id: 502, state: 'PACKED' },
    ],
    units: [
      { id: 501, organization_id: ORG_A, current_status: 'PACKED' },
      { id: 502, organization_id: ORG_A, current_status: 'PACKED' },
    ],
    shipments: [],
    shipmentLinks: [],
    documents: [],
    documentLinks: [],
    ingestionOrders: [],
    inventoryEvents: [],
    audits: [],
    nextShipmentId: 801,
    nextDocumentId: 901,
    nextEventId: 1001,
    nextAuditId: 1101,
  };
}

function normalizedSql(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

class FakeClient {
  constructor(
    readonly state: FakeState,
    private readonly queryLog: string[],
    private readonly harness: FakeHarness,
  ) {}

  async query(text: string, params: readonly unknown[] = []): Promise<{ rows: any[]; rowCount: number }> {
    const sql = normalizedSql(text);
    this.queryLog.push(sql);

    if (/FROM label_ingestions .*FOR UPDATE$/i.test(sql)) {
      const [orgId, ingestionId] = params as [string, number];
      const rows = this.state.ingestions.filter((row) => row.organization_id === orgId && row.id === ingestionId);
      return { rows: structuredClone(rows), rowCount: rows.length };
    }
    if (/FROM label_ingestion_orders .*ORDER BY ordinal/i.test(sql)) {
      const [orgId, ingestionId] = params as [string, number];
      const rows = this.state.ingestionOrders
        .filter((row) => row.organization_id === orgId && row.ingestion_id === ingestionId)
        .sort((a, b) => a.ordinal - b.ordinal)
        .map((row) => ({ order_id: row.order_id, ordinal: row.ordinal }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM inventory_events/i.test(sql)) {
      const [orgId, ingestionId] = params as [string, string];
      const rows = this.state.inventoryEvents
        .filter((row) => row.organization_id === orgId && String(row.payload.label_ingestion_id) === ingestionId)
        .sort((a, b) => a.serial_unit_id - b.serial_unit_id)
        .map((row) => ({ id: row.id, serial_unit_id: row.serial_unit_id }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM staff/i.test(sql)) {
      const [orgId, staffId] = params as [string, number];
      const rows = this.state.staff.filter((row) => row.organization_id === orgId && row.id === staffId);
      return { rows, rowCount: rows.length };
    }
    if (/FROM orders .*account_source.*FOR UPDATE$/i.test(sql)) {
      if (this.harness.remainingLockFailures > 0) {
        this.harness.remainingLockFailures -= 1;
        throw Object.assign(new Error('simulated lock conflict'), { code: '55P03' });
      }
      const [orgId, accountSource, orderId] = params as [string, string, string];
      const rows = this.state.orders
        .filter((row) => row.organization_id === orgId && row.account_source === accountSource && row.order_id === orderId)
        .sort((a, b) => a.id - b.id)
        .map((row) => ({ id: row.id, status: row.status, shipment_id: row.shipment_id }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM order_unit_allocations/i.test(sql)) {
      const [orgId, orderIds] = params as [string, number[]];
      const rows = this.state.allocations
        .filter((row) => row.organization_id === orgId && orderIds.includes(row.order_id) && !['RELEASED', 'RETURNED'].includes(row.state))
        .sort((a, b) => a.id - b.id);
      return { rows: structuredClone(rows), rowCount: rows.length };
    }
    if (/FROM serial_units/i.test(sql)) {
      const [orgId, unitIds] = params as [string, number[]];
      const rows = this.state.units
        .filter((row) => row.organization_id === orgId && unitIds.includes(row.id))
        .sort((a, b) => a.id - b.id)
        .map((row) => ({ id: row.id, current_status: row.current_status }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM shipment_links .*owner_id = ANY/i.test(sql) && /FOR UPDATE$/i.test(sql)) {
      const [orgId, orderIds] = params as [string, number[]];
      const rows = this.state.shipmentLinks
        .filter((row) => row.organization_id === orgId && orderIds.includes(row.owner_id))
        .sort((a, b) => a.id - b.id)
        .map((row) => ({ id: row.id, shipment_id: row.shipment_id }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM shipping_tracking_numbers .*id = ANY/i.test(sql)) {
      const [orgId, ids] = params as [string, number[]];
      const rows = this.state.shipments
        .filter((row) => row.organization_id === orgId && ids.includes(row.id))
        .sort((a, b) => a.id - b.id)
        .map((row) => ({ id: row.id, tracking_number_normalized: row.tracking_number_normalized }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM shipping_tracking_numbers .*tracking_number_normalized/i.test(sql)) {
      const [orgId, tracking] = params as [string, string];
      const rows = this.state.shipments
        .filter((row) => row.organization_id === orgId && row.tracking_number_normalized === tracking)
        .map((row) => ({ id: row.id }));
      return { rows, rowCount: rows.length };
    }
    if (/FROM shipment_links .*NOT \(owner_id = ANY/i.test(sql)) {
      const [orgId, shipmentId, orderIds] = params as [string, number, number[]];
      const rows = this.state.shipmentLinks.filter(
        (row) => row.organization_id === orgId && row.shipment_id === shipmentId && !orderIds.includes(row.owner_id),
      );
      return { rows, rowCount: rows.length };
    }
    if (/FROM orders .*NOT \(id = ANY/i.test(sql)) {
      const [orgId, shipmentId, orderIds] = params as [string, number, number[]];
      const rows = this.state.orders.filter(
        (row) => row.organization_id === orgId && row.shipment_id === shipmentId && !orderIds.includes(row.id),
      );
      return { rows, rowCount: rows.length };
    }
    if (/INSERT INTO shipping_tracking_numbers/i.test(sql)) {
      const [raw, normalized, carrier, orgId] = params as [string, string, string, string];
      if (this.state.shipments.some((row) => row.tracking_number_normalized === normalized)) {
        throw Object.assign(new Error('duplicate tracking'), { code: '23505' });
      }
      const row = {
        id: this.state.nextShipmentId++,
        organization_id: orgId,
        tracking_number_raw: raw,
        tracking_number_normalized: normalized,
        carrier,
      };
      this.state.shipments.push(row);
      return { rows: [{ id: row.id }], rowCount: 1 };
    }
    if (/UPDATE orders SET shipment_id/i.test(sql)) {
      const [shipmentId, orgId, orderIds] = params as [number, string, number[]];
      const rows = this.state.orders.filter((row) => row.organization_id === orgId && orderIds.includes(row.id));
      rows.forEach((row) => { row.shipment_id = shipmentId; });
      return { rows: [], rowCount: rows.length };
    }
    if (/INSERT INTO documents/i.test(sql)) {
      const [orgId, , data] = params as [string, number, string];
      const row = { id: this.state.nextDocumentId++, organization_id: orgId, document_data: JSON.parse(data) };
      this.state.documents.push(row);
      return { rows: [{ id: row.id }], rowCount: 1 };
    }
    if (/INSERT INTO label_ingestion_orders/i.test(sql)) {
      const [orgId, ingestionId, orderId, ordinal] = params as [string, number, number, number];
      this.state.ingestionOrders.push({ organization_id: orgId, ingestion_id: ingestionId, order_id: orderId, ordinal });
      return { rows: [], rowCount: 1 };
    }
    if (/INSERT INTO audit_logs/i.test(sql)) {
      const [, orgId, entityId] = params as [number, string, string];
      const row = { id: this.state.nextAuditId++, organization_id: orgId, entity_id: entityId };
      this.state.audits.push(row);
      return { rows: [{ id: row.id }], rowCount: 1 };
    }
    if (/UPDATE label_ingestions/i.test(sql)) {
      const [orgId, ingestionId, actorId, orderId, shipmentId, documentId, expectedVersion] = params as [
        string, number, number, number, number, number, number,
      ];
      const row = this.state.ingestions.find(
        (candidate) => candidate.organization_id === orgId
          && candidate.id === ingestionId
          && candidate.state === 'MATCHED'
          && candidate.row_version === expectedVersion,
      );
      if (!row) return { rows: [], rowCount: 0 };
      row.state = 'APPLIED';
      row.actor_staff_id = actorId;
      row.matched_order_id = orderId;
      row.shipment_id = shipmentId;
      row.document_id = documentId;
      row.row_version += 1;
      row.attempt_count = (row.attempt_count ?? 0) + 1;
      row.applied_at = new Date(0).toISOString();
      return { rows: [{ row_version: row.row_version }], rowCount: 1 };
    }

    throw new Error(`Unhandled fake SQL: ${sql}`);
  }
}

class FakeHarness {
  readonly queryLog: string[] = [];
  transactionAttempts = 0;
  remainingLockFailures = 0;

  constructor(readonly state: FakeState) {}

  dependencies(afterPhase?: (phase: ApplyPhase) => void): Partial<ApplyLabelIngestionDependencies> {
    return {
      runTenantTransaction: async <T>(_orgId: string, fn: (client: Pick<PoolClient, 'query'>) => Promise<T>) => {
        this.transactionAttempts += 1;
        const working = structuredClone(this.state);
        const client = new FakeClient(working, this.queryLog, this);
        const result = await fn(client as unknown as Pick<PoolClient, 'query'>);
        Object.assign(this.state, working);
        return result;
      },
      linkShipment: async (orgId, input, client) => {
        const working = (client as unknown as FakeClient).state;
        const existing = working.shipmentLinks.find(
          (row) => row.organization_id === orgId
            && row.owner_id === input.ownerId
            && row.shipment_id === input.shipmentId,
        );
        for (const row of working.shipmentLinks) {
          if (row.organization_id === orgId && row.owner_id === input.ownerId) row.is_primary = false;
        }
        if (existing) {
          existing.is_primary = true;
          return { id: existing.id, box_seq: 1, is_primary: true };
        }
        const row = {
          id: working.shipmentLinks.length + 1,
          organization_id: orgId,
          owner_id: input.ownerId,
          shipment_id: input.shipmentId,
          is_primary: true,
        };
        working.shipmentLinks.push(row);
        return { id: row.id, box_seq: 1, is_primary: true };
      },
      createDocumentLink: async (orgId, input, client) => {
        const working = (client as unknown as FakeClient).state;
        working.documentLinks.push({
          organization_id: orgId,
          document_id: input.documentId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          link_role: input.linkRole ?? 'primary',
        });
        return {};
      },
      transitionUnit: async (input, client, orgId) => {
        const working = (client as unknown as FakeClient).state;
        const unit = working.units.find((row) => row.organization_id === orgId && row.id === input.unitId);
        if (!unit || unit.current_status !== input.expectedFrom) {
          return { ok: false, status: 409, error: 'transition conflict', from: unit?.current_status as any };
        }
        const from = unit.current_status;
        unit.current_status = input.to;
        const event = {
          id: working.nextEventId++,
          organization_id: orgId,
          serial_unit_id: input.unitId,
          event_type: input.eventType,
          payload: input.payload ?? {},
        };
        working.inventoryEvents.push(event);
        return { ok: true, eventId: event.id, from: from as any, to: input.to };
      },
      afterPhase: afterPhase ? async (phase) => afterPhase(phase) : undefined,
      waitBeforeLockRetry: async () => {},
    };
  }
}

const applyInput = {
  organizationId: ORG_A,
  ingestionId: 41,
  actorStaffId: 7,
  expectedRowVersion: 3,
};

describe('applyLabelIngestion', () => {
  test('atomically applies every row/unit without mutating marketplace order status', async () => {
    const state = seedState();
    const harness = new FakeHarness(state);
    const result = await applyLabelIngestion(applyInput, harness.dependencies());

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.replayed, false);
    assert.deepEqual(result.orderIds, [101, 102]);
    assert.deepEqual(result.serialUnitIds, [501, 502]);
    assert.equal(state.ingestions[0].state, 'APPLIED');
    assert.deepEqual(state.units.map((row) => row.current_status), ['LABELED', 'LABELED']);
    assert.deepEqual(state.orders.map((row) => row.status), ['AWAITING_SHIPMENT', 'AWAITING_SHIPMENT']);
    assert.equal(state.shipments.length, 1);
    assert.equal(state.documents.length, 1);
    assert.equal(state.audits.length, 1);
    assert.deepEqual(state.ingestionOrders.map((row) => row.order_id), [101, 102]);

    const orderLock = harness.queryLog.findIndex((sql) => /FROM orders .*account_source.*FOR UPDATE$/.test(sql));
    const allocationLock = harness.queryLog.findIndex((sql) => /FROM order_unit_allocations/.test(sql));
    const unitLock = harness.queryLog.findIndex((sql) => /FROM serial_units/.test(sql));
    assert.ok(orderLock >= 0 && allocationLock > orderLock && unitLock > allocationLock);
  });

  test('replays an already-applied ingestion without duplicate mutations', async () => {
    const state = seedState();
    const harness = new FakeHarness(state);
    const first = await applyLabelIngestion(applyInput, harness.dependencies());
    const counts = {
      shipments: state.shipments.length,
      documents: state.documents.length,
      events: state.inventoryEvents.length,
      audits: state.audits.length,
    };
    const second = await applyLabelIngestion(applyInput, harness.dependencies());

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.replayed, true);
    assert.deepEqual(
      {
        shipments: state.shipments.length,
        documents: state.documents.length,
        events: state.inventoryEvents.length,
        audits: state.audits.length,
      },
      counts,
    );
  });

  for (const failurePhase of [
    'ATTACHED_TRACKING',
    'PERSISTED_DOCUMENT',
    'TRANSITIONED_UNITS',
    'APPENDED_AUDIT',
    'FINALIZED_INGESTION',
  ] satisfies ApplyPhase[]) {
    test(`rolls back the complete transaction after ${failurePhase}`, async () => {
      const state = seedState();
      const before = structuredClone(state);
      const harness = new FakeHarness(state);

      await assert.rejects(
        applyLabelIngestion(
          applyInput,
          harness.dependencies((phase) => {
            if (phase === failurePhase) throw new Error(`injected failure at ${failurePhase}`);
          }),
        ),
        new RegExp(`injected failure at ${failurePhase}`),
      );
      assert.deepEqual(state, before);
    });
  }

  test('retries a transient lock conflict with a fresh tenant transaction', async () => {
    const state = seedState();
    const harness = new FakeHarness(state);
    harness.remainingLockFailures = 1;

    const result = await applyLabelIngestion(applyInput, harness.dependencies());
    assert.equal(result.ok, true);
    assert.equal(harness.transactionAttempts, 2);
  });

  test('returns the same not-found shape for a cross-tenant ingestion id', async () => {
    const state = seedState();
    const before = structuredClone(state);
    const harness = new FakeHarness(state);

    const result = await applyLabelIngestion(
      { ...applyInput, organizationId: ORG_B },
      harness.dependencies(),
    );
    assert.deepEqual(result, {
      ok: false,
      code: 'INGESTION_NOT_FOUND',
      ingestionId: 41,
      message: 'Label ingestion was not found',
    });
    assert.deepEqual(state, before);
  });

  test('rejects a stale row version before locking or mutating the logical order', async () => {
    const state = seedState();
    const before = structuredClone(state);
    const harness = new FakeHarness(state);

    const result = await applyLabelIngestion(
      { ...applyInput, expectedRowVersion: 2 },
      harness.dependencies(),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'STALE_ROW_VERSION');
    assert.deepEqual(state, before);
    assert.equal(harness.queryLog.some((sql) => /FROM orders/.test(sql)), false);
  });

  test('rejects a logical order with no active allocations', async () => {
    const state = seedState();
    state.allocations = [];
    const before = structuredClone(state);
    const harness = new FakeHarness(state);

    const result = await applyLabelIngestion(applyInput, harness.dependencies());
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'NO_ACTIVE_ALLOCATIONS');
    assert.deepEqual(state, before);
  });

  test('rejects any allocated unit whose starting state is not PACKED', async () => {
    const state = seedState();
    state.units[1].current_status = 'INSPECTED';
    const before = structuredClone(state);
    const harness = new FakeHarness(state);

    const result = await applyLabelIngestion(applyInput, harness.dependencies());
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'SERIAL_UNIT_NOT_PACKED');
    assert.deepEqual(state, before);
  });

  test('rejects an existing different package under the V1 single-package rule', async () => {
    const state = seedState();
    state.shipments.push({
      id: 800,
      organization_id: ORG_A,
      tracking_number_raw: '9400111899223856928499',
      tracking_number_normalized: '9400111899223856928499',
      carrier: 'USPS',
    });
    state.orders[0].shipment_id = 800;
    const before = structuredClone(state);
    const harness = new FakeHarness(state);

    const result = await applyLabelIngestion(applyInput, harness.dependencies());
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, 'MULTI_PACKAGE_CONFLICT');
    assert.deepEqual(state, before);
  });
});
