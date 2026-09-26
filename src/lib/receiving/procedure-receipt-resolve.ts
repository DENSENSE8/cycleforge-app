/** Resolve one carton's Unbox procedure receipt from the database. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getOrganization } from '@/lib/tenancy/organizations';
import {
  getReceivingRequiredItemPhotoAspects,
  getReceivingUnboxFlowCaptureOrderRaw,
} from '@/lib/settings/accessors';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import { effectiveIntakeKind } from '@/lib/receiving/kinds/registry';
import { resolveContextFromFlags } from '@/lib/stations/procedure';
import { parseUnboxFlowCaptureOrder } from '@/lib/stations/unbox-flow-capture-order';
import { parsePhotoAspect, type PhotoAspect } from '@/lib/photos/photo-aspects';
import {
  buildProcedureReceipt,
  type ProcedureReceipt,
  type StepEvidence,
} from './procedure-receipt';
import type { DeriveCaptureStepStatesInput } from '@/components/receiving/workspace/derive-capture-step-states';

interface CartonRow {
  id: number;
  received_at: string | null;
  carton_intake_type: string | null;
  receiving_source: string | null;
  carrier: string | null;
  zoho_purchaseorder_number: string | null;
  tracking_number: string | null;
  contents_confirmed_at: string | null;
  contents_confirmed_by: number | null;
  contents_confirmed_by_name: string | null;
  classified_at: string | null;
}

interface LineRow {
  id: number;
  quantity_expected: number | string | null;
  line_intake_type: string | null;
  receiving_type: string | null;
  zoho_purchaseorder_id: string | null;
  condition_graded_at: string | null;
  condition_graded_by: number | null;
  condition_graded_by_name: string | null;
  serial_absent: boolean;
  per_unit_absent_count: number | string | null;
  label_printed_at: string | null;
  label_previewed_at: string | null;
  staged_at: string | null;
  serial_count: number | string | null;
  serial_last_at: string | null;
  photo_count: number | string | null;
}

interface AspectRow {
  /** Door (`arrival_package`) · bench carton · per-line item aspects. */
  scope: 'arrival' | 'carton' | 'line';
  line_id: number | null;
  photo_aspect: string | null;
  n: number | string;
  first_at: string;
  last_at: string;
  first_captured_at: string | null;
  staff_id: number | null;
  staff_name: string | null;
}

interface StageRow {
  scope: 'arrival' | 'unbox_carton' | 'item';
  n: number | string;
  first_at: string | null;
  staff_id: number | null;
  staff_name: string | null;
  first_captured_at: string | null;
}

interface ProcedureReceiptDeps {
  query: <T>(orgId: OrgId, sql: string, params: unknown[]) => Promise<{ rows: T[] }>;
  requiredItemAspects: (orgId: OrgId) => Promise<readonly PhotoAspect[]>;
  /** Org SOP JSON string for Unbox capture-step order (dogfood DnD). */
  unboxFlowCaptureOrderRaw: (orgId: OrgId) => Promise<string>;
}

const defaultDeps: ProcedureReceiptDeps = {
  query: <T,>(orgId: OrgId, sql: string, params: unknown[]) =>
    tenantQuery<T & Record<string, unknown>>(orgId, sql, params) as Promise<{ rows: T[] }>,
  requiredItemAspects: async (orgId) => {
    const org = await getOrganization(orgId);
    return org ? getReceivingRequiredItemPhotoAspects(org.settings) : [];
  },
  unboxFlowCaptureOrderRaw: async (orgId) => {
    const org = await getOrganization(orgId);
    return org ? getReceivingUnboxFlowCaptureOrderRaw(org.settings) : '{}';
  },
};

const num = (v: number | string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** The LAST of a set of instants — a carton-level fact lands when its last line does. */
function latest(values: Array<string | null>): string | null {
  let best: string | null = null;
  for (const v of values) {
    if (!v) continue;
    if (best === null || Date.parse(v) > Date.parse(best)) best = v;
  }
  return best;
}

const shots = (n: number) => (n === 1 ? '1 photo' : `${n} photos`);

/**
 * The whole receipt for one carton, or `null` when no such carton exists in
 * this org (the route maps that to a 404).
 */
export async function resolveUnboxProcedureReceipt(
  orgId: OrgId,
  receivingId: number,
  deps: ProcedureReceiptDeps = defaultDeps,
): Promise<ProcedureReceipt | null> {
  const cartonRes = await deps.query<CartonRow>(
    orgId,
    `SELECT r.id,
            r.received_at::text                 AS received_at,
            r.intake_type                       AS carton_intake_type,
            r.source                            AS receiving_source,
            r.carrier                           AS carrier,
            r.zoho_purchaseorder_number         AS zoho_purchaseorder_number,
            stn.tracking_number_raw             AS tracking_number,
            ru.contents_confirmed_at::text      AS contents_confirmed_at,
            ru.contents_confirmed_by            AS contents_confirmed_by,
            cs.name                             AS contents_confirmed_by_name,
            -- The classify ACT has no stamp of its own; the closest attested
            -- instant is the audit entry the classify PATCH writes. Falling back
            -- to the door scan would date the classification to the moment the
            -- box arrived, which is usually a different person on a different day.
            (SELECT MIN(al.created_at)::text
               FROM audit_logs al
              WHERE al.organization_id = r.organization_id
                AND al.entity_type = 'receiving'
                AND al.entity_id = r.id::text
                AND al.action = 'receiving.header.update') AS classified_at
       FROM receiving_carton r
       LEFT JOIN receiving_unbox ru
              ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
       LEFT JOIN staff cs ON cs.id = ru.contents_confirmed_by
      WHERE r.id = $2::int AND r.organization_id = $1
      LIMIT 1`,
    [orgId, receivingId],
  );
  const carton = cartonRes.rows[0];
  if (!carton) return null;

  const lineRes = await deps.query<LineRow>(
    orgId,
    `SELECT rl.id,
            rl.quantity_expected,
            rl.intake_type                      AS line_intake_type,
            rl.receiving_type,
            rz.zoho_purchaseorder_id,
            rlt.condition_graded_at::text       AS condition_graded_at,
            rlt.condition_graded_by,
            cg.name                             AS condition_graded_by_name,
            COALESCE(rlt.serial_absent, false)  AS serial_absent,
            rlt.label_printed_at::text          AS label_printed_at,
            rlt.label_previewed_at::text        AS label_previewed_at,
            rlp.staged_at::text                 AS staged_at,
            (SELECT COUNT(*) FROM receiving_line_unit rlu
              WHERE rlu.receiving_line_id = rl.id
                AND rlu.organization_id = rl.organization_id
                AND rlu.serial_absent)                       AS per_unit_absent_count,
            -- Serial COUNT comes from the projection the bench itself reads
            -- (rlt.serial_projection, which the line SQL exposes as row.serials),
            -- not from a hand-rolled join. serial_units has no receiving_line_id:
            -- which line a serial currently belongs to is resolved by
            -- serial-projection.ts, and re-deriving it here would be a second
            -- answer to a question that already has an SoT.
            jsonb_array_length(COALESCE(rlt.serial_projection, '[]'::jsonb))  AS serial_count,
            -- The TIME is origin-based: when did a serial first get created
            -- against this line. A serial that later moved to another PO still
            -- landed here when it landed, which is what a receipt records.
            (SELECT MAX(su.created_at)::text
               FROM serial_unit_provenance p
               JOIN serial_units su
                 ON su.id = p.serial_unit_id AND su.organization_id = p.organization_id
              WHERE p.organization_id = rl.organization_id
                AND p.origin_type = 'RECEIVING_LINE'
                AND p.origin_id = rl.id)                     AS serial_last_at,
            (SELECT COUNT(DISTINCT p.id)
               FROM photos p
               INNER JOIN photo_entity_links l
                       ON l.photo_id = p.id AND l.organization_id = p.organization_id
              WHERE p.organization_id = rl.organization_id
                AND l.entity_type = 'RECEIVING_LINE'
                AND l.entity_id = rl.id)                     AS photo_count
       FROM receiving_line rl
       LEFT JOIN receiving_line_testing rlt
              ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
       LEFT JOIN receiving_line_zoho rz
              ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
       LEFT JOIN receiving_line_putaway rlp
              ON rlp.receiving_line_id = rl.id AND rlp.organization_id = rl.organization_id
       LEFT JOIN staff cg ON cg.id = rlt.condition_graded_by
      WHERE rl.receiving_id = $2::int AND rl.organization_id = $1
      ORDER BY rl.id ASC`,
    [orgId, receivingId],
  );
  const lines = lineRes.rows;

  const aspectRes = await deps.query<AspectRow>(
    orgId,
    `SELECT 'arrival'::text AS scope,
            NULL::int      AS line_id,
            p.photo_aspect,
            COUNT(DISTINCT p.id)          AS n,
            MIN(p.created_at)::text       AS first_at,
            MAX(p.created_at)::text       AS last_at,
            MIN(p.client_captured_at)::text AS first_captured_at,
            MIN(p.taken_by_staff_id)      AS staff_id,
            NULL::text                    AS staff_name
       FROM photos p
       INNER JOIN photo_entity_links l
               ON l.photo_id = p.id AND l.organization_id = p.organization_id
      WHERE p.organization_id = $1
        AND l.entity_type = 'RECEIVING'
        AND l.entity_id = $2::int
        AND p.photo_aspect IS NOT NULL
        AND COALESCE(p.photo_type, '') IN ('receiving_package', 'receiving', '')
      GROUP BY p.photo_aspect
      UNION ALL
     SELECT 'carton'::text AS scope,
            NULL::int      AS line_id,
            p.photo_aspect,
            COUNT(DISTINCT p.id)          AS n,
            MIN(p.created_at)::text       AS first_at,
            MAX(p.created_at)::text       AS last_at,
            MIN(p.client_captured_at)::text AS first_captured_at,
            MIN(p.taken_by_staff_id)      AS staff_id,
            NULL::text                    AS staff_name
       FROM photos p
       INNER JOIN photo_entity_links l
               ON l.photo_id = p.id AND l.organization_id = p.organization_id
      WHERE p.organization_id = $1
        AND l.entity_type = 'RECEIVING'
        AND l.entity_id = $2::int
        AND p.photo_aspect IS NOT NULL
        AND p.photo_type = 'receiving_unbox_carton'
      GROUP BY p.photo_aspect
      UNION ALL
     SELECT 'line'::text,
            l.entity_id::int,
            p.photo_aspect,
            COUNT(DISTINCT p.id),
            MIN(p.created_at)::text,
            MAX(p.created_at)::text,
            MIN(p.client_captured_at)::text,
            MIN(p.taken_by_staff_id),
            NULL::text
       FROM photos p
       INNER JOIN photo_entity_links l
               ON l.photo_id = p.id AND l.organization_id = p.organization_id
       INNER JOIN receiving_line rl
               ON rl.id = l.entity_id AND rl.organization_id = p.organization_id
      WHERE p.organization_id = $1
        AND l.entity_type = 'RECEIVING_LINE'
        AND rl.receiving_id = $2::int
        AND p.photo_aspect IS NOT NULL
      GROUP BY l.entity_id, p.photo_aspect`,
    [orgId, receivingId],
  );

  const stageRes = await deps.query<StageRow>(
    orgId,
    // The stage counts the aspect query cannot answer:
    `SELECT 'arrival'::text AS scope,
            COUNT(DISTINCT p.id)            AS n,
            MIN(p.created_at)::text         AS first_at,
            MIN(p.taken_by_staff_id)        AS staff_id,
            NULL::text                      AS staff_name,
            MIN(p.client_captured_at)::text AS first_captured_at
       FROM photos p
       INNER JOIN photo_entity_links l
               ON l.photo_id = p.id AND l.organization_id = p.organization_id
      WHERE p.organization_id = $1
        AND l.entity_type = 'RECEIVING'
        AND l.entity_id = $2::int
        AND COALESCE(p.photo_type, '') IN ('receiving_package', 'receiving', '')
      UNION ALL
     SELECT 'unbox_carton'::text,
            COUNT(DISTINCT p.id),
            MIN(p.created_at)::text,
            MIN(p.taken_by_staff_id),
            NULL::text,
            MIN(p.client_captured_at)::text
       FROM photos p
       INNER JOIN photo_entity_links l
               ON l.photo_id = p.id AND l.organization_id = p.organization_id
      WHERE p.organization_id = $1
        AND l.entity_type = 'RECEIVING'
        AND l.entity_id = $2::int
        AND p.photo_type = 'receiving_unbox_carton'`,
    [orgId, receivingId],
  );

  const stage = new Map(stageRes.rows.map((r) => [r.scope, r]));
  const arrival = stage.get('arrival');
  const unboxCarton = stage.get('unbox_carton');

  const requiredItemAspects = await deps.requiredItemAspects(orgId);
  const captureOrderMap = parseUnboxFlowCaptureOrder(
    await deps.unboxFlowCaptureOrderRaw(orgId),
  );

  // ── Fold the per-line facts into the carton's answer ──────────────────────
  const arrivalAspectCounts: Partial<Record<PhotoAspect, number>> = {};
  const arrivalAspectRows = new Map<PhotoAspect, AspectRow>();
  const cartonAspectCounts: Partial<Record<PhotoAspect, number>> = {};
  const cartonAspectRows = new Map<PhotoAspect, AspectRow>();
  const lineAspectByLine = new Map<number, Partial<Record<PhotoAspect, number>>>();
  const itemAspectRows: AspectRow[] = [];
  for (const row of aspectRes.rows) {
    const aspect = parsePhotoAspect(row.photo_aspect);
    if (!aspect) continue;
    if (row.scope === 'arrival') {
      arrivalAspectCounts[aspect] = (arrivalAspectCounts[aspect] ?? 0) + num(row.n);
      arrivalAspectRows.set(aspect, row);
    } else if (row.scope === 'carton') {
      cartonAspectCounts[aspect] = (cartonAspectCounts[aspect] ?? 0) + num(row.n);
      cartonAspectRows.set(aspect, row);
    } else if (row.line_id != null) {
      const forLine = lineAspectByLine.get(row.line_id) ?? {};
      forLine[aspect] = (forLine[aspect] ?? 0) + num(row.n);
      lineAspectByLine.set(row.line_id, forLine);
      itemAspectRows.push(row);
    }
  }

  const everyLineHasRequiredAspects =
    lines.length > 0 &&
    lines.every((line) => {
      const counts = lineAspectByLine.get(line.id) ?? {};
      // Mirror the bench's fallback exactly: with no required aspects the org
      // has said "any item photo counts".
      if (requiredItemAspects.length === 0) return num(line.photo_count) > 0;
      return requiredItemAspects.every((a) => (counts[a] ?? 0) > 0);
    });

  // The gate input is expressed for the WHOLE carton, so the per-line facts are
  // folded into it: a "satisfied" aspect count means every line has it.
  const itemAspectCounts: Partial<Record<PhotoAspect, number>> = {};
  if (everyLineHasRequiredAspects) {
    for (const a of requiredItemAspects) itemAspectCounts[a] = 1;
  }

  const firstLine = lines[0];
  const isUnfound = lines.length === 0 || lines.every((l) => !l.zoho_purchaseorder_id);
  const intakeSource = {
    receiving_source: carton.receiving_source,
    receiving_type: firstLine?.receiving_type ?? null,
    carton_intake_type: carton.carton_intake_type,
    intake_type: firstLine?.line_intake_type ?? null,
    carrier: carton.carrier,
    tracking_number: carton.tracking_number,
    // Dropped from receiving_line 2026-04-15; the pure helper handles null.
    zoho_reference_number: null,
    zoho_purchaseorder_number: carton.zoho_purchaseorder_number,
    zoho_purchaseorder_id: firstLine?.zoho_purchaseorder_id ?? null,
  };

  const vocabularyBase = resolveContextFromFlags({
    isUnfound,
    isLocalPickup: isLocalPickupFulfillment(intakeSource),
    isReturn:
      effectiveIntakeKind(
        firstLine?.line_intake_type || firstLine?.receiving_type,
        carton.carton_intake_type,
      ) === 'RETURN',
  });
  const captureOrderOverride = captureOrderMap[vocabularyBase.flow];
  const vocabulary = captureOrderOverride?.length
    ? {
        ...vocabularyBase,
        modifiers: {
          ...vocabularyBase.modifiers,
          captureOrderOverride,
        },
      }
    : vocabularyBase;

  const gates: DeriveCaptureStepStatesInput = {
    vocabulary,
    classified: !!(carton.carton_intake_type || firstLine?.line_intake_type),
    arrivalPhotoCount: num(arrival?.n),
    unboxCartonPhotoCount: num(unboxCarton?.n),
    itemPhotoCount: lines.reduce((n, l) => n + num(l.photo_count), 0),
    arrivalAspectCounts,
    cartonAspectCounts,
    itemAspectCounts,
    requiredItemAspects,
    conditionGradedAt:
      lines.length > 0 && lines.every((l) => l.condition_graded_at)
        ? latest(lines.map((l) => l.condition_graded_at))
        : null,
    contentsConfirmedAt: carton.contents_confirmed_at,
    // Folded like the grade:
    labelPreviewedAt:
      lines.length > 0 && lines.every((l) => l.label_previewed_at)
        ? latest(lines.map((l) => l.label_previewed_at))
        : null,
    photoCount: num(arrival?.n) + num(unboxCarton?.n),
    // Serial facts fold by SUM: the bench's gate is "every expected unit is
    // accounted for", which is the same question one line up.
    serialCount: lines.reduce((n, l) => n + num(l.serial_count), 0),
    serialAbsent: lines.length > 0 && lines.every((l) => l.serial_absent),
    perUnitAbsentCount: lines.reduce((n, l) => n + num(l.per_unit_absent_count), 0),
    quantityExpected: lines.reduce((n, l) => n + num(l.quantity_expected), 0),
  };

  const aspectEvidence = (
    rows: Map<PhotoAspect, AspectRow>,
    aspect: PhotoAspect,
  ): StepEvidence => {
    const row = rows.get(aspect);
    if (!row) return {};
    return {
      at: row.first_at,
      byStaffId: row.staff_id,
      byStaffName: row.staff_name,
      detail: shots(num(row.n)),
      capturedAt: row.first_captured_at,
    };
  };

  const evidence: Record<string, StepEvidence> = {
    classify: {
      at: carton.classified_at,
      detail: carton.carton_intake_type ?? firstLine?.line_intake_type ?? null,
    },
    arrival_label_photo: aspectEvidence(arrivalAspectRows, 'shipping_label'),
    arrival_box_photo: aspectEvidence(arrivalAspectRows, 'box_exterior'),
    shipping_label_photo: aspectEvidence(cartonAspectRows, 'shipping_label'),
    box_photo: aspectEvidence(cartonAspectRows, 'box_exterior'),
    packing_material: aspectEvidence(cartonAspectRows, 'packing_material'),
    contents: {
      at: carton.contents_confirmed_at,
      byStaffId: carton.contents_confirmed_by,
      byStaffName: carton.contents_confirmed_by_name,
    },
    condition: {
      at: gates.conditionGradedAt,
      // Attributed only when ONE person graded the whole carton. Naming the
      // last grader for a carton two people worked would be a plausible lie.
      byStaffId:
        new Set(lines.map((l) => l.condition_graded_by)).size === 1
          ? (firstLine?.condition_graded_by ?? null)
          : null,
      byStaffName:
        new Set(lines.map((l) => l.condition_graded_by)).size === 1
          ? (firstLine?.condition_graded_by_name ?? null)
          : null,
    },
    item_photos: {
      at: latest(itemAspectRows.map((r) => r.last_at)),
      detail: gates.itemPhotoCount > 0 ? shots(gates.itemPhotoCount) : null,
      capturedAt: null,
    },
    serial: {
      at: latest(lines.map((l) => l.serial_last_at)),
      detail:
        gates.quantityExpected > 1
          ? `${gates.serialCount} of ${gates.quantityExpected}`
          : gates.serialCount > 0
            ? 'Captured'
            : null,
    },
    label: { at: gates.labelPreviewedAt },
  };

  // The instants the shared derivation hangs on each step.
  gates.evidenceAt = Object.fromEntries(
    Object.entries(evidence).map(([key, e]) => [key, e.at ?? null]),
  );

  return buildProcedureReceipt({
    gates,
    evidence,
    labelPrintedAt:
      lines.length > 0 && lines.every((l) => l.label_printed_at)
        ? latest(lines.map((l) => l.label_printed_at))
        : null,
    stagedAt:
      lines.length > 0 && lines.every((l) => l.staged_at)
        ? latest(lines.map((l) => l.staged_at))
        : null,
    receivedAt: carton.received_at,
  });
}
