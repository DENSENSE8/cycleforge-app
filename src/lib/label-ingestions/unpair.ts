/**
 * Take a filed shipping label back off its order — the reverse of
 * `applyLabelIngestion` (apply.ts) and of the tracking the pairing attached
 * (`attachPairedTracking`, ingestion-service.ts). The ingestion returns to the
 * waiting pool (QUARANTINED, `OPERATOR_UNPAIRED`); `remove` then deletes it.
 *
 * Evidence of "the label put this there": a `shipment_links` row (or, with no
 * link row, the `shipping_tracking_numbers` row) created at or after the
 * ingestion row itself. Tracking already on the order before the label was
 * received stays. Only the label's own shipment is ever a candidate, so a
 * label filed as an additional package loses only its own box.
 */
import type { NextRequest } from 'next/server';
import type { PoolClient } from 'pg';
import { AUDIT_ACTION, AUDIT_ENTITY, recordAudit } from '@/lib/audit-logs';
import type { AuthContext } from '@/lib/auth/auth-context';
import { transition, type TransitionInput, type TransitionResult } from '@/lib/inventory/state-machine';
import { defaultGcsBucket, gcsAdapter } from '@/lib/photos/storage/gcs-adapter';
import { setPrimaryShipmentLink, unlinkShipment } from '@/lib/shipping/shipment-links';
import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { getLabelIngestion, type PublicLabelIngestion } from './ingestion-service';
import type { LabelIngestionState } from './types';

type Tx = Pick<PoolClient, 'query'>;

export interface LabelUnpairCheck {
  orderId: number;
  rowVersion: number;
  /** Full tracking numbers that come off the order. Empty when the tracking was there before the label. */
  trackingComesOff: string[];
  /** The dock scan-out on the label's tracking. Unpair is still allowed; the scan record stays. */
  scannedOut: { at: string; by: string | null } | null;
}

export type LabelUnpairErrorCode =
  | 'INGESTION_NOT_FOUND'
  | 'ROW_VERSION_CONFLICT'
  | 'INGESTION_NOT_ACTIONABLE'
  | 'LABEL_APPLIED_TERMINAL';

export class LabelUnpairError extends Error {
  constructor(readonly code: LabelUnpairErrorCode, message: string) {
    super(message);
    this.name = 'LabelUnpairError';
  }
}

// ─── Pure core ───────────────────────────────────────────────────────────────

export interface UnpairFacts {
  ingestion: {
    id: number;
    state: LabelIngestionState;
    rowVersion: number;
    /** When the label was received — the line between "was already there" and "the label put it there". */
    createdAt: Date;
    matchedOrderId: number | null;
  };
  /** Every orders row of the logical order the label is on. */
  orderIds: number[];
  /** The label's own tracking row (the applied shipment, else the row with its normalized tracking). */
  labelShipment: { id: number; trackingRaw: string; createdAt: Date } | null;
  orders: { id: number; shipmentId: number | null }[];
  /** Every ORDER shipment link of `orderIds`. */
  links: { ownerId: number; shipmentId: number; boxSeq: number; isPrimary: boolean; createdAt: Date }[];
  /** Units currently LABELED by this label's apply. */
  labeledUnitIds: number[];
  /** The document apply stored; `ownedByLabel` = apply created it from the ledger bytes. */
  document: { id: number; ownedByLabel: boolean } | null;
}

export interface UnpairPlan {
  dropLinks: { orderId: number; shipmentId: number }[];
  /** Per affected order: the primary after the drop. `pointer` = also rewrite `orders.shipment_id`. */
  primaries: { orderId: number; shipmentId: number | null; pointer: boolean }[];
  trackingComesOff: string[];
  revertUnitIds: number[];
  document: { id: number; action: 'delete' | 'unlink' } | null;
}

/** What an unpair (and, with `remove`, a removal) takes off the order. Throws {@link LabelUnpairError}. */
export function planLabelUnpair(facts: UnpairFacts, input: { expectedRowVersion: number; remove: boolean }): UnpairPlan {
  const { ingestion } = facts;
  if (ingestion.rowVersion !== input.expectedRowVersion) {
    throw new LabelUnpairError('ROW_VERSION_CONFLICT', 'This label changed since it was shown. Refresh and try again.');
  }
  if (ingestion.state === 'LINKED') {
    throw new LabelUnpairError('INGESTION_NOT_ACTIONABLE', 'This ShipStation label is linked from the order’s label list — unlink it there.');
  }
  const paired = ingestion.state === 'MATCHED' || ingestion.state === 'APPLIED';
  if (!paired && !input.remove) {
    throw new LabelUnpairError('INGESTION_NOT_ACTIONABLE', 'This label is not on an order.');
  }

  const dropLinks: UnpairPlan['dropLinks'] = [];
  const primaries: UnpairPlan['primaries'] = [];
  const shipment = paired ? facts.labelShipment : null;
  if (shipment) {
    const cutoff = ingestion.createdAt.getTime();
    for (const orderId of facts.orderIds) {
      const order = facts.orders.find((row) => row.id === orderId);
      const own = facts.links.filter((link) => link.ownerId === orderId);
      const labelLink = own.find((link) => link.shipmentId === shipment.id);
      const isPointer = order?.shipmentId === shipment.id;
      if (!labelLink && !isPointer) continue;
      // A link row is the evidence; a bare legacy pointer falls back to the tracking row's age.
      const addedByLabel = (labelLink?.createdAt ?? shipment.createdAt).getTime() >= cutoff;
      if (!addedByLabel) continue;
      if (labelLink) dropLinks.push({ orderId, shipmentId: shipment.id });
      const remaining = own
        .filter((link) => link.shipmentId !== shipment.id)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.boxSeq - b.boxSeq || a.shipmentId - b.shipmentId);
      if (isPointer) {
        primaries.push({ orderId, shipmentId: remaining[0]?.shipmentId ?? null, pointer: true });
      } else if (labelLink?.isPrimary && order?.shipmentId != null && remaining.some((link) => link.shipmentId === order.shipmentId)) {
        // Apply promoted the label's link over the order's own primary; give it back.
        primaries.push({ orderId, shipmentId: order.shipmentId, pointer: false });
      }
    }
  }

  return {
    dropLinks,
    primaries,
    trackingComesOff: shipment && (dropLinks.length > 0 || primaries.some((p) => p.pointer)) ? [shipment.trackingRaw] : [],
    revertUnitIds: [...new Set(facts.labeledUnitIds)].sort((a, b) => a - b),
    document: facts.document
      ? { id: facts.document.id, action: facts.document.ownedByLabel || input.remove ? 'delete' : 'unlink' }
      : null,
  };
}

/** A table row as `to_jsonb` returned it — written back verbatim with `jsonb_populate_record`. */
type RowSnapshot = Record<string, unknown>;

/**
 * Everything an unpair took off, stored in its `label_ingestion.unpaired`
 * audit row (`metadata.restore`) so {@link undoLabelUnpair} can put it back
 * exactly — not through apply, whose preconditions are not the unpair's inverse.
 */
export interface UnpairRestoreRecord {
  version: 1;
  /** The `label_ingestions` row before the unpair. */
  ingestion: RowSnapshot;
  /** Its `label_ingestion_orders` rows. */
  ingestionOrders: RowSnapshot[];
  shipmentId: number | null;
  /** The `shipment_links` rows the unpair deleted (box, primary flag, role, source). */
  links: RowSnapshot[];
  /** Each order the unpair touched: its `orders.shipment_id` and primary link before. */
  orders: { orderId: number; shipmentId: number | null; primaryShipmentId: number | null }[];
  /** Units the unpair moved LABELED → PACKED. */
  unitIds: number[];
  /** `delete`: the row and links were deleted; `unlink`: the row went to UNLINKED and these links were dropped. */
  document: { mode: 'delete' | 'unlink'; row: RowSnapshot; links: RowSnapshot[] } | null;
}

/** The restore record for one unpair plan, from the rows read before anything moved. */
export function buildUnpairRestoreRecord(
  facts: UnpairFacts,
  plan: UnpairPlan,
  rows: { ingestion: RowSnapshot; ingestionOrders: RowSnapshot[]; labelLinks: RowSnapshot[]; document: { row: RowSnapshot; links: RowSnapshot[] } | null },
): UnpairRestoreRecord {
  const dropped = new Set(plan.dropLinks.map((link) => `${link.orderId}:${link.shipmentId}`));
  const touched = [...new Set([...plan.dropLinks.map((link) => link.orderId), ...plan.primaries.map((p) => p.orderId)])].sort((a, b) => a - b);
  return {
    version: 1,
    ingestion: rows.ingestion,
    ingestionOrders: rows.ingestionOrders,
    shipmentId: facts.labelShipment?.id ?? null,
    links: rows.labelLinks.filter((link) => dropped.has(`${Number(link.owner_id)}:${Number(link.shipment_id)}`)),
    orders: touched.map((orderId) => ({
      orderId,
      shipmentId: facts.orders.find((order) => order.id === orderId)?.shipmentId ?? null,
      primaryShipmentId: facts.links.find((link) => link.ownerId === orderId && link.isPrimary)?.shipmentId ?? null,
    })),
    unitIds: plan.revertUnitIds,
    document: plan.document && rows.document
      ? { mode: plan.document.action, row: rows.document.row, links: rows.document.links }
      : null,
  };
}

export interface UndoFacts {
  ingestion: { state: LabelIngestionState; quarantineReasonCode: string | null; rowVersion: number };
  /** The latest unpair on record for this label, and the row version it left. */
  unpair: { rowVersion: number; record: UnpairRestoreRecord } | null;
  /** Current status of each unit the unpair reverted. */
  units: { id: number; status: string }[];
  /** The label's tracking row still exists. */
  shipmentExists: boolean;
  /** Every order that holds the label's tracking now (link or `orders.shipment_id`). */
  shipmentOwnerIds: number[];
}

/** The label's own orders as the unpair found them: its order rows, the matched row, and every order it touched. */
export function unpairSnapshotOrderIds(record: UnpairRestoreRecord): number[] {
  const ids = [
    ...record.ingestionOrders.map((row) => Number(row.order_id)),
    Number(record.ingestion.matched_order_id),
    ...record.orders.map((order) => order.orderId),
    ...record.links.map((link) => Number(link.owner_id)),
  ].filter((orderId) => Number.isSafeInteger(orderId) && orderId > 0);
  return [...new Set(ids)].sort((a, b) => a - b);
}

export interface UndoPlan {
  record: UnpairRestoreRecord;
  /** Units still PACKED go back to LABELED; any that moved on are left alone. */
  relabelUnitIds: number[];
}

/** Whether the unpair can be undone exactly, and which units go back. Throws {@link LabelUnpairError}. */
export function planUnpairUndo(facts: UndoFacts, expectedRowVersion: number): UndoPlan {
  if (facts.ingestion.rowVersion !== expectedRowVersion) {
    throw new LabelUnpairError('ROW_VERSION_CONFLICT', 'This label changed since it was unpaired. Refresh and try again.');
  }
  if (facts.ingestion.state !== 'QUARANTINED' || facts.ingestion.quarantineReasonCode !== 'OPERATOR_UNPAIRED') {
    throw new LabelUnpairError('INGESTION_NOT_ACTIONABLE', 'This label is no longer as the unpair left it.');
  }
  const { unpair } = facts;
  if (!unpair || unpair.rowVersion !== facts.ingestion.rowVersion) {
    throw new LabelUnpairError('INGESTION_NOT_ACTIONABLE', 'There is no unpair of this label to undo.');
  }
  if (unpair.record.links.length > 0 && !facts.shipmentExists) {
    throw new LabelUnpairError('INGESTION_NOT_ACTIONABLE', 'This label’s tracking no longer exists.');
  }
  // Tracking that stayed on the label's own orders (it pre-dated the label) is no conflict;
  // only an order outside the label's set now holding it is.
  const own = new Set(unpairSnapshotOrderIds(unpair.record));
  if (facts.shipmentOwnerIds.some((orderId) => !own.has(orderId))) {
    throw new LabelUnpairError('INGESTION_NOT_ACTIONABLE', 'This label’s tracking is now on another order.');
  }
  const reverted = new Set(unpair.record.unitIds);
  return {
    record: unpair.record,
    relabelUnitIds: facts.units.filter((unit) => reverted.has(unit.id) && unit.status === 'PACKED').map((unit) => unit.id).sort((a, b) => a - b),
  };
}

// ─── DB adapter ──────────────────────────────────────────────────────────────

interface IngestionRow {
  id: number | string;
  client_event_id: string;
  state: LabelIngestionState;
  row_version: number | string;
  created_at: Date | string;
  matched_order_id: number | string | null;
  matched_account_source: string | null;
  matched_marketplace_order_id: string | null;
  tracking_number_normalized: string | null;
  shipment_id: number | string | null;
  document_id: number | string | null;
  staged_object_key: string | null;
  sha256: string;
  file_basename: string;
  quarantine_reason_code: string | null;
  /** The whole row, for the unpair's restore record. */
  snapshot: RowSnapshot;
}

async function loadFacts(client: Tx, orgId: OrgId, id: number, lock: boolean): Promise<{ facts: UnpairFacts; row: IngestionRow }> {
  const forUpdate = lock ? 'FOR UPDATE' : '';
  const ingestion = await client.query<IngestionRow>(
    `SELECT id, client_event_id, state, row_version, created_at, matched_order_id, matched_account_source,
            matched_marketplace_order_id, tracking_number_normalized, shipment_id, document_id,
            staged_object_key, sha256, file_basename, quarantine_reason_code,
            to_jsonb(label_ingestions.*) AS snapshot
       FROM label_ingestions
      WHERE organization_id = $1 AND id = $2
      ${forUpdate}`,
    [orgId, id],
  );
  const row = ingestion.rows[0];
  if (!row) throw new LabelUnpairError('INGESTION_NOT_FOUND', 'Label ingestion was not found.');

  // The order set: what apply persisted, else the logical order the match named, else the matched row.
  const persisted = await client.query<{ order_id: number | string }>(
    `SELECT order_id FROM label_ingestion_orders WHERE organization_id = $1 AND ingestion_id = $2 ORDER BY ordinal ASC`,
    [orgId, id],
  );
  let orderIds = persisted.rows.map((r) => Number(r.order_id));
  if (orderIds.length === 0 && row.matched_account_source && row.matched_marketplace_order_id) {
    const logical = await client.query<{ id: number | string }>(
      `SELECT id FROM orders WHERE organization_id = $1 AND account_source = $2 AND order_id = $3 ORDER BY id ASC`,
      [orgId, row.matched_account_source, row.matched_marketplace_order_id],
    );
    orderIds = logical.rows.map((r) => Number(r.id));
  }
  if (orderIds.length === 0 && row.matched_order_id != null) orderIds = [Number(row.matched_order_id)];

  const [orders, links, units, document] = await Promise.all([
    client.query<{ id: number | string; shipment_id: number | string | null }>(
      `SELECT id, shipment_id FROM orders WHERE organization_id = $1 AND id = ANY($2::int[]) ORDER BY id ASC ${forUpdate}`,
      [orgId, orderIds],
    ),
    client.query<{ owner_id: number | string; shipment_id: number | string; box_seq: number | string; is_primary: boolean; created_at: Date | string }>(
      `SELECT owner_id, shipment_id, box_seq, is_primary, created_at FROM shipment_links
        WHERE organization_id = $1 AND owner_type = 'ORDER' AND owner_id = ANY($2::int[])
        ORDER BY id ASC ${forUpdate}`,
      [orgId, orderIds],
    ),
    client.query<{ id: number | string }>(
      `SELECT su.id
         FROM inventory_events ie
         JOIN serial_units su ON su.id = ie.serial_unit_id AND su.organization_id = ie.organization_id
        WHERE ie.organization_id = $1
          AND ie.event_type = 'LABELED'
          AND ie.payload->>'label_ingestion_id' = $2
          AND su.current_status::text = 'LABELED'`,
      [orgId, String(id)],
    ),
    row.document_id != null
      ? client.query<{ id: number | string; label_ingestion_id: string | null; source: string | null }>(
        `SELECT id, document_data->>'labelIngestionId' AS label_ingestion_id, document_data->>'source' AS source
           FROM documents WHERE organization_id = $1 AND id = $2`,
        [orgId, row.document_id],
      )
      : Promise.resolve({ rows: [] as { id: number | string; label_ingestion_id: string | null; source: string | null }[] }),
  ]);
  // Same lock order as apply.ts: orders, their links, then the tracking row.
  const shipmentRows = row.shipment_id != null
    ? await client.query<{ id: number | string; tracking_number_raw: string; created_at: Date | string }>(
      `SELECT id, tracking_number_raw, created_at FROM shipping_tracking_numbers WHERE organization_id = $1 AND id = $2 ${forUpdate}`,
      [orgId, row.shipment_id],
    )
    : row.tracking_number_normalized
      ? await client.query<{ id: number | string; tracking_number_raw: string; created_at: Date | string }>(
        `SELECT id, tracking_number_raw, created_at FROM shipping_tracking_numbers
          WHERE organization_id = $1 AND tracking_number_normalized = $2 ORDER BY id ASC LIMIT 1 ${forUpdate}`,
        [orgId, row.tracking_number_normalized],
      )
      : { rows: [] };
  const shipment = shipmentRows.rows[0];
  const doc = document.rows[0];

  return {
    row,
    facts: {
      ingestion: {
        id,
        state: row.state,
        rowVersion: Number(row.row_version),
        createdAt: new Date(row.created_at),
        matchedOrderId: row.matched_order_id == null ? null : Number(row.matched_order_id),
      },
      orderIds,
      labelShipment: shipment
        ? { id: Number(shipment.id), trackingRaw: shipment.tracking_number_raw, createdAt: new Date(shipment.created_at) }
        : null,
      orders: orders.rows.map((r) => ({ id: Number(r.id), shipmentId: r.shipment_id == null ? null : Number(r.shipment_id) })),
      links: links.rows.map((r) => ({
        ownerId: Number(r.owner_id),
        shipmentId: Number(r.shipment_id),
        boxSeq: Number(r.box_seq),
        isPrimary: r.is_primary,
        createdAt: new Date(r.created_at),
      })),
      labeledUnitIds: units.rows.map((r) => Number(r.id)),
      document: doc
        ? { id: Number(doc.id), ownedByLabel: doc.label_ingestion_id === String(id) || doc.source === 'label_ingestion' }
        : null,
    },
  };
}

async function readRestoreRecord(client: Tx, orgId: OrgId, facts: UnpairFacts, plan: UnpairPlan, row: IngestionRow): Promise<UnpairRestoreRecord> {
  const shipmentId = facts.labelShipment?.id ?? null;
  const [ingestionOrders, labelLinks, documentRow, documentLinks] = await Promise.all([
    client.query<{ r: RowSnapshot }>(
      `SELECT to_jsonb(lio.*) AS r FROM label_ingestion_orders lio
        WHERE lio.organization_id = $1 AND lio.ingestion_id = $2 ORDER BY lio.ordinal ASC`,
      [orgId, facts.ingestion.id],
    ),
    shipmentId == null
      ? Promise.resolve({ rows: [] as { r: RowSnapshot }[] })
      : client.query<{ r: RowSnapshot }>(
        `SELECT to_jsonb(sl.*) AS r FROM shipment_links sl
          WHERE sl.organization_id = $1 AND sl.owner_type = 'ORDER' AND sl.shipment_id = $2 AND sl.owner_id = ANY($3::int[])
          ORDER BY sl.id ASC`,
        [orgId, shipmentId, facts.orderIds],
      ),
    plan.document
      ? client.query<{ r: RowSnapshot }>(`SELECT to_jsonb(d.*) AS r FROM documents d WHERE d.organization_id = $1 AND d.id = $2`, [orgId, plan.document.id])
      : Promise.resolve({ rows: [] as { r: RowSnapshot }[] }),
    // Delete drops every link (cascade); unlink drops only the label's order/tracking links — the same predicate the unlink uses.
    plan.document
      ? client.query<{ r: RowSnapshot }>(
        `SELECT to_jsonb(l.*) AS r FROM document_entity_links l
          WHERE l.organization_id = $1 AND l.document_id = $2
            AND ($3::boolean OR (l.entity_type = 'ORDER' AND l.entity_id = ANY($4::int[])) OR (l.entity_type = 'SHIPMENT' AND l.entity_id = $5::bigint))
          ORDER BY l.id ASC`,
        [orgId, plan.document.id, plan.document.action === 'delete', facts.orderIds, shipmentId],
      )
      : Promise.resolve({ rows: [] as { r: RowSnapshot }[] }),
  ]);
  const document = documentRow.rows[0] ? { row: documentRow.rows[0].r, links: documentLinks.rows.map((link) => link.r) } : null;
  return buildUnpairRestoreRecord(facts, plan, {
    ingestion: row.snapshot,
    ingestionOrders: ingestionOrders.rows.map((r) => r.r),
    labelLinks: labelLinks.rows.map((r) => r.r),
    document,
  });
}

async function readScanOut(client: Tx, orgId: OrgId, shipmentId: number | null): Promise<LabelUnpairCheck['scannedOut']> {
  if (shipmentId == null) return null;
  const scan = await client.query<{ created_at: Date | string; staff_name: string | null }>(
    `SELECT sal.created_at, s.name AS staff_name
       FROM station_activity_logs sal
       LEFT JOIN staff s ON s.id = sal.staff_id AND s.organization_id = sal.organization_id
      WHERE sal.organization_id = $1 AND sal.activity_type = 'SHIP_CONFIRM' AND sal.shipment_id = $2
      ORDER BY sal.created_at DESC
      LIMIT 1`,
    [orgId, shipmentId],
  );
  const row = scan.rows[0];
  return row ? { at: new Date(row.created_at).toISOString(), by: row.staff_name ?? null } : null;
}

export interface LabelUnpairDependencies {
  runTenantTransaction<T>(orgId: OrgId, fn: (client: Tx) => Promise<T>): Promise<T>;
  transitionUnit(input: TransitionInput, client: Tx | undefined, orgId: OrgId): Promise<TransitionResult>;
  readIngestion(orgId: OrgId, id: number): Promise<PublicLabelIngestion>;
  deleteStoredObject(objectKey: string): Promise<void>;
}

const defaultDependencies: LabelUnpairDependencies = {
  runTenantTransaction: withTenantTransaction,
  transitionUnit: transition,
  readIngestion: getLabelIngestion,
  deleteStoredObject: (objectKey) => gcsAdapter.deleteObject({ bucket: defaultGcsBucket(), objectKey }),
};

function isAppliedTerminalViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === '23514' && typeof message === 'string' && message.includes('APPLIED state is terminal');
}

/** What an unpair of this label would take off its order — the confirm dialog's facts. */
export async function readLabelUnpairCheck(
  orgId: OrgId,
  id: number,
  dependencies: Partial<LabelUnpairDependencies> = {},
): Promise<LabelUnpairCheck> {
  const deps = { ...defaultDependencies, ...dependencies };
  return deps.runTenantTransaction(orgId, async (client) => {
    const { facts } = await loadFacts(client, orgId, id, false);
    const plan = planLabelUnpair(facts, { expectedRowVersion: facts.ingestion.rowVersion, remove: false });
    const orderId = facts.ingestion.matchedOrderId ?? facts.orderIds[0];
    if (orderId == null) throw new LabelUnpairError('INGESTION_NOT_ACTIONABLE', 'This label is not on an order.');
    return {
      orderId,
      rowVersion: facts.ingestion.rowVersion,
      trackingComesOff: plan.trackingComesOff,
      scannedOut: await readScanOut(client, orgId, facts.labelShipment?.id ?? null),
    };
  });
}

/**
 * Unpair one filed label in one tenant transaction, guarded by its row
 * version. `remove` = unpair, then delete the ledger row and its document
 * (the staged PDF is deleted after commit). Returns the ingestion as it now
 * stands, or null when removed.
 */
export async function unpairLabelIngestion(
  orgId: OrgId,
  id: number,
  input: {
    expectedRowVersion: number;
    remove?: boolean;
    actor: { staffId: number; ctx?: AuthContext; req?: Pick<NextRequest, 'headers'> };
  },
  dependencies: Partial<LabelUnpairDependencies> = {},
): Promise<{ ingestion: PublicLabelIngestion | null }> {
  const deps = { ...defaultDependencies, ...dependencies };
  const remove = input.remove === true;

  let objectKey: string | null;
  try {
    objectKey = await deps.runTenantTransaction(orgId, async (client) => {
      const { facts, row } = await loadFacts(client, orgId, id, true);
      const plan = planLabelUnpair(facts, { expectedRowVersion: input.expectedRowVersion, remove });
      const scannedOut = await readScanOut(client, orgId, facts.labelShipment?.id ?? null);
      // Read everything the unpair is about to take off, so its Undo can put it back exactly.
      const restore = remove ? null : await readRestoreRecord(client, orgId, facts, plan, row);

      // The ledger row first: a stale version or the APPLIED guard fails before anything else moves.
      if (remove) {
        await client.query(`DELETE FROM label_ingestions WHERE organization_id = $1 AND id = $2`, [orgId, id]);
      } else {
        const updated = await client.query(
          `UPDATE label_ingestions
              SET state = 'QUARANTINED',
                  quarantine_reason_code = 'OPERATOR_UNPAIRED',
                  matched_order_id = NULL,
                  match_method = NULL,
                  matched_account_source = NULL,
                  matched_marketplace_order_id = NULL,
                  shipment_id = NULL,
                  document_id = NULL,
                  applied_at = NULL,
                  actor_staff_id = $4,
                  row_version = row_version + 1
            WHERE organization_id = $1 AND id = $2 AND row_version = $3
            RETURNING id`,
          [orgId, id, input.expectedRowVersion, input.actor.staffId],
        );
        if (updated.rows.length !== 1) {
          throw new LabelUnpairError('ROW_VERSION_CONFLICT', 'This label changed while unpairing. Refresh and try again.');
        }
        await client.query(`DELETE FROM label_ingestion_orders WHERE organization_id = $1 AND ingestion_id = $2`, [orgId, id]);
      }

      for (const link of plan.dropLinks) {
        await unlinkShipment(orgId, 'ORDER', link.orderId, link.shipmentId, client);
      }
      for (const primary of plan.primaries) {
        if (primary.pointer) {
          await client.query(
            `UPDATE orders SET shipment_id = $3 WHERE organization_id = $1 AND id = $2`,
            [orgId, primary.orderId, primary.shipmentId],
          );
        }
        if (primary.shipmentId != null) {
          await setPrimaryShipmentLink(orgId, 'ORDER', primary.orderId, primary.shipmentId, client);
        }
      }

      for (const unitId of plan.revertUnitIds) {
        const reverted = await deps.transitionUnit(
          {
            unitId,
            to: 'PACKED',
            eventType: 'PACKED',
            actorStaffId: input.actor.staffId,
            clientEventId: `label-unpair:${row.client_event_id}:${unitId}:v${input.expectedRowVersion}`,
            expectedFrom: 'LABELED',
            notes: 'Shipping label taken off the order',
            payload: { label_ingestion_id: id, reason: 'label_unpaired' },
          },
          client,
          orgId,
        );
        if (!reverted.ok) {
          throw new LabelUnpairError('INGESTION_NOT_ACTIONABLE', `A unit on this label moved on (${reverted.error}). Refresh and try again.`);
        }
      }

      if (plan.document) {
        if (plan.document.action === 'delete') {
          await client.query(`DELETE FROM documents WHERE organization_id = $1 AND id = $2`, [orgId, plan.document.id]);
        } else {
          await client.query(
            `DELETE FROM document_entity_links
              WHERE organization_id = $1 AND document_id = $2
                AND ((entity_type = 'ORDER' AND entity_id = ANY($3::int[])) OR (entity_type = 'SHIPMENT' AND entity_id = $4::bigint))`,
            [orgId, plan.document.id, facts.orderIds, facts.labelShipment?.id ?? null],
          );
          // The file is kept, but it no longer belongs to the order: it joins
          // the unlinked documents, as `unlinkOutboundDocument` leaves a slip.
          await client.query(
            `UPDATE documents
                SET entity_type = 'UNLINKED', entity_id = 0, updated_at = NOW()
              WHERE organization_id = $1 AND id = $2
                AND entity_type = 'ORDER' AND entity_id = ANY($3::int[])`,
            [orgId, plan.document.id, facts.orderIds],
          );
        }
      }

      const auditId = await recordAudit(client, input.actor.ctx ?? null, input.actor.req ?? null, {
        source: 'label-ingestion',
        action: remove ? AUDIT_ACTION.LABEL_INGESTION_REMOVED : AUDIT_ACTION.LABEL_INGESTION_UNPAIRED,
        entityType: AUDIT_ENTITY.LABEL_INGESTION,
        entityId: id,
        before: {
          state: facts.ingestion.state,
          rowVersion: facts.ingestion.rowVersion,
          matchedOrderId: facts.ingestion.matchedOrderId,
          shipmentId: row.shipment_id == null ? null : Number(row.shipment_id),
          documentId: row.document_id == null ? null : Number(row.document_id),
        },
        after: remove ? null : { state: 'QUARANTINED', quarantineReasonCode: 'OPERATOR_UNPAIRED', rowVersion: facts.ingestion.rowVersion + 1 },
        actorStaffIdOverride: input.actor.staffId,
        organizationIdOverride: orgId,
        extra: {
          order_ids: facts.orderIds,
          tracking_off: plan.trackingComesOff,
          dropped_links: plan.dropLinks,
          primaries: plan.primaries,
          reverted_unit_ids: plan.revertUnitIds,
          document: plan.document,
          scanned_out: scannedOut,
          sha256: row.sha256,
          file_basename: row.file_basename,
          ...(restore ? { restore } : {}),
        },
      });
      // The audit row IS the undo record (and recordAudit swallows its own failure): no row, no unpair.
      if (auditId == null) throw new Error('Label unpair audit append failed');

      return remove ? row.staged_object_key : null;
    });
  } catch (error) {
    if (isAppliedTerminalViolation(error)) {
      throw new LabelUnpairError('LABEL_APPLIED_TERMINAL', 'Filed labels cannot be unpaired until the database allows it. Remove the label instead, or ask an admin.');
    }
    throw error;
  }

  if (remove) {
    if (objectKey) {
      // The row is gone; a storage failure only leaves an unreachable object.
      try { await deps.deleteStoredObject(objectKey); }
      catch (error) { console.warn(`[label-ingestion] ${id}: removed, staged PDF not deleted:`, error); }
    }
    return { ingestion: null };
  }
  return { ingestion: await deps.readIngestion(orgId, id) };
}

/**
 * Put back exactly what the latest unpair of this label took off, from its
 * audit row's restore record: the ledger row (APPLIED or MATCHED as it was),
 * its order rows, the dropped tracking links and primary pointers, the label
 * document and its links, and the units — those still PACKED go back to
 * LABELED. Only while the label is still exactly as the unpair left it.
 */
export async function undoLabelUnpair(
  orgId: OrgId,
  id: number,
  input: { expectedRowVersion: number; actor: { staffId: number; ctx?: AuthContext; req?: Pick<NextRequest, 'headers'> } },
  dependencies: Partial<LabelUnpairDependencies> = {},
): Promise<{ ingestion: PublicLabelIngestion }> {
  const deps = { ...defaultDependencies, ...dependencies };
  await deps.runTenantTransaction(orgId, async (client) => {
    const locked = await client.query<{ client_event_id: string; state: LabelIngestionState; quarantine_reason_code: string | null; row_version: number | string }>(
      `SELECT client_event_id, state, quarantine_reason_code, row_version FROM label_ingestions
        WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
      [orgId, id],
    );
    const current = locked.rows[0];
    if (!current) throw new LabelUnpairError('INGESTION_NOT_FOUND', 'Label ingestion was not found.');

    const audit = await client.query<{ after_data: { rowVersion?: unknown } | null; restore: UnpairRestoreRecord | null }>(
      `SELECT after_data, metadata->'restore' AS restore FROM audit_logs
        WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3 AND action = $4
        ORDER BY id DESC LIMIT 1`,
      [orgId, AUDIT_ENTITY.LABEL_INGESTION, String(id), AUDIT_ACTION.LABEL_INGESTION_UNPAIRED],
    );
    const unpaired = audit.rows[0];
    const record = unpaired?.restore?.version === 1 ? unpaired.restore : null;

    // Same lock order as apply: orders, their links, the tracking row, then units.
    const orderIds = record ? unpairSnapshotOrderIds(record) : [];
    if (orderIds.length > 0) {
      await client.query(`SELECT id FROM orders WHERE organization_id = $1 AND id = ANY($2::int[]) ORDER BY id ASC FOR UPDATE`, [orgId, orderIds]);
      await client.query(
        `SELECT id FROM shipment_links WHERE organization_id = $1 AND owner_type = 'ORDER' AND owner_id = ANY($2::int[]) ORDER BY id ASC FOR UPDATE`,
        [orgId, orderIds],
      );
    }
    const shipmentId = record?.shipmentId ?? null;
    const shipment = shipmentId == null ? { rows: [] } : await client.query(
      `SELECT id FROM shipping_tracking_numbers WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
      [orgId, shipmentId],
    );
    const owners = shipmentId == null ? { rows: [] as { order_id: number | string }[] } : await client.query<{ order_id: number | string }>(
      `SELECT owner_id AS order_id FROM shipment_links WHERE organization_id = $1 AND owner_type = 'ORDER' AND shipment_id = $2
       UNION
       SELECT id FROM orders WHERE organization_id = $1 AND shipment_id = $2`,
      [orgId, shipmentId],
    );
    const units = record && record.unitIds.length > 0
      ? await client.query<{ id: number | string; status: string }>(
        `SELECT id, current_status::text AS status FROM serial_units WHERE organization_id = $1 AND id = ANY($2::int[]) ORDER BY id ASC FOR UPDATE`,
        [orgId, record.unitIds],
      )
      : { rows: [] as { id: number | string; status: string }[] };

    const plan = planUnpairUndo({
      ingestion: { state: current.state, quarantineReasonCode: current.quarantine_reason_code, rowVersion: Number(current.row_version) },
      unpair: record ? { rowVersion: Number(unpaired?.after_data?.rowVersion), record } : null,
      units: units.rows.map((unit) => ({ id: Number(unit.id), status: unit.status })),
      shipmentExists: shipment.rows.length > 0,
      shipmentOwnerIds: owners.rows.map((owner) => Number(owner.order_id)),
    }, input.expectedRowVersion);
    const restore = plan.record;

    // The document first — the ledger row points at it.
    if (restore.document) {
      if (restore.document.mode === 'delete') {
        await client.query(
          `INSERT INTO documents SELECT * FROM jsonb_populate_record(NULL::documents, $1::jsonb)`,
          [JSON.stringify(restore.document.row)],
        );
      } else {
        await client.query(
          `UPDATE documents d
              SET entity_type = s.entity_type, entity_id = s.entity_id, updated_at = NOW()
             FROM jsonb_populate_record(NULL::documents, $3::jsonb) s
            WHERE d.organization_id = $1 AND d.id = $2 AND d.entity_type = 'UNLINKED'`,
          [orgId, Number(restore.document.row.id), JSON.stringify(restore.document.row)],
        );
      }
      if (restore.document.links.length > 0) {
        await client.query(
          `INSERT INTO document_entity_links
           SELECT * FROM jsonb_populate_recordset(NULL::document_entity_links, $1::jsonb)
           ON CONFLICT DO NOTHING`,
          [JSON.stringify(restore.document.links)],
        );
      }
    }

    const restored = await client.query(
      `UPDATE label_ingestions li
          SET state = s.state,
              quarantine_reason_code = s.quarantine_reason_code,
              match_method = s.match_method,
              matched_account_source = s.matched_account_source,
              matched_marketplace_order_id = s.matched_marketplace_order_id,
              matched_order_id = s.matched_order_id,
              shipment_id = s.shipment_id,
              document_id = s.document_id,
              applied_at = s.applied_at,
              actor_staff_id = $4,
              row_version = li.row_version + 1
         FROM jsonb_populate_record(NULL::label_ingestions, $5::jsonb) s
        WHERE li.organization_id = $1 AND li.id = $2 AND li.row_version = $3
          AND li.state = 'QUARANTINED' AND li.quarantine_reason_code = 'OPERATOR_UNPAIRED'
        RETURNING li.id`,
      [orgId, id, input.expectedRowVersion, input.actor.staffId, JSON.stringify(restore.ingestion)],
    );
    if (restored.rows.length !== 1) {
      throw new LabelUnpairError('ROW_VERSION_CONFLICT', 'This label changed while undoing. Refresh and try again.');
    }
    if (restore.ingestionOrders.length > 0) {
      await client.query(
        `INSERT INTO label_ingestion_orders
         SELECT * FROM jsonb_populate_recordset(NULL::label_ingestion_orders, $1::jsonb)
         ON CONFLICT DO NOTHING`,
        [JSON.stringify(restore.ingestionOrders)],
      );
    }

    for (const link of restore.links) {
      if (link.is_primary === true) {
        // One primary per owner: make room before the label's primary box returns.
        await client.query(
          `UPDATE shipment_links SET is_primary = false, updated_at = NOW()
            WHERE organization_id = $1 AND owner_type = 'ORDER' AND owner_id = $2 AND is_primary AND shipment_id <> $3`,
          [orgId, Number(link.owner_id), Number(link.shipment_id)],
        );
      }
      await client.query(
        `INSERT INTO shipment_links
         SELECT * FROM jsonb_populate_record(NULL::shipment_links, $1::jsonb)
         ON CONFLICT (organization_id, owner_type, owner_id, shipment_id) DO UPDATE SET
           box_seq = EXCLUDED.box_seq, is_primary = EXCLUDED.is_primary, role = EXCLUDED.role,
           source = EXCLUDED.source, updated_at = NOW()`,
        [JSON.stringify(link)],
      );
    }
    for (const order of restore.orders) {
      await client.query(`UPDATE orders SET shipment_id = $3 WHERE organization_id = $1 AND id = $2`, [orgId, order.orderId, order.shipmentId]);
      if (order.primaryShipmentId != null) {
        await setPrimaryShipmentLink(orgId, 'ORDER', order.orderId, order.primaryShipmentId, client);
      } else {
        // The order had no primary box before; the unpair may have promoted one.
        await client.query(
          `UPDATE shipment_links SET is_primary = false, updated_at = NOW()
            WHERE organization_id = $1 AND owner_type = 'ORDER' AND owner_id = $2 AND is_primary`,
          [orgId, order.orderId],
        );
      }
    }

    for (const unitId of plan.relabelUnitIds) {
      const relabeled = await deps.transitionUnit(
        {
          unitId,
          to: 'LABELED',
          eventType: 'LABELED',
          actorStaffId: input.actor.staffId,
          clientEventId: `label-unpair-undo:${current.client_event_id}:${unitId}:v${input.expectedRowVersion}`,
          expectedFrom: 'PACKED',
          notes: 'Shipping label put back on the order (unpair undone)',
          payload: {
            label_ingestion_id: id,
            reason: 'label_unpair_undone',
            shipment_id: restore.ingestion.shipment_id ?? null,
            document_id: restore.ingestion.document_id ?? null,
          },
        },
        client,
        orgId,
      );
      if (!relabeled.ok) {
        throw new LabelUnpairError('INGESTION_NOT_ACTIONABLE', `A unit on this label moved on (${relabeled.error}). Refresh and try again.`);
      }
    }

    const auditId = await recordAudit(client, input.actor.ctx ?? null, input.actor.req ?? null, {
      source: 'label-ingestion',
      action: AUDIT_ACTION.LABEL_INGESTION_UNPAIR_UNDONE,
      entityType: AUDIT_ENTITY.LABEL_INGESTION,
      entityId: id,
      before: { state: current.state, quarantineReasonCode: current.quarantine_reason_code, rowVersion: Number(current.row_version) },
      after: { state: restore.ingestion.state ?? null, rowVersion: Number(current.row_version) + 1 },
      actorStaffIdOverride: input.actor.staffId,
      organizationIdOverride: orgId,
      extra: {
        restored_links: restore.links.map((link) => ({ orderId: Number(link.owner_id), shipmentId: Number(link.shipment_id), isPrimary: link.is_primary === true })),
        restored_orders: restore.orders,
        relabeled_unit_ids: plan.relabelUnitIds,
        skipped_unit_ids: restore.unitIds.filter((unitId) => !plan.relabelUnitIds.includes(unitId)),
        document: restore.document ? { id: Number(restore.document.row.id), mode: restore.document.mode } : null,
      },
    });
    if (auditId == null) throw new Error('Label unpair-undo audit append failed');
  });
  return { ingestion: await deps.readIngestion(orgId, id) };
}
