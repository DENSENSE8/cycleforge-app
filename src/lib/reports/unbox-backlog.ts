/**
 * "How many boxes are left to be unboxed?" — the receiving backlog, as a report.
 *
 * ## What a "box" is
 *
 * One row of `receiving_carton` (the spine formerly named `receiving`). One
 * carton is one physical box an operator picks up and opens — NOT one item and
 * not one line. The items inside are `receiving_line` rows; how many units are
 * expected inside is `SUM(receiving_line.quantity_expected)`.
 *
 * ## What "left to be unboxed" is
 *
 * The carton is in the building and nobody has finished opening it:
 *
 *   - `receiving_unbox.unboxed_at IS NULL` — the unbox milestone is unstamped.
 *   - and it physically arrived: a triage door scan (`receiving_triage
 *     .door_received_at`) OR at least one `receiving_scans` row.
 *
 * That is the same predicate the triage "to unbox" queue uses
 * (`src/lib/receiving/lines/build-sql.ts`), so the number an owner reads here
 * is the number the bench sees. A carton with `receiving_unbox.opened_at` set
 * but `unboxed_at` still NULL is HALF DONE — on the bench, abandoned mid-open —
 * and gets its own KPI, because that is the cheapest work in the pile.
 *
 * ## The blind spot, stated on the report
 *
 * A carrier can deliver a package that never gets scanned at the dock. It is
 * physically here and it is NOT in this count, because nothing in the database
 * says it arrived. That is a different hunt, with its own queue:
 * `/api/receiving-lines/incoming/delivered-unscanned`.
 *
 * Bucketing and every verdict happen in TypeScript over bounded, pre-grouped
 * rows, so the arithmetic is unit-testable without a database.
 */

import { z } from 'zod';
import {
  OPERATOR_TZ,
  count,
  days,
  emptyReport,
  operatorStamp,
  reportEnvelope,
  statusBelow,
} from '@/lib/reports/report-kit';
import type { ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type {
  ArtifactReport,
  ArtifactReportKpi,
  ArtifactReportSection,
  ArtifactReportStandard,
} from '@/lib/assistant/ui-artifacts';
import type { AssistantToolCtx, AssistantToolDeps } from '@/lib/assistant/tools/types';

const TITLE = 'Unbox backlog';
const QUESTION = 'How many boxes are left to be unboxed?';

/** Rows the section can print before it stops being a list and becomes a dump. */
const DETAIL_LIMIT = 100;

/**
 * Age bands, in whole operator-calendar days. `Today` is 0 — a carton that
 * arrived this morning is not "1 day old" just because a clock crossed an hour.
 */
const AGE_BUCKETS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: 'Today', min: 0, max: 0 },
  { label: '1 day', min: 1, max: 1 },
  { label: '2-3 days', min: 2, max: 3 },
  { label: '4-7 days', min: 4, max: 7 },
  { label: '8+ days', min: 8, max: Number.POSITIVE_INFINITY },
];

const NOTES: readonly string[] = [
  'Left to be unboxed = a carton that arrived (triage door scan, or at least one receiving scan) and whose unbox milestone is unstamped (receiving_unbox.unboxed_at IS NULL). Same predicate as the triage "to unbox" queue, so this count matches the bench.',
  'A carton is ONE physical box, not one item. Units are SUM(receiving_line.quantity_expected) across the lines on the carton; a line with no expected quantity counts as 0.',
  'There is no weight or dimension column on a carton, so this report offers no volume, tonnage or "how long will it take" estimate. Sizing the pile is done by box count and units only.',
  'Blind spot: a carrier-delivered package that was never scanned at the dock is physically here but NOT in this count — nothing recorded its arrival. That hunt is the delivered-but-unscanned queue at /api/receiving-lines/incoming/delivered-unscanned.',
];

const FOLLOW_UPS: ReadonlyArray<{ label: string; question: string }> = [
  { label: 'Oldest box', question: 'Show me the oldest box waiting to be unboxed' },
  {
    label: 'Delivered but never scanned',
    question: 'Which delivered packages were never scanned at the dock?',
  },
];

function backlogStandards(): ArtifactReportStandard[] {
  return [
    {
      label: 'Bucket · Today',
      value: '0',
      unit: 'days',
      note: `Whole calendar days in ${OPERATOR_TZ} between the arrival date and today.`,
    },
    { label: 'Bucket · 1 day', value: '1', unit: 'days', note: null },
    { label: 'Bucket · 2-3 days', value: '2–3', unit: 'days', note: null },
    { label: 'Bucket · 4-7 days', value: '4–7', unit: 'days', note: null },
    { label: 'Bucket · 8+ days', value: '8+', unit: 'days', note: null },
    {
      label: 'Backlog predicate',
      value: 'arrived AND unboxed_at IS NULL',
      unit: null,
      note: 'A carton counts when it has a triage door scan or a receiving scan, and receiving_unbox.unboxed_at is still NULL.',
    },
    {
      label: 'Arrival timestamp',
      value: 'door → scan time → created',
      unit: null,
      note: 'Age is measured from COALESCE(receiving_triage.door_received_at, receiving_carton.receiving_date_time, receiving_carton.created_at).',
    },
  ];
}

// ─── SQL ─────────────────────────────────────────────────────────────────────

/**
 * The backlog, one row per carton, with its age in operator-calendar days and
 * its line/unit rollup. Every statement leads with `organization_id = $1`; the
 * two optional filters are bound parameters, never interpolated text.
 */
const BACKLOG_CTE = `WITH backlog AS (
    SELECT
      r.id                                   AS carton_id,
      r.is_return                            AS is_return,
      r.is_priority                          AS is_priority,
      COALESCE(r.source, 'unknown')          AS source,
      r.zoho_purchaseorder_number            AS po_number,
      rt.pairing_state                       AS pairing_state,
      ru.opened_at                           AS opened_at,
      COALESCE(rt.door_received_at, r.receiving_date_time, r.created_at) AS arrived_at,
      GREATEST(
        0,
        (NOW() AT TIME ZONE '${OPERATOR_TZ}')::date
          - (COALESCE(rt.door_received_at, r.receiving_date_time, r.created_at)
               AT TIME ZONE '${OPERATOR_TZ}')::date
      )                                      AS age_days,
      COALESCE(ln.lines_ct, 0)               AS lines_ct,
      COALESCE(ln.units_ct, 0)               AS units_ct
    FROM receiving_carton r
    LEFT JOIN receiving_triage rt
      ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
    LEFT JOIN receiving_unbox ru
      ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
    LEFT JOIN LATERAL (
      SELECT COUNT(rl.id) AS lines_ct, COALESCE(SUM(rl.quantity_expected), 0) AS units_ct
      FROM receiving_line rl
      WHERE rl.receiving_id = r.id
        AND rl.organization_id = r.organization_id
    ) ln ON TRUE
    WHERE r.organization_id = $1
      AND ru.unboxed_at IS NULL
      AND (
        rt.door_received_at IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM receiving_scans rs
          WHERE rs.receiving_id = r.id
            AND rs.organization_id = r.organization_id
        )
      )
      AND ($2::text IS NULL OR COALESCE(r.source, 'unknown') = $2::text)
      AND ($3::boolean IS NOT TRUE OR r.is_return IS TRUE)
  )`;

/** Grouped by age so the row count is bounded by distinct ages, not by cartons. */
const AGE_SQL = `${BACKLOG_CTE}
  SELECT
    b.age_days                                              AS age_days,
    COUNT(*)                                                AS boxes,
    SUM(b.units_ct)                                         AS units,
    COUNT(*) FILTER (WHERE b.opened_at IS NOT NULL)         AS on_bench,
    COUNT(*) FILTER (WHERE b.is_return IS TRUE)             AS returns_ct,
    COUNT(*) FILTER (WHERE b.is_priority IS TRUE)           AS priority_ct,
    COUNT(*) FILTER (WHERE b.pairing_state = 'UNFOUND')     AS unfound_ct
  FROM backlog b
  GROUP BY b.age_days
  ORDER BY b.age_days DESC`;

const SOURCE_SQL = `${BACKLOG_CTE}
  SELECT
    b.source                                                AS source,
    COUNT(*)                                                AS boxes,
    SUM(b.units_ct)                                         AS units,
    COUNT(*) FILTER (WHERE b.is_return IS TRUE)             AS returns_ct,
    COUNT(*) FILTER (WHERE b.pairing_state = 'UNFOUND')     AS unfound_ct,
    MAX(b.age_days)                                         AS oldest_days
  FROM backlog b
  GROUP BY b.source
  ORDER BY COUNT(*) DESC, b.source ASC`;

const DETAIL_SQL = `${BACKLOG_CTE}
  SELECT
    b.carton_id     AS carton_id,
    b.age_days      AS age_days,
    b.arrived_at    AS arrived_at,
    b.po_number     AS po_number,
    b.lines_ct      AS lines_ct,
    b.units_ct      AS units_ct,
    b.is_return     AS is_return,
    b.is_priority   AS is_priority,
    b.pairing_state AS pairing_state,
    b.opened_at     AS opened_at
  FROM backlog b
  ORDER BY b.age_days DESC, b.arrived_at ASC NULLS LAST, b.carton_id ASC
  LIMIT ${DETAIL_LIMIT}`;

// ─── Row coercion ────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/** node-pg hands back `bigint`/`numeric` as strings. One door for all of them. */
function int(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === 'string' ? v : String(v);
  return s.length > 0 ? s : null;
}

function truthy(v: unknown): boolean {
  return v === true || v === 't' || v === 'true' || v === 1 || v === '1';
}

function ptDate(v: unknown): string {
  const d = v instanceof Date ? v : typeof v === 'string' || typeof v === 'number' ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATOR_TZ,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

interface AgeRow {
  ageDays: number;
  boxes: number;
  units: number;
  onBench: number;
  returns: number;
  priority: number;
  unfound: number;
}

function readAgeRow(row: Row): AgeRow {
  return {
    ageDays: Math.max(0, int(row.age_days)),
    boxes: int(row.boxes),
    units: int(row.units),
    onBench: int(row.on_bench),
    returns: int(row.returns_ct),
    priority: int(row.priority_ct),
    unfound: int(row.unfound_ct),
  };
}

function flagsOf(row: Row): string {
  const flags: string[] = [];
  if (truthy(row.is_return)) flags.push('Return');
  if (truthy(row.is_priority)) flags.push('Priority');
  if (text(row.pairing_state) === 'UNFOUND') flags.push('Unfound');
  if (text(row.opened_at) !== null) flags.push('On bench');
  return flags.length > 0 ? flags.join(' · ') : '—';
}

// ─── Sections ────────────────────────────────────────────────────────────────

function ageSection(ageRows: readonly AgeRow[]): ArtifactReportSection {
  const rows = AGE_BUCKETS.map((band) => {
    const inBand = ageRows.filter((r) => r.ageDays >= band.min && r.ageDays <= band.max);
    const boxes = inBand.reduce((sum, r) => sum + r.boxes, 0);
    const units = inBand.reduce((sum, r) => sum + r.units, 0);
    const oldest = inBand.reduce((max, r) => Math.max(max, r.ageDays), -1);
    return {
      bucket: band.label,
      boxes: count(boxes),
      units: count(units),
      oldest: oldest < 0 ? '—' : days(oldest),
    };
  });
  const boxes = ageRows.reduce((sum, r) => sum + r.boxes, 0);
  const units = ageRows.reduce((sum, r) => sum + r.units, 0);
  const oldest = ageRows.reduce((max, r) => Math.max(max, r.ageDays), -1);
  return {
    title: 'Age of the backlog',
    note: `Whole calendar days since the carton arrived, in ${OPERATOR_TZ}.`,
    columns: [
      { key: 'bucket', label: 'Age' },
      { key: 'boxes', label: 'Boxes', align: 'right' },
      { key: 'units', label: 'Units', align: 'right' },
      { key: 'oldest', label: 'Oldest', align: 'right' },
    ],
    rows,
    totals: {
      bucket: 'Total',
      boxes: count(boxes),
      units: count(units),
      oldest: oldest < 0 ? '—' : days(oldest),
    },
  };
}

function sourceSection(rows: readonly Row[]): ArtifactReportSection {
  return {
    title: 'Where it came from',
    note: 'receiving_carton.source — how the carton entered the building.',
    columns: [
      { key: 'source', label: 'Source' },
      { key: 'boxes', label: 'Boxes', align: 'right' },
      { key: 'units', label: 'Units', align: 'right' },
      { key: 'returns', label: 'Returns', align: 'right' },
      { key: 'unfound', label: 'Unfound', align: 'right' },
      { key: 'oldest_days', label: 'Oldest', align: 'right' },
    ],
    rows: rows.map((r) => ({
      source: text(r.source) ?? 'unknown',
      boxes: count(int(r.boxes)),
      units: count(int(r.units)),
      returns: count(int(r.returns_ct)),
      unfound: count(int(r.unfound_ct)),
      oldest_days: days(int(r.oldest_days)),
    })),
  };
}

function detailSection(rows: readonly Row[], total: number): ArtifactReportSection {
  return {
    title: 'Oldest boxes first',
    note:
      total > rows.length
        ? `Oldest ${rows.length} of ${count(total)} waiting cartons.`
        : 'Every carton waiting to be unboxed.',
    columns: [
      { key: 'age', label: 'Age' },
      { key: 'arrived', label: 'Arrived' },
      { key: 'box', label: 'Box' },
      { key: 'po', label: 'PO' },
      { key: 'lines', label: 'Lines', align: 'right' },
      { key: 'units', label: 'Units', align: 'right' },
      { key: 'flags', label: 'Flags' },
    ],
    rows: rows.map((r) => ({
      age: days(int(r.age_days)),
      arrived: ptDate(r.arrived_at),
      box: `#${int(r.carton_id)}`,
      po: text(r.po_number) ?? '—',
      lines: count(int(r.lines_ct)),
      units: count(int(r.units_ct)),
      flags: flagsOf(r),
    })),
  };
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export interface UnboxBacklogArgs {
  /** `receiving_carton.source` filter (zoho_po | unmatched | local_pickup | sourcing_import). */
  source?: string;
  /** Only cartons flagged `is_return`. */
  returnsOnly?: boolean;
}

function scopeOf(args: UnboxBacklogArgs): string {
  const parts = ['Receiving · cartons in the building, not yet unboxed'];
  if (args.source) parts.push(`source ${args.source}`);
  if (args.returnsOnly) parts.push('returns only');
  return parts.join(' · ');
}

export async function buildUnboxBacklogReport(
  args: UnboxBacklogArgs,
  ctx: AssistantToolCtx,
  deps: Pick<AssistantToolDeps, 'query'>,
  now: Date = new Date(),
): Promise<ToolArtifactEnvelope> {
  const params = [ctx.organizationId, args.source ?? null, args.returnsOnly ?? false];
  const scope = scopeOf(args);

  const ageResult = await deps.query(ctx.organizationId, AGE_SQL, params);
  const ageRows = ageResult.rows.map(readAgeRow);

  const boxes = ageRows.reduce((sum, r) => sum + r.boxes, 0);

  // Zero is an answer, not a blank panel — and it is exactly when the
  // delivered-but-unscanned blind spot matters most, so the notes stay on.
  if (boxes === 0) {
    const base = emptyReport({
      title: TITLE,
      question: QUESTION,
      now,
      scope,
      label: 'Boxes waiting to be unboxed',
      note: NOTES[0],
      standards: backlogStandards(),
    });
    const report: ArtifactReport = {
      ...base,
      headline: {
        ...base.headline,
        unit: 'boxes',
        hint: 'Nothing recorded as arrived is still unopened.',
      },
      notes: [...NOTES],
      followUps: [...FOLLOW_UPS],
    };
    return reportEnvelope(
      report,
      'Nothing is waiting to be unboxed: every carton recorded as arrived has its unbox milestone stamped. Carrier-delivered packages never scanned at the dock would not show here — that is the delivered-but-unscanned queue.',
    );
  }

  const [sourceResult, detailResult] = await Promise.all([
    deps.query(ctx.organizationId, SOURCE_SQL, params),
    deps.query(ctx.organizationId, DETAIL_SQL, params),
  ]);

  const units = ageRows.reduce((sum, r) => sum + r.units, 0);
  const onBench = ageRows.reduce((sum, r) => sum + r.onBench, 0);
  const returns = ageRows.reduce((sum, r) => sum + r.returns, 0);
  const priority = ageRows.reduce((sum, r) => sum + r.priority, 0);
  const unfound = ageRows.reduce((sum, r) => sum + r.unfound, 0);
  const oldestDays = ageRows.reduce((max, r) => Math.max(max, r.ageDays), 0);

  const kpis: ArtifactReportKpi[] = [
    {
      id: 'boxes_waiting',
      label: 'Boxes waiting',
      value: count(boxes),
      unit: 'boxes',
      status: 'neutral',
      definition:
        'Cartons (receiving_carton rows) with a triage door scan or a receiving scan whose receiving_unbox.unboxed_at is still NULL. One row = one physical box.',
    },
    {
      id: 'units_waiting',
      label: 'Units waiting',
      value: count(units),
      unit: 'units',
      status: 'neutral',
      definition:
        'SUM(receiving_line.quantity_expected) across the lines on those cartons. A line with no expected quantity contributes 0, so this is a floor, not a guess.',
    },
    {
      id: 'oldest_days',
      label: 'Oldest box',
      value: days(oldestDays),
      unit: 'days',
      status: statusBelow(oldestDays, 2, 5),
      definition: `Whole calendar days in ${OPERATOR_TZ} since COALESCE(door_received_at, receiving_date_time, created_at) on the oldest waiting carton. Good ≤ 2 days, watch ≤ 5.`,
    },
    {
      id: 'on_bench',
      label: 'On the bench',
      value: count(onBench),
      unit: 'boxes',
      status: statusBelow(onBench, 0, 3),
      definition:
        'Waiting cartons with receiving_unbox.opened_at set but unboxed_at still NULL — opened on the bench and abandoned half-done. Close these out first: the box is already open.',
    },
    {
      id: 'returns',
      label: 'Returns',
      value: count(returns),
      unit: 'boxes',
      status: 'neutral',
      definition: 'Waiting cartons flagged receiving_carton.is_return.',
    },
    {
      id: 'priority',
      label: 'Priority',
      value: count(priority),
      unit: 'boxes',
      status: 'neutral',
      definition:
        'Waiting cartons flagged receiving_carton.is_priority — the shared unbox/test urgency flag (tier 0 or a manual toggle).',
    },
    {
      id: 'unfound',
      label: 'Unfound',
      value: count(unfound),
      unit: 'boxes',
      status: statusBelow(unfound, 0, 5),
      definition:
        "Waiting cartons whose receiving_triage.pairing_state = 'UNFOUND' — no purchase order matched, so they cannot be received against a PO until someone identifies them.",
    },
  ];

  const report: ArtifactReport = {
    kind: 'report',
    title: TITLE,
    question: QUESTION,
    asOf: operatorStamp(now),
    scope,
    headline: {
      value: count(boxes),
      unit: 'boxes',
      label: 'Boxes waiting to be unboxed',
      hint: `Oldest has been waiting ${days(oldestDays)}.`,
    },
    kpis,
    sections: [
      ageSection(ageRows),
      sourceSection(sourceResult.rows),
      detailSection(detailResult.rows, boxes),
    ],
    standards: backlogStandards(),
    notes: [...NOTES],
    followUps: [...FOLLOW_UPS],
  };

  return reportEnvelope(
    report,
    `${count(boxes)} boxes (${count(units)} expected units) are waiting to be unboxed; the oldest has been sitting ${days(oldestDays)}. ${count(onBench)} are already open on the bench and unfinished, ${count(unfound)} have no PO match.`,
  );
}

// ─── Tool input ──────────────────────────────────────────────────────────────

export const unboxBacklogInput = z.object({
  source: z.string().max(40).optional(),
  returnsOnly: z.boolean().optional(),
});

export type UnboxBacklogInput = z.infer<typeof unboxBacklogInput>;
