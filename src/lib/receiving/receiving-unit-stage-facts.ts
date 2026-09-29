/**
 * Rebuildable Receiving unit projection. Events and domain tables remain the
 * source of truth; this is the one writer for the fast list read model.
 */
import 'server-only';
import { withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ReceivingUnitStageFactView } from '@/lib/receiving/receiving-line-row';

export const RECEIVING_UNIT_STAGE_PROJECTION_VERSION = 1;

export type ReceivingUnitTriageState = 'NOT_STARTED' | 'TRIAGED';
export type ReceivingUnitLabelState = 'MISSING' | 'PRINTED';
export type ReceivingUnitQcState = 'PENDING' | 'TEST_AGAIN' | 'PASSED' | 'FAILED';

type StageFactIds = readonly (number | string | null | undefined)[];

export interface ReceivingUnitStageFactsTarget {
  receivingIds?: StageFactIds;
  lineIds?: StageFactIds;
  serialUnitIds?: StageFactIds;
}

export interface ReceivingUnitStageFactRow extends ReceivingUnitStageFactView {
  organization_id: string;
  projection_version: number;
}

export type ReceivingStageFactsQueryable = {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows?: Array<Record<string, unknown>>; rowCount: number | null }>;
};

function ids(values: StageFactIds | undefined): number[] {
  const out = new Set<number>();
  for (const value of values ?? []) {
    const n = Number(value);
    if (Number.isInteger(n) && n > 0) out.add(n);
  }
  return [...out];
}

export function receivingUnitQcState(verdict: string | null | undefined): ReceivingUnitQcState {
  switch (verdict) {
    case 'PASS':
      return 'PASSED';
    case 'TEST_AGAIN':
      return 'TEST_AGAIN';
    case 'TESTING_FAILED':
      return 'FAILED';
    default:
      return 'PENDING';
  }
}

const FACT_COLUMNS = [
  'receiving_line_id',
  'receiving_id',
  'serial_unit_id',
  'unit_uid',
  'triage_state',
  'label_state',
  'qc_state',
  'latest_verdict',
  'tested_at',
  'tested_by',
  'primary_support_ticket_id',
  'projection_version',
] as const;

/** Build the one projection refresh statement; `targetSql` predicates `rlu`. */
export function buildReceivingUnitStageFactsRefreshSql(targetSql: string): string {
  return `
    INSERT INTO receiving_unit_stage_facts AS f (
      organization_id, receiving_line_unit_id, receiving_line_id, receiving_id,
      serial_unit_id, unit_uid, triage_state, label_state, qc_state,
      latest_verdict, tested_at, tested_by, primary_support_ticket_id,
      projection_version, updated_at
    )
    SELECT
      rlu.organization_id,
      rlu.id,
      rlu.receiving_line_id,
      rl.receiving_id,
      rlu.serial_unit_id,
      su.unit_uid,
      CASE WHEN COALESCE(rt.triage_complete, false) THEN 'TRIAGED' ELSE 'NOT_STARTED' END,
      CASE WHEN label_job.id IS NOT NULL THEN 'PRINTED' ELSE 'MISSING' END,
      CASE latest_test.verdict
        WHEN 'PASS' THEN 'PASSED'
        WHEN 'TEST_AGAIN' THEN 'TEST_AGAIN'
        WHEN 'TESTING_FAILED' THEN 'FAILED'
        ELSE 'PENDING'
      END,
      latest_test.verdict,
      latest_test.created_at,
      latest_test.tested_by,
      primary_ticket.support_ticket_id,
      ${RECEIVING_UNIT_STAGE_PROJECTION_VERSION},
      now()
    FROM receiving_line_unit rlu
    JOIN receiving_line rl
      ON rl.id = rlu.receiving_line_id
     AND rl.organization_id = rlu.organization_id
    LEFT JOIN receiving_triage rt
      ON rt.receiving_id = rl.receiving_id
     AND rt.organization_id = rl.organization_id
    LEFT JOIN serial_units su
      ON su.id = rlu.serial_unit_id
     AND su.organization_id = rlu.organization_id
    LEFT JOIN LATERAL (
      SELECT tr.verdict, tr.created_at, tr.tested_by
        FROM testing_results tr
       WHERE tr.organization_id = rlu.organization_id
         AND tr.serial_unit_id = rlu.serial_unit_id
       ORDER BY tr.created_at DESC, tr.id DESC
       LIMIT 1
    ) latest_test ON TRUE
    LEFT JOIN LATERAL (
      SELECT lpj.id
        FROM label_print_jobs lpj
       WHERE lpj.organization_id = rlu.organization_id
         AND lpj.serial_unit_id = rlu.serial_unit_id
       ORDER BY lpj.created_at DESC, lpj.id DESC
       LIMIT 1
    ) label_job ON TRUE
    LEFT JOIN LATERAL (
      SELECT tl.support_ticket_id
        FROM ticket_links tl
       WHERE tl.organization_id = rlu.organization_id
         AND (
           (rlu.serial_unit_id IS NOT NULL AND tl.entity_type = 'SERIAL_UNIT' AND tl.entity_id = rlu.serial_unit_id)
           OR (tl.entity_type = 'RECEIVING_LINE' AND tl.entity_id = rl.id)
           OR (rl.receiving_id IS NOT NULL AND tl.entity_type = 'RECEIVING' AND tl.entity_id = rl.receiving_id)
         )
       ORDER BY
         CASE tl.entity_type WHEN 'SERIAL_UNIT' THEN 0 WHEN 'RECEIVING_LINE' THEN 1 ELSE 2 END,
         tl.is_primary DESC,
         tl.created_at DESC,
         tl.id DESC
       LIMIT 1
    ) primary_ticket ON TRUE
    WHERE rlu.organization_id = $1
      AND ${targetSql}
    ON CONFLICT (organization_id, receiving_line_unit_id) DO UPDATE SET
      ${FACT_COLUMNS.map((column) => `${column} = EXCLUDED.${column}`).join(',\n      ')},
      updated_at = EXCLUDED.updated_at
    WHERE (${FACT_COLUMNS.map((column) => `f.${column}`).join(', ')})
          IS DISTINCT FROM
          (${FACT_COLUMNS.map((column) => `EXCLUDED.${column}`).join(', ')})`;
}

const TARGET_SQL = `(
      rlu.receiving_line_id = ANY($2::int[])
      OR rlu.serial_unit_id = ANY($3::int[])
      OR rl.receiving_id = ANY($4::int[])
    )`;

const REFRESH_TARGET_SQL = buildReceivingUnitStageFactsRefreshSql(TARGET_SQL);
const REFRESH_ALL_SQL = buildReceivingUnitStageFactsRefreshSql('TRUE');

/** Recompute only physical units touched by a domain writer. */
export async function refreshReceivingUnitStageFacts(
  orgId: OrgId,
  target: ReceivingUnitStageFactsTarget,
  client?: ReceivingStageFactsQueryable,
): Promise<number> {
  const lineIds = ids(target.lineIds);
  const serialUnitIds = ids(target.serialUnitIds);
  const receivingIds = ids(target.receivingIds);
  if (lineIds.length + serialUnitIds.length + receivingIds.length === 0) return 0;
  const params = [orgId, lineIds, serialUnitIds, receivingIds];
  const run = (db: ReceivingStageFactsQueryable) =>
    db.query(REFRESH_TARGET_SQL, params).then((result) => result.rowCount ?? 0);
  return client ? run(client) : withTenantConnection(orgId, run);
}

/** Bounded by tenant: rebuild every physical Receiving unit for one org. */
export async function refreshAllReceivingUnitStageFacts(
  orgId: OrgId,
  client?: ReceivingStageFactsQueryable,
): Promise<number> {
  const run = (db: ReceivingStageFactsQueryable) =>
    db.query(REFRESH_ALL_SQL, [orgId]).then((result) => result.rowCount ?? 0);
  return client ? run(client) : withTenantConnection(orgId, run);
}

/** Fast read for Phase 4: one indexed projection lookup, with no event-table laterals. */
export async function listReceivingUnitStageFacts(
  orgId: OrgId,
  lineIdsInput: StageFactIds,
  client?: ReceivingStageFactsQueryable,
): Promise<Map<number, ReceivingUnitStageFactRow[]>> {
  const lineIds = ids(lineIdsInput);
  const grouped = new Map<number, ReceivingUnitStageFactRow[]>();
  if (lineIds.length === 0) return grouped;
  const run = (db: ReceivingStageFactsQueryable) =>
    db.query(
      `SELECT f.organization_id::text, f.receiving_line_unit_id, f.receiving_line_id,
              f.receiving_id, f.serial_unit_id, f.unit_uid, f.triage_state, f.label_state,
              f.qc_state, f.latest_verdict, f.tested_at::text, f.tested_by,
              tester.name AS tested_by_name,
              f.primary_support_ticket_id, f.projection_version, f.updated_at::text,
              rlu.ordinal, rlu.condition_grade::text AS condition_grade,
              su.serial_number AS serial
         FROM receiving_unit_stage_facts f
         JOIN receiving_line_unit rlu
           ON rlu.organization_id = f.organization_id
          AND rlu.id = f.receiving_line_unit_id
         LEFT JOIN serial_units su
           ON su.organization_id = f.organization_id
          AND su.id = f.serial_unit_id
         LEFT JOIN staff tester
           ON tester.organization_id = f.organization_id
          AND tester.id = f.tested_by
        WHERE f.organization_id = $1 AND f.receiving_line_id = ANY($2::int[])
        ORDER BY f.receiving_line_id ASC, rlu.ordinal ASC`,
      [orgId, lineIds],
    );
  const result = client ? await run(client) : await withTenantConnection(orgId, run);
  for (const raw of result.rows ?? []) {
    const row: ReceivingUnitStageFactRow = {
      organization_id: String(raw.organization_id),
      receiving_line_unit_id: Number(raw.receiving_line_unit_id),
      receiving_line_id: Number(raw.receiving_line_id),
      receiving_id: raw.receiving_id == null ? null : Number(raw.receiving_id),
      ordinal: Number(raw.ordinal),
      serial_unit_id: raw.serial_unit_id == null ? null : Number(raw.serial_unit_id),
      unit_uid: raw.unit_uid == null ? null : String(raw.unit_uid),
      serial: raw.serial == null ? null : String(raw.serial),
      condition_grade: raw.condition_grade == null ? null : String(raw.condition_grade),
      triage_state: raw.triage_state as ReceivingUnitTriageState,
      label_state: raw.label_state as ReceivingUnitLabelState,
      qc_state: raw.qc_state as ReceivingUnitQcState,
      latest_verdict: raw.latest_verdict == null ? null : String(raw.latest_verdict),
      tested_at: raw.tested_at == null ? null : String(raw.tested_at),
      tested_by: raw.tested_by == null ? null : Number(raw.tested_by),
      tested_by_name: raw.tested_by_name == null ? null : String(raw.tested_by_name),
      primary_support_ticket_id:
        raw.primary_support_ticket_id == null ? null : Number(raw.primary_support_ticket_id),
      projection_version: Number(raw.projection_version),
      updated_at: String(raw.updated_at),
    };
    const bucket = grouped.get(row.receiving_line_id);
    if (bucket) bucket.push(row);
    else grouped.set(row.receiving_line_id, [row]);
  }
  return grouped;
}

export const RECEIVING_UNIT_STAGE_FACTS_JOIN = `
  LEFT JOIN receiving_unit_stage_facts rusf
    ON rusf.organization_id = rlu.organization_id
   AND rusf.receiving_line_unit_id = rlu.id`;
