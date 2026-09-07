/**
 * get_roi_rank — "What are the highest ROIs right now?"
 *
 * ## What this adds over `get_roi_gaps`
 *
 * `get_roi_gaps` (see `src/lib/assistant/tools/roi-gap-tools.ts`) answers the
 * same six queries and ranks them by raw stuck COUNT. That is honest but
 * incomplete: a count alone withholds the two things an owner actually needs to
 * choose what to fix first.
 *
 *   1. **Effort to clear.** 60 unlisted units and 60 unfinished repairs are not
 *      the same afternoon. Effort comes from a DECLARED minutes-per-unit
 *      standard per gap (`MINUTES_TO_CLEAR_PER_UNIT`), printed on the report so
 *      the owner argues with the STANDARD rather than distrusting the RESULT.
 *   2. **Decay.** A 5-unit gap that is 40 days old outranks a 60-unit gap from
 *      this morning, and any owner knows that. A pure count does not.
 *
 * ## The ranking formula is printed, never hidden
 *
 *     ageWeight = 1 + min(oldestDays, 60) / 30      (1.0x at 0d, 2.0x at 30d, 3.0x capped at 60d+)
 *     priority  = units × ageWeight
 *     effort    = units × MINUTES_TO_CLEAR_PER_UNIT[gap]
 *     payback   = priority / (effort / 60)
 *
 * Every input and every intermediate ships as its OWN column, so the owner can
 * re-rank by eye and catch a standard they disagree with. A single blended
 * "score" the report will not explain is a horoscope with a decimal point.
 *
 * ## No dollar figure
 *
 * This schema carries no reliable per-unit price, so no report here attaches
 * one. Ranking stuck inventory by fabricated revenue would look authoritative
 * and be wrong; effort and age are both measured or declared, and are enough.
 *
 * Every statement leads with an explicit `organization_id = $1` on top of the
 * tenant-pool GUC. The org comes from ctx, never from model input.
 */

import { z } from 'zod';
import type { AssistantToolCtx, AssistantToolDeps } from '@/lib/assistant/tools/types';
import type { ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type {
  ArtifactReport,
  ArtifactReportKpi,
  ArtifactReportSection,
  ArtifactReportStandard,
} from '@/lib/assistant/ui-artifacts';
import {
  count,
  days,
  emptyReport,
  minutes,
  operatorStamp,
  percent,
  reportEnvelope,
  statusBelow,
} from './report-kit';

/** Dormant for this long counts as dead stock, matching `get_roi_gaps` and the /reports desk. */
const DEAD_STOCK_DAYS = 90;

/** Fallback workday length when `org_pack_capacity` has no row. Matches `packer-kpi-queries`. */
export const DEFAULT_WORKDAY_MINUTES = 480;

/** Age past which more waiting no longer changes the answer — the `ageWeight` cap. */
const AGE_CAP_DAYS = 60;
/** Days of age that buy one extra unit of weight. 30 ⇒ a month-old gap counts double. */
const AGE_HALF_LIFE_DAYS = 30;

/**
 * Minutes of hands-on work to clear ONE stuck item, per gap.
 *
 * These are DECLARED OPERATING STANDARDS, not measurements — the schema records
 * no per-gap remediation duration. They are printed in `standards[]` on every
 * report that uses them precisely because changing one changes the ranking, and
 * an owner is entitled to see the lever before it moves the answer.
 *
 *   - `unlisted_units: 6`   — photograph-free relist off an existing SKU: pull the
 *                             unit, confirm condition, push to a channel.
 *   - `dead_stock: 15`      — a dormant SKU is a decision, not a task: check demand,
 *                             pick markdown / bundle / liquidate, then action it.
 *   - `open_order_exceptions: 12` — read the exception, reconcile against the order,
 *                             and either fix the pick or message the customer.
 *   - `open_receiving_exceptions: 20` — physically locate the carton, recount, and
 *                             reconcile against the PO before it can become stock.
 *   - `units_on_hold: 10`   — retrieve the unit, get the disposition made, and record it.
 *   - `repairs_in_flight: 45` — bench time: an unfinished repair resumes cold, so the
 *                             tech re-diagnoses before finishing.
 */
export const MINUTES_TO_CLEAR_PER_UNIT: Readonly<Record<string, number>> = {
  unlisted_units: 6,
  dead_stock: 15,
  open_order_exceptions: 12,
  open_receiving_exceptions: 20,
  units_on_hold: 10,
  repairs_in_flight: 45,
};

/** The station that actually clears each gap. Printed in `standards[]` by the delegation report. */
export const GAP_STATION: Readonly<Record<string, string>> = {
  unlisted_units: 'TECH',
  dead_stock: 'SALES',
  open_order_exceptions: 'PACK',
  open_receiving_exceptions: 'UNBOX',
  units_on_hold: 'TECH',
  repairs_in_flight: 'TECH',
};

export type GapUnit = 'units' | 'orders' | 'skus';

/** One gap as the SQL found it — the raw input to the ranking. */
export interface RoiGapRow {
  id: string;
  label: string;
  units: number;
  unit: GapUnit;
  /** Age of the oldest stuck item, or null when the source table carries no date. */
  oldestDays: number | null;
  why: string;
  /** The drill-down sentence that pulls the actual rows. */
  question: string;
}

/** A gap after the printed formula has been applied to it. */
export interface RankedGap extends RoiGapRow {
  /** `1 + min(oldestDays, 60) / 30`, capped at 3.0. Null age ⇒ 1.0 (no decay claimed). */
  ageWeight: number;
  /** `units × ageWeight`. The rank key. */
  priority: number;
  /** Declared minutes to clear one item of this gap. */
  minutesPerUnit: number;
  /** `units × minutesPerUnit`. */
  effortMinutes: number;
  /** `priority / (effortMinutes / 60)` — priority bought per labour hour. */
  payback: number;
}

interface GapQuery {
  id: string;
  label: string;
  unit: GapUnit;
  why: string;
  question: string;
  sql: string;
}

/**
 * The same six gaps `get_roi_gaps` reads, with the same ids and the same SQL.
 * Column names are verified against the live schema: `serial_units.current_status`
 * (not `status`), `orders_exceptions.status = 'open'` lowercase,
 * `receiving_exceptions.status = 'OPEN'` uppercase — the two exception tables
 * genuinely disagree on case, so neither predicate may be "tidied".
 */
const GAP_QUERIES: readonly GapQuery[] = [
  {
    id: 'unlisted_units',
    label: 'Received but never listed',
    unit: 'units',
    why: 'Inventory that arrived, got put away, and never reached a channel earns nothing while it ages.',
    question: 'Show me the units that were received but never listed, oldest first',
    sql: `
      SELECT count(*)::int AS units,
             max(date_part('day', now() - su.received_at))::int AS oldest_days
        FROM serial_units su
       WHERE su.organization_id = $1
         AND su.current_status IN ('RECEIVED', 'LABELED', 'UNKNOWN')
         AND NOT EXISTS (
               SELECT 1 FROM serial_unit_listings l
                WHERE l.serial_unit_id = su.id
                  AND l.organization_id = su.organization_id)`,
  },
  {
    id: 'dead_stock',
    label: `Dead stock (${DEAD_STOCK_DAYS}+ days dormant)`,
    unit: 'skus',
    why: 'Stock nothing has moved in a quarter is carrying cost with no demand signal behind it.',
    question: `Show me dead stock dormant for more than ${DEAD_STOCK_DAYS} days`,
    sql: `
      SELECT count(*)::int AS units,
             max(days_dormant)::int AS oldest_days
        FROM mv_dead_stock
       WHERE organization_id = $1
         AND days_dormant >= ${DEAD_STOCK_DAYS}`,
  },
  {
    id: 'open_order_exceptions',
    label: 'Open order exceptions',
    unit: 'orders',
    why: 'Every open exception is an order a customer is waiting on that no station is working.',
    question: 'Show me the open order exceptions, oldest first',
    sql: `
      SELECT count(*)::int AS units,
             max(date_part('day', now() - created_at))::int AS oldest_days
        FROM orders_exceptions
       WHERE organization_id = $1
         AND status = 'open'`,
  },
  {
    id: 'open_receiving_exceptions',
    label: 'Open receiving exceptions',
    unit: 'units',
    why: 'A carton stuck in receiving exception never becomes sellable inventory.',
    question: 'Show me the open receiving exceptions',
    sql: `
      SELECT count(*)::int AS units,
             max(date_part('day', now() - created_at))::int AS oldest_days
        FROM receiving_exceptions
       WHERE organization_id = $1
         AND status = 'OPEN'`,
  },
  {
    id: 'units_on_hold',
    label: 'Units on hold',
    unit: 'units',
    why: 'A hold with no disposition is a decision nobody has made yet.',
    question: 'Show me the units on hold and why',
    sql: `
      SELECT count(*)::int AS units,
             max(date_part('day', now() - su.updated_at))::int AS oldest_days
        FROM serial_units su
       WHERE su.organization_id = $1
         AND su.current_status = 'ON_HOLD'`,
  },
  {
    id: 'repairs_in_flight',
    label: 'Repairs started, not finished',
    unit: 'units',
    why: 'Labour and parts are already sunk into these; unfinished means the spend has not converted.',
    question: 'Show me repairs that were started but never completed',
    sql: `
      SELECT count(*)::int AS units,
             max(date_part('day', now() - started_at))::int AS oldest_days
        FROM unit_repairs
       WHERE organization_id = $1
         AND completed_at IS NULL`,
  },
];

/** The `ageWeight` half of the printed formula, isolated so a test can pin the curve. */
export function ageWeight(oldestDays: number | null): number {
  if (oldestDays === null || !Number.isFinite(oldestDays) || oldestDays <= 0) return 1;
  return 1 + Math.min(oldestDays, AGE_CAP_DAYS) / AGE_HALF_LIFE_DAYS;
}

/** The formula, verbatim, for the KPI definition and the standards row. */
export const AGE_WEIGHT_FORMULA =
  'priority = units × ageWeight, where ageWeight = 1 + min(oldestDays, 60) / 30 (0 days = 1.0x, 30 days = 2.0x, 60+ days = 3.0x, capped)';

/**
 * Apply the printed formula and sort. THE single ranking implementation — the
 * delegation report imports this rather than restating the formula, so the two
 * reports can never disagree about which gap is the top gap.
 *
 * A gap with `units <= 0` is dropped: rendering "0 stuck" six times teaches an
 * owner to stop reading the report.
 */
export function rankGaps(rows: readonly RoiGapRow[]): RankedGap[] {
  const ranked: RankedGap[] = [];
  for (const row of rows) {
    const units = Number(row.units);
    if (!Number.isFinite(units) || units <= 0) continue;
    const weight = ageWeight(row.oldestDays);
    const minutesPerUnit = MINUTES_TO_CLEAR_PER_UNIT[row.id] ?? 0;
    const effortMinutes = units * minutesPerUnit;
    const priority = units * weight;
    const effortHours = effortMinutes / 60;
    ranked.push({
      ...row,
      units,
      ageWeight: weight,
      priority,
      minutesPerUnit,
      effortMinutes,
      payback: effortHours > 0 ? priority / effortHours : 0,
    });
  }
  // Priority desc; ties broken by age then by units so the order is stable.
  ranked.sort(
    (a, b) =>
      b.priority - a.priority ||
      (b.oldestDays ?? 0) - (a.oldestDays ?? 0) ||
      b.units - a.units,
  );
  return ranked;
}

/** Read every gap count. One query per gap — each is a single indexed COUNT. */
export async function loadRoiGapRows(
  ctx: AssistantToolCtx,
  deps: Pick<AssistantToolDeps, 'query'>,
): Promise<RoiGapRow[]> {
  const out: RoiGapRow[] = [];
  for (const gap of GAP_QUERIES) {
    const { rows } = await deps.query(ctx.organizationId, gap.sql, [ctx.organizationId]);
    const row = rows[0] ?? {};
    const units = Number(row.units ?? 0);
    const oldest = row.oldest_days;
    out.push({
      id: gap.id,
      label: gap.label,
      units: Number.isFinite(units) ? units : 0,
      unit: gap.unit,
      oldestDays: oldest === null || oldest === undefined ? null : Number(oldest),
      why: gap.why,
      question: gap.question,
    });
  }
  return out;
}

/** The org's declared workday length, or the 480-minute default. */
export async function loadWorkdayMinutes(
  ctx: AssistantToolCtx,
  deps: Pick<AssistantToolDeps, 'query'>,
): Promise<number> {
  const { rows } = await deps.query(
    ctx.organizationId,
    `SELECT workday_minutes
       FROM org_pack_capacity
      WHERE organization_id = $1
      LIMIT 1`,
    [ctx.organizationId],
  );
  const raw = Number(rows[0]?.workday_minutes);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_WORKDAY_MINUTES;
}

/** The minutes-per-unit standards, one printed row per gap that is actually open. */
function effortStandards(ranked: readonly RankedGap[]): ArtifactReportStandard[] {
  return ranked.map((gap) => ({
    label: gap.label,
    value: String(gap.minutesPerUnit),
    unit: `min/${gap.unit === 'skus' ? 'sku' : gap.unit === 'orders' ? 'order' : 'unit'}`,
    note: 'Declared operating standard, not a measurement.',
  }));
}

const ROI_QUESTION = 'What are the highest ROIs right now?';

export async function buildRoiRankReport(
  args: { limit?: number },
  ctx: AssistantToolCtx,
  deps: Pick<AssistantToolDeps, 'query'>,
  now: Date = new Date(),
): Promise<ToolArtifactEnvelope> {
  const limit = Math.min(Math.max(Math.trunc(args.limit ?? 6), 1), 10);
  const [gapRows, workdayMinutes] = await Promise.all([
    loadRoiGapRows(ctx, deps),
    loadWorkdayMinutes(ctx, deps),
  ]);
  const ranked = rankGaps(gapRows);

  const workdayStandard: ArtifactReportStandard = {
    label: 'Workday',
    value: String(workdayMinutes),
    unit: 'min/person/day',
    note:
      workdayMinutes === DEFAULT_WORKDAY_MINUTES
        ? 'org_pack_capacity.workday_minutes, or the 480-minute default when unset.'
        : 'From org_pack_capacity.workday_minutes.',
  };
  const formulaStandard: ArtifactReportStandard = {
    label: 'Priority formula',
    value: 'units × ageWeight',
    unit: null,
    note: AGE_WEIGHT_FORMULA,
  };

  if (ranked.length === 0) {
    return reportEnvelope(
      emptyReport({
        title: 'Highest ROIs right now',
        question: ROI_QUESTION,
        now,
        scope: 'All six operating gaps, live row counts',
        label: 'Gaps open',
        note: 'All six gaps were checked and every one is empty: nothing received-but-unlisted, no dead stock, no open order or receiving exceptions, no units on hold, no repairs in flight.',
        standards: [formulaStandard, workdayStandard],
      }),
      'Nothing is stuck: all six operating gaps came back empty.',
    );
  }

  const shown = ranked.slice(0, limit);
  const top = shown[0]!;
  const totalStuck = ranked.reduce((sum, g) => sum + g.units, 0);
  const totalEffort = ranked.reduce((sum, g) => sum + g.effortMinutes, 0);
  const personDays = totalEffort / workdayMinutes;
  const topPersonDays = top.effortMinutes / workdayMinutes;

  const kpis: ArtifactReportKpi[] = [
    {
      id: 'top_gap',
      label: 'Top gap',
      value: top.label,
      status: 'neutral',
      definition: `The gap with the highest priority. ${AGE_WEIGHT_FORMULA}.`,
    },
    {
      id: 'top_gap_units',
      label: 'Stuck in top gap',
      value: count(top.units),
      unit: top.unit,
      status: 'neutral',
      definition: `Live row count for "${top.label}" — an exact count, not an estimate.`,
    },
    {
      id: 'top_gap_age',
      label: 'Top gap oldest',
      value: top.oldestDays === null ? '—' : days(top.oldestDays),
      unit: null,
      status: statusBelow(top.oldestDays, 7, 30),
      definition:
        'Age of the oldest item in the top gap. Good under 7 days, watch under 30, bad beyond — age is what turns a pile into a loss.',
    },
    {
      id: 'total_stuck',
      label: 'Total stuck',
      value: count(totalStuck),
      unit: 'items',
      status: 'neutral',
      definition: 'Sum of the live counts across all open gaps. Mixed units (units, orders, SKUs), so it is a volume, not a total of one thing.',
    },
    {
      id: 'total_effort',
      label: 'Effort to clear all',
      value: minutes(totalEffort),
      unit: null,
      status: 'neutral',
      definition:
        'Σ units × the declared minutes-per-unit standard for each gap (6 unlisted, 15 dead stock, 12 order exception, 20 receiving exception, 10 on hold, 45 repair). Standards, not measurements.',
    },
    {
      id: 'person_days',
      label: 'Person-days to clear',
      value: personDays.toFixed(1),
      unit: 'person-days',
      status: statusBelow(personDays, 1, 3),
      definition: `Total effort ÷ a ${workdayMinutes}-minute workday (org_pack_capacity.workday_minutes). One person-day or less is a day's work; past three it needs a plan.`,
    },
    {
      id: 'gaps_open',
      label: 'Gaps open',
      value: count(ranked.length),
      unit: `of ${GAP_QUERIES.length}`,
      status: 'neutral',
      definition: 'How many of the six tracked gaps have at least one item stuck right now.',
    },
  ];

  const rankSection: ArtifactReportSection = {
    title: 'Gaps ranked by priority',
    note: AGE_WEIGHT_FORMULA,
    columns: [
      { key: 'rank', label: '#', align: 'right' },
      { key: 'gap', label: 'Gap' },
      { key: 'units', label: 'Stuck', align: 'right' },
      { key: 'unit', label: 'Counting' },
      { key: 'oldest_days', label: 'Oldest', align: 'right', unit: 'days' },
      { key: 'age_weight', label: 'Age weight', align: 'right' },
      { key: 'priority', label: 'Priority', align: 'right' },
      { key: 'effort', label: 'Effort', align: 'right', unit: 'min' },
      { key: 'payback', label: 'Payback', align: 'right', unit: 'priority/hr' },
      { key: 'why', label: 'Why it costs' },
    ],
    rows: shown.map((gap, i) => ({
      rank: i + 1,
      gap: gap.label,
      units: count(gap.units),
      unit: gap.unit,
      oldest_days: gap.oldestDays === null ? '—' : count(gap.oldestDays),
      age_weight: `${gap.ageWeight.toFixed(2)}x`,
      priority: gap.priority.toFixed(1),
      effort: minutes(gap.effortMinutes),
      payback: gap.payback.toFixed(1),
      why: gap.why,
    })),
  };

  const effortSection: ArtifactReportSection = {
    title: 'Effort to clear',
    note: `Minutes-per-unit are declared standards; person-days divide by a ${workdayMinutes}-minute workday.`,
    columns: [
      { key: 'gap', label: 'Gap' },
      { key: 'units', label: 'Stuck', align: 'right' },
      { key: 'min_per_unit', label: 'Min each', align: 'right', unit: 'min' },
      { key: 'effort', label: 'Effort', align: 'right', unit: 'min' },
      { key: 'person_days', label: 'Person-days', align: 'right' },
      { key: 'share', label: 'Share of effort', align: 'right' },
    ],
    rows: shown.map((gap) => ({
      gap: gap.label,
      units: count(gap.units),
      min_per_unit: count(gap.minutesPerUnit),
      effort: minutes(gap.effortMinutes),
      person_days: (gap.effortMinutes / workdayMinutes).toFixed(2),
      share: totalEffort > 0 ? percent(gap.effortMinutes / totalEffort) : '—',
    })),
    totals: {
      gap: `${shown.length} gap${shown.length === 1 ? '' : 's'} shown`,
      units: count(shown.reduce((s, g) => s + g.units, 0)),
      min_per_unit: '—',
      effort: minutes(shown.reduce((s, g) => s + g.effortMinutes, 0)),
      person_days: (shown.reduce((s, g) => s + g.effortMinutes, 0) / workdayMinutes).toFixed(2),
      share: totalEffort > 0 ? percent(shown.reduce((s, g) => s + g.effortMinutes, 0) / totalEffort) : '—',
    },
  };

  const report: ArtifactReport = {
    kind: 'report',
    title: 'Highest ROIs right now',
    question: ROI_QUESTION,
    asOf: operatorStamp(now),
    scope: `${ranked.length} open gap${ranked.length === 1 ? '' : 's'} of ${GAP_QUERIES.length} tracked, live row counts`,
    headline: {
      value: count(top.units),
      unit: top.unit,
      label: `Biggest gap: ${top.label}`,
      hint: `oldest ${top.oldestDays === null ? 'unknown' : count(top.oldestDays)} days · about ${minutes(top.effortMinutes)} to clear`,
    },
    kpis,
    sections: [rankSection, effortSection],
    standards: [formulaStandard, workdayStandard, ...effortStandards(shown)].slice(0, 8),
    notes: [
      'Every number in the Stuck column is a LIVE row count from the table named in the gap — never an estimate, never a model guess.',
      'NO dollar figure is attached to any gap. This schema carries no reliable per-unit price, so a revenue ranking would be invented; effort and age are declared or measured, and are what the ranking uses instead.',
      'The minutes-per-unit figures are declared operating standards, not measurements. Change one and the ranking changes — that is the point of printing them.',
      'A gap is a CATEGORY, not a work order. Use the follow-up question under a gap to pull the actual rows before assigning anyone.',
      `Person-days divide total effort by a ${workdayMinutes}-minute workday from org_pack_capacity.workday_minutes.`,
    ],
    followUps: ranked.slice(0, 3).map((gap) => ({
      label: gap.label.slice(0, 80),
      question: gap.question.slice(0, 300),
    })),
  };

  return reportEnvelope(
    report,
    `Top gap is ${top.label}: ${count(top.units)} ${top.unit} stuck, oldest ${top.oldestDays === null ? 'unknown' : `${top.oldestDays} days`}, about ${minutes(top.effortMinutes)} (${topPersonDays.toFixed(1)} person-days) to clear. ${ranked.length} of ${GAP_QUERIES.length} gaps are open, ${minutes(totalEffort)} of work in total. No dollar value is attached — this ranking is units × age weight, not revenue.`,
  );
}

export const roiRankInput = z.object({
  limit: z.number().int().min(1).max(10).default(6),
});
