/**
 * Resolve one carton's Unbox procedure receipt from the database.
 *
 * ## Why this is a separate module from `./procedure-receipt.ts`
 *
 * The builder there is pure — no DB, no clock — so the derivation guard can feed
 * it the same fact set it feeds the bench. This half imports `tenancy/db`, which
 * transitively pulls the Neon driver. Keeping them in one file would put that
 * whole graph behind any client import of the receipt TYPES
 * (`.claude/rules/build-gotchas.md` → bundle altitude: keep light helpers out of
 * heavy modules). The route imports this; a view imports the types.
 *
 * ## A carton-level receipt over per-LINE facts
 *
 * Condition, item photos, serials and the label print are line facts; the
 * receipt is a carton document. The fold is **every line must satisfy it**, and
 * `at` is the LAST of them — a carton is not graded until every line in it is.
 * Aspect presence in particular is folded PER LINE and then ANDed: summing
 * aspect counts across lines would let one line's "included" and another's
 * "serial" satisfy both requirements for a carton where neither line is
 * complete.
 *
 * ## The variant is composed, never re-derived
 *
 * `isUnfound` / `isLocalPickup` / `isReturn` decide which steps exist at all, so
 * the receipt and the bench must answer them identically. Both call the same
 * pure SoTs (`fulfillment-mode`, `triage-intake-kind`, `kinds/registry`) — this
 * module's job is only to fetch the columns those helpers read.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getReceivingRequiredItemPhotoAspects } from '@/lib/settings/accessors';
import { isLocalPickupFulfillment } from '@/lib/receiving/fulfillment-mode';
import { effectiveIntakeKind } from '@/lib/receiving/kinds/registry';
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
  serial_count: number | string | null;
  serial_last_at: string | null;
  photo_count: number | string | null;
}

interface AspectRow {
  scope: 'carton' | 'line';
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
}

const defaultDeps: ProcedureReceiptDeps = {
  query: <T,>(orgId: OrgId, sql: string, params: unknown[]) =>
    tenantQuery<T & Record<string, unknown>>(orgId, sql, params) as Promise<{ rows: T[] }>,
  requiredItemAspects: async (orgId) => {
    const org = await getOrganization(orgId);
    return org ? getReceivingRequiredItemPhotoAspects(org.settings) : [];
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
       LEFT JOIN staff cg ON cg.id = rlt.condition_graded_by
      WHERE rl.receiving_id = $2::int AND rl.organization_id = $1
      ORDER BY rl.id ASC`,
    [orgId, receivingId],
  );
  const lines = lineRes.rows;

  const aspectRes = await deps.query<AspectRow>(
    orgId,
    `SELECT 'carton'::text AS scope,
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
    // The stage counts the aspect query cannot answer: pre-2026-08-01b photos
    // carry NULL aspect, and they are real evidence. `arrival` in particular is
    // almost entirely un-aspected — it is the door shot, taken before any of
    // this existed.
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

  // ── Fold the per-line facts into the carton's answer ──────────────────────
  //
  // Every fold is "the carton is done when EVERY line is". A carton with one
  // ungraded line is not a graded carton, and saying so would be the receipt's
  // one unforgivable failure.
  const cartonAspectCounts: Partial<Record<PhotoAspect, number>> = {};
  const cartonAspectRows = new Map<PhotoAspect, AspectRow>();
  const lineAspectByLine = new Map<number, Partial<Record<PhotoAspect, number>>>();
  const itemAspectRows: AspectRow[] = [];
  for (const row of aspectRes.rows) {
    const aspect = parsePhotoAspect(row.photo_aspect);
    if (!aspect) continue;
    if (row.scope === 'carton') {
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

  const gates: DeriveCaptureStepStatesInput = {
    vocabulary: {
      isUnfound,
      isLocalPickup: isLocalPickupFulfillment(intakeSource),
      isReturn:
        effectiveIntakeKind(
          firstLine?.line_intake_type || firstLine?.receiving_type,
          carton.carton_intake_type,
        ) === 'RETURN',
    },
    classified: !!(carton.carton_intake_type || firstLine?.line_intake_type),
    arrivalPhotoCount: num(arrival?.n),
    unboxCartonPhotoCount: num(unboxCarton?.n),
    itemPhotoCount: lines.reduce((n, l) => n + num(l.photo_count), 0),
    cartonAspectCounts,
    itemAspectCounts,
    requiredItemAspects,
    conditionGradedAt:
      lines.length > 0 && lines.every((l) => l.condition_graded_at)
        ? latest(lines.map((l) => l.condition_graded_at))
        : null,
    contentsConfirmedAt: carton.contents_confirmed_at,
    photoCount: num(arrival?.n) + num(unboxCarton?.n),
    // Serial facts fold by SUM: the bench's gate is "every expected unit is
    // accounted for", which is the same question one line up.
    serialCount: lines.reduce((n, l) => n + num(l.serial_count), 0),
    serialAbsent: lines.length > 0 && lines.every((l) => l.serial_absent),
    perUnitAbsentCount: lines.reduce((n, l) => n + num(l.per_unit_absent_count), 0),
    quantityExpected: lines.reduce((n, l) => n + num(l.quantity_expected), 0),
  };

  const aspectEvidence = (aspect: PhotoAspect): StepEvidence => {
    const row = cartonAspectRows.get(aspect);
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
    arrival_check: {
      at: arrival?.first_at ?? null,
      byStaffId: arrival?.staff_id ?? null,
      byStaffName: arrival?.staff_name ?? null,
      detail: num(arrival?.n) > 0 ? shots(num(arrival?.n)) : null,
      capturedAt: arrival?.first_captured_at ?? null,
    },
    shipping_label_photo: aspectEvidence('shipping_label'),
    box_photo: aspectEvidence('box_exterior'),
    packing_material: aspectEvidence('packing_material'),
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
  };

  return buildProcedureReceipt({
    gates,
    evidence,
    labelPrintedAt:
      lines.length > 0 && lines.every((l) => l.label_printed_at)
        ? latest(lines.map((l) => l.label_printed_at))
        : null,
    receivedAt: carton.received_at,
  });
}
