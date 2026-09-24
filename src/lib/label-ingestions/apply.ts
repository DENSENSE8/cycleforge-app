import type { PoolClient } from 'pg';
import { createDocumentEntityLink } from '@/lib/documents/links';
import { transition, type TransitionInput, type TransitionResult } from '@/lib/inventory/state-machine';
import { detectCarrier, normalizeTrackingNumber } from '@/lib/shipping/normalize';
import { linkShipment, type LinkShipmentInput, type ShipmentLinkRow } from '@/lib/shipping/shipment-links';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type {
  ApplyConflictCode,
  ApplyLabelIngestionInput,
  ApplyLabelIngestionResult,
  AppliedLabelIngestionResult,
  LabelIngestionState,
  LabelMatchMethod,
} from './types';

type Tx = Pick<PoolClient, 'query'>;

export const APPLY_PHASES = [
  'LOCKED_INGESTION',
  'LOCKED_ORDERS',
  'LOCKED_ALLOCATIONS',
  'LOCKED_SERIAL_UNITS',
  'ATTACHED_TRACKING',
  'PERSISTED_DOCUMENT',
  'TRANSITIONED_UNITS',
  'APPENDED_AUDIT',
  'FINALIZED_INGESTION',
] as const;

export type ApplyPhase = (typeof APPLY_PHASES)[number];

interface IngestionRow {
  id: number | string;
  organization_id: string;
  client_event_id: string;
  state: LabelIngestionState;
  row_version: number | string;
  match_method: LabelMatchMethod | null;
  detected_cycleforge_reference: string | null;
  matched_account_source: string | null;
  matched_marketplace_order_id: string | null;
  tracking_number_raw: string | null;
  tracking_number_normalized: string | null;
  carrier: string | null;
  staged_storage_provider: string | null;
  staged_object_key: string | null;
  mime_type: string;
  sha256: string;
  byte_size: number | string;
  file_basename: string;
  matched_order_id: number | string | null;
  shipment_id: number | string | null;
  document_id: number | string | null;
}

interface OrderRow {
  id: number | string;
  status: string | null;
  shipment_id: number | string | null;
}

interface AllocationRow {
  id: number | string;
  order_id: number | string;
  serial_unit_id: number | string;
  state: string;
}

interface SerialUnitRow {
  id: number | string;
  current_status: string;
}

export interface ApplyLabelIngestionDependencies {
  runTenantTransaction<T>(orgId: OrgId, fn: (client: Tx) => Promise<T>): Promise<T>;
  transitionUnit(
    input: TransitionInput,
    client: Tx | undefined,
    orgId: OrgId,
  ): Promise<TransitionResult>;
  linkShipment(
    orgId: OrgId,
    input: LinkShipmentInput,
    client?: Tx,
  ): Promise<ShipmentLinkRow>;
  createDocumentLink(
    orgId: OrgId,
    input: {
      documentId: number;
      entityType: 'ORDER' | 'SHIPMENT';
      entityId: number;
      linkRole?: 'primary' | 'secondary';
    },
    client?: Tx,
  ): Promise<unknown>;
  /** Test seam only. Throwing here must roll the entire caller transaction back. */
  afterPhase?(phase: ApplyPhase, client: Tx): Promise<void> | void;
  waitBeforeLockRetry?(attempt: number): Promise<void>;
}

const defaultDependencies: ApplyLabelIngestionDependencies = {
  runTenantTransaction: withTenantTransaction,
  transitionUnit: transition,
  linkShipment,
  createDocumentLink: createDocumentEntityLink,
  waitBeforeLockRetry: async (attempt) => {
    await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** (attempt - 1)));
  },
};

class ApplyConflict extends Error {
  readonly code: ApplyConflictCode;
  readonly ingestionId: number;

  constructor(code: ApplyConflictCode, ingestionId: number, message: string) {
    super(message);
    this.name = 'ApplyConflict';
    this.code = code;
    this.ingestionId = ingestionId;
  }
}

function conflict(
  code: ApplyConflictCode,
  ingestionId: number,
  message: string,
): ApplyLabelIngestionResult {
  return { ok: false, code, ingestionId, message };
}

function asPositiveInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} is not a positive safe integer`);
  }
  return parsed;
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function phase(
  deps: ApplyLabelIngestionDependencies,
  name: ApplyPhase,
  client: Tx,
): Promise<void> {
  await deps.afterPhase?.(name, client);
}

async function replayApplied(
  client: Tx,
  orgId: OrgId,
  ingestion: IngestionRow,
): Promise<AppliedLabelIngestionResult> {
  const ingestionId = asPositiveInteger(ingestion.id, 'ingestion id');
  const shipmentId = asPositiveInteger(ingestion.shipment_id, 'shipment id');
  const documentId = asPositiveInteger(ingestion.document_id, 'document id');

  const [ordersResult, eventsResult] = await Promise.all([
    client.query<{ order_id: number | string }>(
      `SELECT order_id
         FROM label_ingestion_orders
        WHERE organization_id = $1
          AND ingestion_id = $2
        ORDER BY ordinal ASC, order_id ASC`,
      [orgId, ingestionId],
    ),
    client.query<{ id: number | string; serial_unit_id: number | string }>(
      `SELECT id, serial_unit_id
         FROM inventory_events
        WHERE organization_id = $1
          AND event_type = 'LABELED'
          AND payload->>'label_ingestion_id' = $2
        ORDER BY serial_unit_id ASC, id ASC`,
      [orgId, String(ingestionId)],
    ),
  ]);

  return {
    ok: true,
    replayed: true,
    ingestionId,
    orderIds: ordersResult.rows.map((row) => asPositiveInteger(row.order_id, 'order id')),
    serialUnitIds: eventsResult.rows.map((row) => asPositiveInteger(row.serial_unit_id, 'serial unit id')),
    inventoryEventIds: eventsResult.rows.map((row) => asPositiveInteger(row.id, 'inventory event id')),
    shipmentId,
    documentId,
    rowVersion: Number(ingestion.row_version),
  };
}

async function resolveOrCreateShipment(
  client: Tx,
  orgId: OrgId,
  ingestionId: number,
  ingestion: IngestionRow,
  orderRows: readonly OrderRow[],
  deps: ApplyLabelIngestionDependencies,
): Promise<number> {
  const orderIds = orderRows.map((row) => asPositiveInteger(row.id, 'order id'));
  const rawTracking = String(ingestion.tracking_number_raw ?? '').trim();
  const persistedNormalized = String(ingestion.tracking_number_normalized ?? '').trim();
  const recomputedNormalized = normalizeTrackingNumber(rawTracking);
  if (!rawTracking || !recomputedNormalized || recomputedNormalized !== persistedNormalized) {
    throw new ApplyConflict(
      'EXACT_IDENTITY_INCOMPLETE',
      ingestionId,
      'Persisted tracking evidence is incomplete or not canonically normalized',
    );
  }

  const linkRows = await client.query<{ id: number | string; shipment_id: number | string }>(
    `SELECT id, shipment_id
       FROM shipment_links
      WHERE organization_id = $1
        AND owner_type = 'ORDER'
        AND owner_id = ANY($2::int[])
      ORDER BY id ASC
      FOR UPDATE`,
    [orgId, orderIds],
  );

  const currentShipmentIds = new Set<number>();
  for (const row of orderRows) {
    if (row.shipment_id != null) currentShipmentIds.add(asPositiveInteger(row.shipment_id, 'shipment id'));
  }
  for (const row of linkRows.rows) {
    currentShipmentIds.add(asPositiveInteger(row.shipment_id, 'shipment id'));
  }

  let shipmentId: number | null = null;
  if (currentShipmentIds.size > 0) {
    const ids = [...currentShipmentIds].sort((a, b) => a - b);
    const currentShipments = await client.query<{
      id: number | string;
      tracking_number_normalized: string;
    }>(
      `SELECT id, tracking_number_normalized
         FROM shipping_tracking_numbers
        WHERE organization_id = $1
          AND id = ANY($2::bigint[])
        ORDER BY id ASC
        FOR UPDATE`,
      [orgId, ids],
    );
    if (currentShipments.rows.length !== ids.length) {
      throw new ApplyConflict(
        'TRACKING_TENANT_CONFLICT',
        ingestionId,
        'An existing shipment is not visible in this organization',
      );
    }
    if (
      currentShipments.rows.length !== 1
      || currentShipments.rows[0].tracking_number_normalized !== persistedNormalized
    ) {
      throw new ApplyConflict(
        'MULTI_PACKAGE_CONFLICT',
        ingestionId,
        'V1 cannot auto-apply a label to an order that already has a different or additional package',
      );
    }
    shipmentId = asPositiveInteger(currentShipments.rows[0].id, 'shipment id');
  }

  if (shipmentId == null) {
    const existing = await client.query<{ id: number | string }>(
      `SELECT id
         FROM shipping_tracking_numbers
        WHERE organization_id = $1
          AND tracking_number_normalized = $2
        ORDER BY id ASC
        FOR UPDATE`,
      [orgId, persistedNormalized],
    );
    if (existing.rows.length > 1) {
      throw new Error('shipping_tracking_numbers canonical uniqueness is violated');
    }
    shipmentId = existing.rows[0] ? asPositiveInteger(existing.rows[0].id, 'shipment id') : null;
  }

  if (shipmentId != null) {
    const [otherLinks, otherPrimaryOrders] = await Promise.all([
      client.query(
        `SELECT owner_id
           FROM shipment_links
          WHERE organization_id = $1
            AND owner_type = 'ORDER'
            AND shipment_id = $2
            AND NOT (owner_id = ANY($3::int[]))
          ORDER BY owner_id ASC`,
        [orgId, shipmentId, orderIds],
      ),
      client.query(
        `SELECT id
           FROM orders
          WHERE organization_id = $1
            AND shipment_id = $2
            AND NOT (id = ANY($3::int[]))
          ORDER BY id ASC`,
        [orgId, shipmentId, orderIds],
      ),
    ]);
    if ((otherLinks.rowCount ?? 0) > 0 || (otherPrimaryOrders.rowCount ?? 0) > 0) {
      throw new ApplyConflict(
        'TRACKING_OWNED_BY_OTHER_ORDER',
        ingestionId,
        'Tracking is already attached to another logical order',
      );
    }
  }

  if (shipmentId == null) {
    const detectedCarrier = ingestion.carrier?.trim() || detectCarrier(persistedNormalized) || 'UNKNOWN';
    try {
      const inserted = await client.query<{ id: number | string }>(
        `INSERT INTO shipping_tracking_numbers (
           tracking_number_raw,
           tracking_number_normalized,
           carrier,
           source_system,
           organization_id
         )
         VALUES ($1, $2, $3, 'LABEL_INGESTION', $4)
         RETURNING id`,
        [rawTracking, persistedNormalized, detectedCarrier, orgId],
      );
      shipmentId = asPositiveInteger(inserted.rows[0]?.id, 'shipment id');
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
      if (code === '23505') {
        throw new ApplyConflict(
          'TRACKING_TENANT_CONFLICT',
          ingestionId,
          'Tracking cannot be claimed by this organization',
        );
      }
      throw error;
    }
  }

  for (const orderId of orderIds) {
    await deps.linkShipment(
      orgId,
      {
        ownerType: 'ORDER',
        ownerId: orderId,
        shipmentId,
        direction: 'OUTBOUND',
        isPrimary: true,
        role: 'ORDER_PRIMARY',
        source: 'label-ingestion',
      },
      client,
    );
  }

  await client.query(
    `UPDATE orders
        SET shipment_id = $1
      WHERE organization_id = $2
        AND id = ANY($3::int[])`,
    [shipmentId, orgId, orderIds],
  );

  return shipmentId;
}

async function persistDocument(
  client: Tx,
  orgId: OrgId,
  ingestionId: number,
  ingestion: IngestionRow,
  orderIds: readonly number[],
  shipmentId: number,
  deps: ApplyLabelIngestionDependencies,
): Promise<number> {
  const representativeOrderId = orderIds[0];
  const documentData = {
    storageProvider: ingestion.staged_storage_provider,
    objectKey: ingestion.staged_object_key,
    mimeType: ingestion.mime_type,
    sha256: ingestion.sha256,
    byteSize: Number(ingestion.byte_size),
    fileBasename: ingestion.file_basename,
    labelIngestionId: ingestionId,
    source: 'label_ingestion',
  };
  const inserted = await client.query<{ id: number | string }>(
    `INSERT INTO documents (
       organization_id,
       entity_type,
       entity_id,
       document_type,
       document_data
     )
     VALUES ($1, 'ORDER', $2, 'shipping_label', $3::jsonb)
     RETURNING id`,
    [orgId, representativeOrderId, JSON.stringify(documentData)],
  );
  const documentId = asPositiveInteger(inserted.rows[0]?.id, 'document id');

  await deps.createDocumentLink(
    orgId,
    { documentId, entityType: 'SHIPMENT', entityId: shipmentId, linkRole: 'primary' },
    client,
  );
  for (const orderId of orderIds) {
    await deps.createDocumentLink(
      orgId,
      { documentId, entityType: 'ORDER', entityId: orderId, linkRole: 'secondary' },
      client,
    );
  }
  return documentId;
}

async function runApply(
  client: Tx,
  input: ApplyLabelIngestionInput,
  deps: ApplyLabelIngestionDependencies,
): Promise<ApplyLabelIngestionResult> {
  const orgId = input.organizationId;
  const ingestionId = asPositiveInteger(input.ingestionId, 'ingestion id');
  const actorStaffId = asPositiveInteger(input.actorStaffId, 'actor staff id');

  const ingestionResult = await client.query<IngestionRow>(
    `SELECT id,
            organization_id,
            client_event_id,
            state,
            row_version,
            match_method,
            detected_cycleforge_reference,
            matched_account_source,
            matched_marketplace_order_id,
            tracking_number_raw,
            tracking_number_normalized,
            carrier,
            staged_storage_provider,
            staged_object_key,
            mime_type,
            sha256,
            byte_size,
            file_basename,
            matched_order_id,
            shipment_id,
            document_id
       FROM label_ingestions
      WHERE organization_id = $1
        AND id = $2
      FOR UPDATE`,
    [orgId, ingestionId],
  );
  const ingestion = ingestionResult.rows[0];
  if (!ingestion) {
    return conflict('INGESTION_NOT_FOUND', ingestionId, 'Label ingestion was not found');
  }
  await phase(deps, 'LOCKED_INGESTION', client);

  if (ingestion.state === 'APPLIED') {
    return replayApplied(client, orgId, ingestion);
  }
  if (Number(ingestion.row_version) !== input.expectedRowVersion) {
    return conflict('STALE_ROW_VERSION', ingestionId, 'Label ingestion changed before apply');
  }
  if (ingestion.state !== 'MATCHED') {
    return conflict('INGESTION_NOT_MATCHED', ingestionId, 'Only a matched ingestion can be applied');
  }
  if (
    !ingestion.match_method
    || !ingestion.matched_account_source
    || !ingestion.matched_marketplace_order_id
    || !ingestion.tracking_number_raw
    || !ingestion.tracking_number_normalized
    || !ingestion.staged_storage_provider
    || !ingestion.staged_object_key
  ) {
    return conflict('EXACT_IDENTITY_INCOMPLETE', ingestionId, 'Exact match evidence is incomplete');
  }

  const actor = await client.query(
    `SELECT id
       FROM staff
      WHERE organization_id = $1
        AND id = $2`,
    [orgId, actorStaffId],
  );
  if ((actor.rowCount ?? 0) !== 1) {
    return conflict('ACTOR_NOT_FOUND', ingestionId, 'Applying staff actor was not found');
  }

  // First lock class: every row in the complete logical marketplace order.
  const ordersResult = await client.query<OrderRow>(
    `SELECT id, status, shipment_id
       FROM orders
      WHERE organization_id = $1
        AND account_source = $2
        AND order_id = $3
      ORDER BY id ASC
      FOR UPDATE`,
    [orgId, ingestion.matched_account_source, ingestion.matched_marketplace_order_id],
  );
  if (ordersResult.rows.length === 0) {
    return conflict('ORDER_NOT_FOUND', ingestionId, 'Exact logical order was not found');
  }
  const orderIds = ordersResult.rows.map((row) => asPositiveInteger(row.id, 'order id'));
  await phase(deps, 'LOCKED_ORDERS', client);

  const persistedOrderSet = await client.query<{ order_id: number | string; ordinal: number | string }>(
    `SELECT order_id, ordinal
       FROM label_ingestion_orders
      WHERE organization_id = $1
        AND ingestion_id = $2
      ORDER BY ordinal ASC, order_id ASC`,
    [orgId, ingestionId],
  );
  if (persistedOrderSet.rows.length > 0) {
    const persistedIds = persistedOrderSet.rows.map((row) => asPositiveInteger(row.order_id, 'order id'));
    const ordinalsAreStable = persistedOrderSet.rows.every((row, index) => Number(row.ordinal) === index);
    if (!sameNumbers(persistedIds, orderIds) || !ordinalsAreStable) {
      return conflict('ORDER_SET_CHANGED', ingestionId, 'Persisted logical-order rows no longer match');
    }
  }

  // Second lock class: all active allocations, in primary-key order.
  const allocationsResult = await client.query<AllocationRow>(
    `SELECT id, order_id, serial_unit_id, state
       FROM order_unit_allocations
      WHERE organization_id = $1
        AND order_id = ANY($2::int[])
        AND state NOT IN ('RELEASED', 'RETURNED')
      ORDER BY id ASC
      FOR UPDATE`,
    [orgId, orderIds],
  );
  if (allocationsResult.rows.length === 0) {
    return conflict('NO_ACTIVE_ALLOCATIONS', ingestionId, 'Logical order has no active unit allocations');
  }
  if (allocationsResult.rows.some((row) => row.state !== 'PACKED')) {
    return conflict('ALLOCATION_NOT_PACKED', ingestionId, 'Every active allocation must be PACKED');
  }
  await phase(deps, 'LOCKED_ALLOCATIONS', client);

  const serialUnitIds = [...new Set(
    allocationsResult.rows.map((row) => asPositiveInteger(row.serial_unit_id, 'serial unit id')),
  )].sort((a, b) => a - b);
  if (serialUnitIds.length !== allocationsResult.rows.length) {
    throw new Error('An active serial unit is allocated more than once in the logical order');
  }

  // Third lock class: serial units, in primary-key order.
  const serialUnitsResult = await client.query<SerialUnitRow>(
    `SELECT id, current_status::text AS current_status
       FROM serial_units
      WHERE organization_id = $1
        AND id = ANY($2::int[])
      ORDER BY id ASC
      FOR UPDATE`,
    [orgId, serialUnitIds],
  );
  if (serialUnitsResult.rows.length !== serialUnitIds.length) {
    return conflict('SERIAL_UNIT_NOT_FOUND', ingestionId, 'An allocated serial unit was not found');
  }
  if (serialUnitsResult.rows.some((row) => row.current_status !== 'PACKED')) {
    return conflict('SERIAL_UNIT_NOT_PACKED', ingestionId, 'Every allocated serial unit must be PACKED');
  }
  await phase(deps, 'LOCKED_SERIAL_UNITS', client);

  const shipmentId = await resolveOrCreateShipment(
    client,
    orgId,
    ingestionId,
    ingestion,
    ordersResult.rows,
    deps,
  );
  await phase(deps, 'ATTACHED_TRACKING', client);

  const documentId = await persistDocument(
    client,
    orgId,
    ingestionId,
    ingestion,
    orderIds,
    shipmentId,
    deps,
  );
  await phase(deps, 'PERSISTED_DOCUMENT', client);

  if (persistedOrderSet.rows.length === 0) {
    for (const [ordinal, orderId] of orderIds.entries()) {
      await client.query(
        `INSERT INTO label_ingestion_orders (
           organization_id,
           ingestion_id,
           order_id,
           ordinal,
           link_role
         )
         VALUES ($1, $2, $3, $4, 'MATCHED_LINE')`,
        [orgId, ingestionId, orderId, ordinal],
      );
    }
  }

  const inventoryEventIds: number[] = [];
  for (const unitId of serialUnitIds) {
    const transitioned = await deps.transitionUnit(
      {
        unitId,
        to: 'LABELED',
        eventType: 'LABELED',
        actorStaffId,
        clientEventId: `label-ingestion:${ingestion.client_event_id}:${unitId}`,
        expectedFrom: 'PACKED',
        notes: 'Shipping label attached by V1 label ingestion',
        payload: {
          label_ingestion_id: ingestionId,
          label_sha256: ingestion.sha256,
          order_ids: orderIds,
          shipment_id: shipmentId,
          document_id: documentId,
        },
      },
      client,
      orgId,
    );
    if (!transitioned.ok) {
      throw new ApplyConflict('TRANSITION_CONFLICT', ingestionId, 'A serial-unit transition conflicted');
    }
    inventoryEventIds.push(transitioned.eventId);
  }
  await phase(deps, 'TRANSITIONED_UNITS', client);

  const audit = await client.query<{ id: number | string }>(
    `INSERT INTO audit_logs (
       actor_staff_id,
       organization_id,
       source,
       action,
       entity_type,
       entity_id,
       after_data,
       metadata
     )
     VALUES ($1, $2, 'label-ingestion', 'label_ingestion.applied',
             'label_ingestion', $3, $4::jsonb, $5::jsonb)
     RETURNING id`,
    [
      actorStaffId,
      orgId,
      String(ingestionId),
      JSON.stringify({ state: 'APPLIED', rowVersion: input.expectedRowVersion + 1 }),
      JSON.stringify({
        order_ids: orderIds,
        serial_unit_ids: serialUnitIds,
        shipment_id: shipmentId,
        document_id: documentId,
        sha256: ingestion.sha256,
      }),
    ],
  );
  if (!audit.rows[0]?.id) throw new Error('Label-ingestion audit append failed');
  await phase(deps, 'APPENDED_AUDIT', client);

  const finalized = await client.query<{ row_version: number | string }>(
    `UPDATE label_ingestions
        SET state = 'APPLIED',
            actor_staff_id = $3,
            matched_order_id = $4,
            shipment_id = $5,
            document_id = $6,
            attempt_count = attempt_count + 1,
            row_version = row_version + 1,
            error_code = NULL,
            error_detail = NULL,
            applied_at = now()
      WHERE organization_id = $1
        AND id = $2
        AND state = 'MATCHED'
        AND row_version = $7
      RETURNING row_version`,
    [
      orgId,
      ingestionId,
      actorStaffId,
      orderIds[0],
      shipmentId,
      documentId,
      input.expectedRowVersion,
    ],
  );
  if (finalized.rows.length !== 1) {
    throw new ApplyConflict('STALE_ROW_VERSION', ingestionId, 'Label ingestion changed during apply');
  }
  await phase(deps, 'FINALIZED_INGESTION', client);

  return {
    ok: true,
    replayed: false,
    ingestionId,
    orderIds,
    serialUnitIds,
    inventoryEventIds,
    shipmentId,
    documentId,
    rowVersion: Number(finalized.rows[0].row_version),
  };
}

/**
 * Atomically apply one exactly matched, pre-staged shipping-label ingestion.
 * The transaction wrapper is invoked exactly once; every query also carries
 * an explicit organization predicate/stamp so RLS is a backstop, not the only
 * tenant boundary.
 */
export async function applyLabelIngestion(
  input: ApplyLabelIngestionInput,
  dependencies: Partial<ApplyLabelIngestionDependencies> = {},
): Promise<ApplyLabelIngestionResult> {
  const deps: ApplyLabelIngestionDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await deps.runTenantTransaction(input.organizationId, (client) =>
        runApply(client, input, deps),
      );
    } catch (error) {
      if (error instanceof ApplyConflict) {
        return conflict(error.code, error.ingestionId, error.message);
      }
      const sqlState = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
      const retryableLockFailure = sqlState === '40001' || sqlState === '40P01' || sqlState === '55P03';
      if (retryableLockFailure && attempt < 3) {
        await deps.waitBeforeLockRetry?.(attempt);
        continue;
      }
      throw error;
    }
  }

  throw new Error('Unreachable label-ingestion retry state');
}
