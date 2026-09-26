/** Repair PROVENANCE for a counter visit — the facts the History detail pane paints beside the money: */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizePSTTimestamp } from '@/utils/date';

/** One part that went into a device, from whichever book recorded it. */
export interface VisitRepairPart {
  description: string;
  sku: string | null;
  quantity: number | null;
  /** `unit_repair` = inventory repair record · `action` = bench action log. */
  source: 'unit_repair' | 'action';
}

export type VisitTechnicianSource =
  | 'repair_completed'
  | 'repair_started'
  | 'bench_action'
  | 'assignment';

export interface VisitRepairProvenance {
  /** `repair_service.id` — pairs with `CounterVisitDevice.id`. */
  repairId: number;
  rsNumber: string;
  productTitle: string;
  serialNumber: string;
  status: string;
  issue: string | null;
  notes: string | null;
  /** Drop-off — `repair_service.received_at`. */
  receivedAt: string | null;
  receivedByStaffName: string | null;
  /** Pick-up — `delivered_at`, with the signed instant beside it. */
  deliveredAt: string | null;
  pickupSignedAt: string | null;
  pickupStaffName: string | null;
  /** First print of the 2×1 REP label. Null = never printed. */
  labelPrintedAt: string | null;
  technicianStaffId: number | null;
  technicianName: string | null;
  technicianSource: VisitTechnicianSource | null;
  parts: VisitRepairPart[];
  /** Intake agreement — the Blob PNG. */
  intakeSignatureUrl: string | null;
  intakeSignedAt: string | null;
  /** Lossless vector strokes, the documented fallback when Blob is unreachable. */
  intakeSignatureStrokes: unknown | null;
  pickupSignatureUrl: string | null;
  pickupSignatureStrokes: unknown | null;
  /** WHERE IT CAME FROM. */
  sourceSystem: string | null;
  sourceOrderId: string | null;
  sourceTrackingNumber: string | null;
  sourceSku: string | null;
}

interface ProvenanceSqlRow {
  id: number;
  ticket_number: string | null;
  product_title: string | null;
  serial_number: string | null;
  status: string | null;
  issue: string | null;
  notes: string | null;
  received_at: string | null;
  delivered_at: string | null;
  pickup_signed_at: string | null;
  label_printed_at: string | null;
  received_by_name: string | null;
  pickup_staff_name: string | null;
  parts_used: unknown;
  ur_completed_staff_id: number | null;
  ur_completed_name: string | null;
  ur_started_staff_id: number | null;
  ur_started_name: string | null;
  wa_staff_id: number | null;
  wa_staff_name: string | null;
  intake_signature_url: string | null;
  intake_signed_at: string | null;
  intake_strokes: unknown;
  pickup_signature_url: string | null;
  pickup_strokes: unknown;
  source_system: string | null;
  source_order_id: string | null;
  source_tracking_number: string | null;
  source_sku: string | null;
}

interface ActionSqlRow {
  repair_id: number;
  action_type: string;
  part_name: string | null;
  old_sku: string | null;
  new_sku: string | null;
  staff_id: number | null;
  staff_name: string | null;
}

/** `unit_repairs.parts_used` is jsonb with no enforced shape — read it defensively. */
export function normalizeUnitRepairParts(raw: unknown): VisitRepairPart[] {
  if (!Array.isArray(raw)) return [];
  const parts: VisitRepairPart[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const description =
      typeof row.description === 'string' && row.description.trim()
        ? row.description.trim()
        : typeof row.name === 'string' && row.name.trim()
          ? row.name.trim()
          : typeof row.sku === 'string'
            ? row.sku.trim()
            : '';
    if (!description) continue;
    const qtyRaw = row.qty ?? row.quantity;
    const qty = Number(qtyRaw);
    parts.push({
      description,
      sku: typeof row.sku === 'string' && row.sku.trim() ? row.sku.trim() : null,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : null,
      source: 'unit_repair',
    });
  }
  return parts;
}

/** A bench action only becomes a PART row when it actually names one. */
export function benchActionAsPart(row: {
  part_name: string | null;
  new_sku: string | null;
}): VisitRepairPart | null {
  const description = (row.part_name ?? '').trim() || (row.new_sku ?? '').trim();
  if (!description) return null;
  return {
    description,
    sku: (row.new_sku ?? '').trim() || null,
    quantity: null,
    source: 'action',
  };
}

/** Which repairs to read. */
export type VisitProvenanceScope =
  | { counterTransactionId: number }
  | { repairIds: number[] };

export async function loadVisitProvenance(
  orgId: OrgId,
  scope: VisitProvenanceScope,
): Promise<VisitRepairProvenance[]> {
  const byTransaction = 'counterTransactionId' in scope;
  if (!byTransaction && scope.repairIds.length === 0) return [];
  const selector = byTransaction
    ? 'rs.counter_transaction_id = $2::bigint'
    : 'rs.id = ANY($2::int[])';
  const selectorValue = byTransaction ? scope.counterTransactionId : scope.repairIds;
  return withTenantTransaction(orgId, async (client) => {
    const devices = await client.query<ProvenanceSqlRow>(
      `SELECT rs.id,
              rs.ticket_number,
              rs.product_title,
              rs.serial_number,
              rs.status,
              rs.issue,
              rs.notes,
              rs.source_system,
              rs.source_order_id,
              rs.source_tracking_number,
              rs.source_sku,
              rs.received_at,
              rs.delivered_at,
              rs.pickup_signed_at,
              rs.label_printed_at,
              rbs.name  AS received_by_name,
              pus.name  AS pickup_staff_name,
              ur.parts_used,
              ur.completed_by_staff_id AS ur_completed_staff_id,
              urc.name  AS ur_completed_name,
              ur.started_by_staff_id   AS ur_started_staff_id,
              urs.name  AS ur_started_name,
              wa.assignee_staff_id     AS wa_staff_id,
              was.name  AS wa_staff_name,
              intake.signature_url     AS intake_signature_url,
              intake.signed_at         AS intake_signed_at,
              intake.document_data -> 'signatureStrokes' AS intake_strokes,
              pickup.signature_url     AS pickup_signature_url,
              pickup.document_data -> 'signatureStrokes' AS pickup_strokes
         FROM repair_service rs
         LEFT JOIN staff rbs ON rbs.id = rs.received_by_staff_id
         LEFT JOIN staff pus ON pus.id = rs.pickup_staff_id
         LEFT JOIN LATERAL (
           SELECT u.parts_used, u.completed_by_staff_id, u.started_by_staff_id
             FROM unit_repairs u
            WHERE u.repair_service_id = rs.id
            ORDER BY u.completed_at DESC NULLS LAST, u.id DESC
            LIMIT 1
         ) ur ON true
         LEFT JOIN staff urc ON urc.id = ur.completed_by_staff_id
         LEFT JOIN staff urs ON urs.id = ur.started_by_staff_id
         LEFT JOIN LATERAL (
           SELECT w.assignee_staff_id
             FROM work_assignments w
            WHERE w.organization_id = rs.organization_id
              AND w.entity_type = 'REPAIR'
              AND w.entity_id = rs.id
            ORDER BY w.id DESC
            LIMIT 1
         ) wa ON true
         LEFT JOIN staff was ON was.id = wa.assignee_staff_id
         LEFT JOIN LATERAL (
           SELECT d.signature_url, d.signed_at, d.document_data
             FROM documents d
            WHERE d.organization_id = rs.organization_id
              AND d.entity_type = 'REPAIR'
              AND d.entity_id = rs.id
              AND (d.document_type = 'intake_agreement' OR d.document_type IS NULL)
            ORDER BY d.signed_at DESC NULLS LAST, d.id DESC
            LIMIT 1
         ) intake ON true
         LEFT JOIN LATERAL (
           SELECT d.signature_url, d.document_data
             FROM documents d
            WHERE d.organization_id = rs.organization_id
              AND d.entity_type = 'REPAIR'
              AND d.entity_id = rs.id
              AND d.document_type = 'pickup_agreement'
            ORDER BY d.signed_at DESC NULLS LAST, d.id DESC
            LIMIT 1
         ) pickup ON true
        WHERE rs.organization_id = $1
          AND ${selector}
        ORDER BY rs.created_at ASC NULLS LAST, rs.id ASC`,
      [orgId, selectorValue],
    );

    if (devices.rows.length === 0) return [];
    const repairIds = devices.rows.map((row) => Number(row.id));

    // Bench actions. `repair_actions` carries no org column of its own, so the
    // tenant boundary is the JOIN onto its org-scoped parent — never the id
    // list alone.
    const actions = await client.query<ActionSqlRow>(
      `SELECT a.repair_id, a.action_type, a.part_name, a.old_sku, a.new_sku,
              a.staff_id, s.name AS staff_name
         FROM repair_actions a
         JOIN repair_service rs
           ON rs.id = a.repair_id AND rs.organization_id = $1
         LEFT JOIN staff s ON s.id = a.staff_id
        WHERE a.repair_id = ANY($2::int[])
          AND a.deleted_at IS NULL
        ORDER BY a.created_at ASC, a.id ASC`,
      [orgId, repairIds],
    );

    const actionsByRepair = new Map<number, ActionSqlRow[]>();
    for (const row of actions.rows) {
      const key = Number(row.repair_id);
      const list = actionsByRepair.get(key);
      if (list) list.push(row);
      else actionsByRepair.set(key, [row]);
    }

    return devices.rows.map((row) => {
      const repairId = Number(row.id);
      const bench = actionsByRepair.get(repairId) ?? [];
      const benchStaff = [...bench].reverse().find((a) => a.staff_id != null) ?? null;

      let technicianStaffId: number | null = null;
      let technicianName: string | null = null;
      let technicianSource: VisitTechnicianSource | null = null;
      if (row.ur_completed_staff_id != null) {
        technicianStaffId = Number(row.ur_completed_staff_id);
        technicianName = row.ur_completed_name;
        technicianSource = 'repair_completed';
      } else if (row.ur_started_staff_id != null) {
        technicianStaffId = Number(row.ur_started_staff_id);
        technicianName = row.ur_started_name;
        technicianSource = 'repair_started';
      } else if (benchStaff?.staff_id != null) {
        technicianStaffId = Number(benchStaff.staff_id);
        technicianName = benchStaff.staff_name;
        technicianSource = 'bench_action';
      } else if (row.wa_staff_id != null) {
        technicianStaffId = Number(row.wa_staff_id);
        technicianName = row.wa_staff_name;
        technicianSource = 'assignment';
      }

      const parts = [
        ...normalizeUnitRepairParts(row.parts_used),
        ...bench.map(benchActionAsPart).filter((p): p is VisitRepairPart => p !== null),
      ];

      return {
        repairId,
        rsNumber: (row.ticket_number ?? '').trim(),
        productTitle: (row.product_title ?? '').trim(),
        serialNumber: (row.serial_number ?? '').trim(),
        status: (row.status ?? '').trim(),
        issue: row.issue,
        notes: row.notes,
        receivedAt: normalizePSTTimestamp(row.received_at),
        receivedByStaffName: row.received_by_name,
        deliveredAt: normalizePSTTimestamp(row.delivered_at),
        pickupSignedAt: normalizePSTTimestamp(row.pickup_signed_at),
        pickupStaffName: row.pickup_staff_name,
        labelPrintedAt: normalizePSTTimestamp(row.label_printed_at),
        technicianStaffId,
        technicianName,
        technicianSource,
        parts,
        intakeSignatureUrl: row.intake_signature_url,
        intakeSignedAt: normalizePSTTimestamp(row.intake_signed_at),
        intakeSignatureStrokes: row.intake_strokes ?? null,
        pickupSignatureUrl: row.pickup_signature_url,
        pickupSignatureStrokes: row.pickup_strokes ?? null,
        sourceSystem: row.source_system,
        sourceOrderId: row.source_order_id,
        sourceTrackingNumber: row.source_tracking_number,
        sourceSku: row.source_sku,
      };
    });
  });
}
