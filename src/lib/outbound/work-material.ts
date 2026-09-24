/**
 * The material state of one outbound record — the fields a command's decision
 * actually depends on — and the fingerprint computed from them.
 *
 * Why this file exists at all: master plan §2.3 requires an optimistic
 * concurrency token, and V1.1 established that `OutboundWorkItem.rowVersion`
 * cannot be one (a `GREATEST(...)` timestamp proxy collides at its own
 * resolution and cannot see a column outside its list). A fingerprint is a
 * digest of the material fields themselves, so an unchanged digest means an
 * unchanged decision, whatever the clock did.
 *
 * Why the SQL lives here rather than in the projection: the queue publishes
 * the fingerprint and the executor re-derives it under lock. Two SQL texts
 * would drift, and a drifted fingerprint is worse than none — it would reject
 * valid commands, or accept stale ones. There is exactly one expression for
 * the material state, used by both, and a live test asserts the two callers
 * agree on real rows.
 *
 * Scope of the digest: the LOGICAL ORDER SET, not the selected row. One
 * marketplace order can be several `orders` rows, and `applyLabelIngestion`
 * resolves, locks and requires every active allocation of that whole set to
 * be PACKED — so the decision's material state spans the siblings, and the
 * digest must too. Covered: warehouse stage, label state, the latest
 * ingestion's id and row version, the shipment, the set's membership, and
 * every active allocation in the set with its unit's status.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { OUTBOUND_LABEL_STATES, OUTBOUND_WAREHOUSE_STAGES } from './work-contract';

/**
 * Lateral joins producing every material field. `stage` reads `unit_progress`,
 * so the order is load-bearing. `material_units` deliberately filters to
 * ACTIVE allocations — the same `state NOT IN ('RELEASED','RETURNED')` set
 * `applyLabelIngestion` locks — while `unit_progress` keeps its existing
 * unfiltered shape because the displayed stage is derived from it and is not
 * being changed here.
 */
export const OUTBOUND_MATERIAL_JOINS_SQL = `
  LEFT JOIN LATERAL (
    SELECT li.id, li.state, li.row_version
      FROM label_ingestion_orders lio
      JOIN label_ingestions li ON li.id = lio.ingestion_id AND li.organization_id = lio.organization_id
     WHERE lio.organization_id = o.organization_id AND lio.order_id = o.id
     ORDER BY li.updated_at DESC, li.id DESC
     LIMIT 1
  ) latest_label ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(MAX(CASE su.current_status
      WHEN 'SHIPPED' THEN 4 WHEN 'LABELED' THEN 3 WHEN 'PACKED' THEN 2 WHEN 'PICKED' THEN 1 ELSE 0 END), 0) AS reached,
      MAX(su.updated_at) AS last_unit_update
      FROM order_unit_allocations oua
      JOIN serial_units su ON su.id = oua.serial_unit_id AND su.organization_id = oua.organization_id
     WHERE oua.organization_id = o.organization_id AND oua.order_id = o.id
  ) unit_progress ON TRUE
  LEFT JOIN LATERAL (
    SELECT CASE
      WHEN o.is_out_of_stock THEN 'OUT_OF_STOCK'
      WHEN unit_progress.reached = 4 THEN 'SCANNED_OUT'
      WHEN unit_progress.reached = 3 THEN 'LABELED'
      WHEN unit_progress.reached = 2 THEN 'PACKED'
      WHEN unit_progress.reached = 1 THEN 'PICKED'
      ELSE 'READY'
    END AS value
  ) stage ON TRUE
  -- The logical order set, NOT this row alone. One marketplace order can be
  -- several orders rows, and applyLabelIngestion locks and requires EVERY
  -- active allocation of the whole set to be PACKED. Fingerprinting only the
  -- selected row would leave that decision's real state invisible: two
  -- operators could select two siblings, both digests stay green, and the
  -- second apply flips to ALLOCATION_NOT_PACKED mid-command — exactly the
  -- surprise the token exists to prevent. IS NOT DISTINCT FROM keeps a row
  -- with a null marketplace identity a set of one instead of a set of all
  -- nulls.
  LEFT JOIN LATERAL (
    SELECT string_agg(sibling.id || '/' || oua.serial_unit_id || ':' || oua.state || ':' || su.current_status,
                      ',' ORDER BY sibling.id, oua.serial_unit_id) AS signature
      FROM orders sibling
      JOIN order_unit_allocations oua ON oua.organization_id = sibling.organization_id AND oua.order_id = sibling.id
      JOIN serial_units su ON su.id = oua.serial_unit_id AND su.organization_id = oua.organization_id
     WHERE sibling.organization_id = o.organization_id
       AND sibling.account_source IS NOT DISTINCT FROM o.account_source
       AND sibling.order_id IS NOT DISTINCT FROM o.order_id
       AND oua.state NOT IN ('RELEASED', 'RETURNED')
  ) material_units ON TRUE
  -- A sibling row appearing or disappearing is itself a material change: apply
  -- refuses with ORDER_SET_CHANGED when the persisted set no longer matches.
  LEFT JOIN LATERAL (
    SELECT string_agg(sibling.id::text, ',' ORDER BY sibling.id) AS members
      FROM orders sibling
     WHERE sibling.organization_id = o.organization_id
       AND sibling.account_source IS NOT DISTINCT FROM o.account_source
       AND sibling.order_id IS NOT DISTINCT FROM o.order_id
  ) material_order_set ON TRUE
`;

/**
 * Identifiers are projected as text: a BIGINT id must not pass through a
 * JavaScript number on its way into a digest.
 */
export const OUTBOUND_MATERIAL_JSON_SQL = `jsonb_build_object(
    'orderId', o.id::text,
    'stage', stage.value,
    'labelState', COALESCE(latest_label.state, 'NONE'),
    'labelIngestionId', latest_label.id::text,
    'labelRowVersion', latest_label.row_version,
    'shipmentId', o.shipment_id::text,
    'units', COALESCE(material_units.signature, ''),
    'orderSet', COALESCE(material_order_set.members, '')
  )`;

export const outboundMaterialSchema = z.object({
  orderId: z.string().regex(/^[1-9][0-9]*$/),
  stage: z.enum(OUTBOUND_WAREHOUSE_STAGES),
  labelState: z.enum(OUTBOUND_LABEL_STATES),
  labelIngestionId: z.string().regex(/^[1-9][0-9]*$/).nullable(),
  labelRowVersion: z.number().int().nonnegative().nullable(),
  shipmentId: z.string().regex(/^[1-9][0-9]*$/).nullable(),
  /**
   * `orderRowId/unitId:allocationState:unitStatus` for every ACTIVE allocation
   * of the whole logical order set, ordered by order row then unit.
   */
  units: z.string(),
  /** Every `orders` row in the logical set, ordered by id. */
  orderSet: z.string(),
}).strict();
export type OutboundMaterial = z.infer<typeof outboundMaterialSchema>;

/**
 * The digest. The field order is written out rather than derived from object
 * key order, because key order is not a contract; and the version prefix means
 * a future change to the material set produces a different digest space
 * instead of silently colliding with the old one.
 */
// v2: the material set widened from the selected row to the logical order set
// (2026-09-20). The prefix is what stops a v1 digest from being mistaken for a
// v2 one, which would silently re-introduce the sibling blind spot.
export const OUTBOUND_FINGERPRINT_VERSION = 'outbound-work/v2';

export function outboundFingerprint(material: OutboundMaterial): string {
  const canonical = JSON.stringify([
    material.orderId,
    material.stage,
    material.labelState,
    material.labelIngestionId,
    material.labelRowVersion,
    material.shipmentId,
    material.units,
    material.orderSet,
  ]);
  return createHash('sha256').update(`${OUTBOUND_FINGERPRINT_VERSION}\n${canonical}`).digest('hex');
}

/** Parses the projected `material` column and hashes it. Throws on drift. */
export function fingerprintFromRow(raw: unknown): { material: OutboundMaterial; fingerprint: string } {
  const parsed = outboundMaterialSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('Outbound work projection returned an unreadable material state.');
  }
  return { material: parsed.data, fingerprint: outboundFingerprint(parsed.data) };
}

/**
 * The executor's read: the same expression, for one record, inside the
 * caller's transaction. The caller must already hold the row lock — this
 * query reads the record and its allocations without taking one, so an
 * unlocked call would fingerprint state another transaction can still change.
 */
export const OUTBOUND_MATERIAL_ONE_SQL = `
  SELECT ${OUTBOUND_MATERIAL_JSON_SQL} AS material
    FROM orders o
    ${OUTBOUND_MATERIAL_JOINS_SQL}
   WHERE o.organization_id = $1 AND o.id = $2
`;

/**
 * §2.1: the already-authorized command for a record. The projection derives
 * `allowedActions` from the same two facts, and a live test holds the two
 * derivations to the same answer on every record it sees.
 */
export function materialAllowsApplyLabel(material: OutboundMaterial): boolean {
  return material.stage === 'PACKED' && material.labelState === 'MATCHED';
}
