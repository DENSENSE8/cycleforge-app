/**
 * Packing performance — the answer to "What is <staff name>'s packing
 * performance today?" (and, with no name, the whole pack floor).
 *
 * ## Why this shape
 *
 * An owner of fifteen years does not read "boxes packed" and stop. The
 * question behind the question is whether the hour paid for was an hour worked,
 * so the report carries the industrial-engineering triple every labour standard
 * is built from:
 *
 *   - EARNED minutes — the standard time the work was worth (5/15/60 per tier,
 *     from `DEFAULT_TIER_MINUTES`, or the per-SKU estimate when the operator has
 *     profiled it).
 *   - HANDLE minutes — clock time from the packer's PACK_SCAN to the matching
 *     PACK_COMPLETED. The box in his hands.
 *   - WAIT minutes — the idle gap between one completion and the next scan.
 *     Queue starvation, not slowness: the same 40 minutes means "feed the
 *     bench" in one column and "retrain the packer" in the other, and a report
 *     that adds them together tells the owner to fix the wrong thing.
 *
 * From those three, efficiency (earned ÷ handle) and utilization (handle ÷
 * attended) fall out, and they are the only two numbers on the page that carry
 * a verdict colour.
 *
 * ## Breaks are not wait
 *
 * A 2-hour gap is lunch, a meeting, or a packer pulled onto receiving — it is
 * not the bench starving. Gaps over `BREAK_THRESHOLD_MINUTES` are excluded from
 * wait and counted separately, and the threshold is printed in `standards[]` so
 * the owner can argue with the number instead of distrusting the report.
 *
 * ## One query, TS aggregates
 *
 * SQL returns one row per completed pack scan — already paired to its start
 * scan, already carrying its idle gap and the packer's attended window. Every
 * roll-up is plain arithmetic in this module, which is why the tests can drive
 * the whole report from fixed rows with no database.
 */

import { DEFAULT_TIER_MINUTES, type PackTier } from '@/lib/packing/pack-tier-classifier';
import type {
  ArtifactReport,
  ArtifactReportKpi,
  ArtifactReportSection,
  ArtifactReportStandard,
} from '@/lib/assistant/ui-artifacts';
import type { ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type { AssistantToolCtx, AssistantToolDeps } from '@/lib/assistant/tools/types';
import {
  count,
  emptyReport,
  minutes,
  operatorDay,
  operatorStamp,
  packStandards,
  percent,
  reportEnvelope,
  statusAbove,
  statusBelow,
  OPERATOR_TZ,
} from './report-kit';

/**
 * An idle gap longer than this is a break, an errand, or a reassignment — not
 * the pack bench waiting for work. Printed on the report as a standard.
 */
export const BREAK_THRESHOLD_MINUTES = 90;

/** Wait minutes per box: at or under `good` is a fed bench. */
const WAIT_PER_BOX_GOOD = 3;
const WAIT_PER_BOX_WATCH = 8;

/** Efficiency (earned ÷ handle) and utilization (handle ÷ attended) bands. */
const EFFICIENCY_GOOD = 0.95;
const EFFICIENCY_WATCH = 0.75;
const UTILIZATION_GOOD = 0.8;
const UTILIZATION_WATCH = 0.6;

const ITEM_ROWS_MAX = 200;
const PRODUCT_TITLE_MAX = 60;

const TIER_ORDER: readonly PackTier[] = ['SMALL', 'MEDIUM', 'LARGE'];
const TIER_LABEL: Record<PackTier, string> = { SMALL: 'Small', MEDIUM: 'Medium', LARGE: 'Big' };

export interface PackingPerformanceArgs {
  staffName?: string;
  staffId?: number;
  dayPst?: string;
}

/** One completed pack scan, already paired to its start scan by the query. */
export interface PackCompletionRow {
  sal_id: number | string | null;
  staff_id: number | string | null;
  packer: string | null;
  /** PT wall clock, sortable: `YYYY-MM-DDTHH:MM:SS`. */
  completed_at: string | null;
  /** PT wall clock `HH:MM`, what the row prints. */
  completed_hm: string | null;
  pack_tier: string | null;
  tier_source: string | null;
  standard_minutes: string | number | null;
  /** NULL when the completion had no preceding PACK_SCAN to pair with. */
  handle_minutes: string | number | null;
  /** NULL for the first box of the packer's shift. */
  wait_minutes: string | number | null;
  attended_minutes: string | number | null;
  item_number: string | null;
  sku: string | null;
  product_title: string | null;
  scan_ref: string | null;
}

export interface PackCapacityRow {
  packer_headcount: string | number | null;
  workday_minutes: string | number | null;
  daily_medium_target: string | number | null;
  daily_large_target: string | number | null;
}

export interface StaffMatchRow {
  id: number | string | null;
  name: string | null;
  role: string | null;
}

type ReportDeps = Pick<AssistantToolDeps, 'query'>;

// ─── Row coercion ────────────────────────────────────────────────────────────

/** node-pg hands numerics back as strings; a display path must never see one. */
function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function int(v: string | number | null | undefined, fallback: number): number {
  const n = num(v);
  return n === null ? fallback : Math.trunc(n);
}

function tierOf(raw: string | null): PackTier {
  return raw === 'MEDIUM' || raw === 'LARGE' || raw === 'SMALL' ? raw : 'SMALL';
}

function ratio(top: number, bottom: number): number | null {
  return bottom > 0 ? top / bottom : null;
}

/** Signed minutes, so an owner can see "over standard" without doing subtraction. */
function signedMinutes(delta: number): string {
  if (Math.round(delta) === 0) return '0m';
  return delta > 0 ? `+${minutes(delta)}` : `-${minutes(-delta)}`;
}

/** Never an empty identity cell: item number, then SKU, then the raw scan. */
function identity(row: PackCompletionRow): { item: string; sku: string } {
  const itemNumber = row.item_number?.trim() || '';
  const sku = row.sku?.trim() || '';
  const scanRef = row.scan_ref?.trim() || '';
  if (itemNumber) return { item: itemNumber, sku: sku || '—' };
  if (sku) return { item: sku, sku };
  return { item: scanRef || '—', sku: '—' };
}

// ─── SQL ─────────────────────────────────────────────────────────────────────

const CAPACITY_SQL = `
  SELECT packer_headcount, workday_minutes, daily_medium_target, daily_large_target
    FROM org_pack_capacity
   WHERE organization_id = $1
   LIMIT 1
`;

const STAFF_MATCH_SQL = `
  SELECT s.id, s.name, s.role
    FROM staff s
   WHERE s.organization_id = $1
     AND s.name ILIKE '%' || $2 || '%'
     AND COALESCE(s.active, TRUE) = TRUE
   ORDER BY s.name ASC
   LIMIT 10
`;

/**
 * One row per PACK_COMPLETED, paired to the packer's most recent preceding
 * PACK_SCAN via LATERAL. The window in `seq` carries, for every row, the
 * previous completion (the start of the idle gap) plus the packer's first scan
 * and last completion of the day — so `attended` needs no second query.
 */
function completionsSql(hasStaffFilter: boolean): string {
  const tierDefault = `CASE COALESCE(enr.pack_tier, 'SMALL')
              WHEN 'SMALL' THEN ${DEFAULT_TIER_MINUTES.SMALL}
              WHEN 'LARGE' THEN ${DEFAULT_TIER_MINUTES.LARGE}
              ELSE ${DEFAULT_TIER_MINUTES.MEDIUM}
            END`;
  return `
    WITH scans AS (
      SELECT sal.id, sal.staff_id, sal.activity_type, sal.created_at, sal.scan_ref
        FROM station_activity_logs sal
       WHERE sal.organization_id = $1
         AND sal.station = 'PACK'
         AND sal.activity_type IN ('PACK_SCAN', 'PACK_COMPLETED')
         AND sal.staff_id IS NOT NULL
         AND (timezone('${OPERATOR_TZ}', sal.created_at))::date = $2::date
         ${hasStaffFilter ? 'AND sal.staff_id = $3' : ''}
    ),
    seq AS (
      SELECT
        sc.*,
        MAX(CASE WHEN sc.activity_type = 'PACK_COMPLETED' THEN sc.created_at END) OVER (
          PARTITION BY sc.staff_id ORDER BY sc.created_at, sc.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS prev_completed_at,
        MIN(CASE WHEN sc.activity_type = 'PACK_SCAN' THEN sc.created_at END) OVER (
          PARTITION BY sc.staff_id
        ) AS first_scan_at,
        MAX(CASE WHEN sc.activity_type = 'PACK_COMPLETED' THEN sc.created_at END) OVER (
          PARTITION BY sc.staff_id
        ) AS last_completed_at
      FROM scans sc
    ),
    paired AS (
      SELECT
        done.id, done.staff_id, done.created_at, done.scan_ref,
        done.first_scan_at, done.last_completed_at,
        started.created_at AS scan_at,
        started.prev_completed_at AS idle_since
      FROM seq done
      LEFT JOIN LATERAL (
        SELECT p.created_at, p.prev_completed_at
          FROM seq p
         WHERE p.staff_id = done.staff_id
           AND p.activity_type = 'PACK_SCAN'
           AND (p.created_at, p.id) < (done.created_at, done.id)
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT 1
      ) started ON TRUE
      WHERE done.activity_type = 'PACK_COMPLETED'
    )
    SELECT
      p.id AS sal_id,
      p.staff_id,
      s.name AS packer,
      to_char(timezone('${OPERATOR_TZ}', p.created_at), 'YYYY-MM-DD"T"HH24:MI:SS') AS completed_at,
      to_char(timezone('${OPERATOR_TZ}', p.created_at), 'HH24:MI') AS completed_hm,
      COALESCE(enr.pack_tier, 'SMALL') AS pack_tier,
      enr.tier_source,
      COALESCE(enr.estimated_pack_minutes, ${tierDefault})::numeric AS standard_minutes,
      CASE WHEN p.scan_at IS NULL THEN NULL
           ELSE EXTRACT(EPOCH FROM (p.created_at - p.scan_at)) / 60.0 END AS handle_minutes,
      CASE WHEN p.scan_at IS NULL OR p.idle_since IS NULL THEN NULL
           ELSE GREATEST(0, EXTRACT(EPOCH FROM (p.scan_at - p.idle_since)) / 60.0) END AS wait_minutes,
      CASE WHEN p.first_scan_at IS NULL OR p.last_completed_at IS NULL THEN NULL
           ELSE GREATEST(0, EXTRACT(EPOCH FROM (p.last_completed_at - p.first_scan_at)) / 60.0) END AS attended_minutes,
      o.item_number,
      COALESCE(o.sku, enr.resolved_sku) AS sku,
      COALESCE(o.product_title, enr.external_product_title) AS product_title,
      p.scan_ref
    FROM paired p
    LEFT JOIN packer_log_enrichment enr ON enr.sal_id = p.id
    LEFT JOIN orders o ON o.id = enr.order_row_id AND o.organization_id = $1
    LEFT JOIN staff s ON s.id = p.staff_id
    ORDER BY p.created_at DESC, p.id DESC
  `;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

interface PackerAgg {
  staffId: string;
  packer: string;
  boxes: number;
  small: number;
  medium: number;
  large: number;
  earned: number;
  handle: number;
  wait: number;
  breaks: number;
  attended: number;
  unpaired: number;
}

interface TierAgg {
  boxes: number;
  earned: number;
  actual: number;
}

interface Rollup {
  packers: PackerAgg[];
  tiers: Record<PackTier, TierAgg>;
  tierSources: Map<string, number>;
  total: Omit<PackerAgg, 'staffId' | 'packer'>;
}

function emptyTotals(): Omit<PackerAgg, 'staffId' | 'packer'> {
  return {
    boxes: 0,
    small: 0,
    medium: 0,
    large: 0,
    earned: 0,
    handle: 0,
    wait: 0,
    breaks: 0,
    attended: 0,
    unpaired: 0,
  };
}

function rollup(rows: readonly PackCompletionRow[]): Rollup {
  const byPacker = new Map<string, PackerAgg>();
  const tiers: Record<PackTier, TierAgg> = {
    SMALL: { boxes: 0, earned: 0, actual: 0 },
    MEDIUM: { boxes: 0, earned: 0, actual: 0 },
    LARGE: { boxes: 0, earned: 0, actual: 0 },
  };
  const tierSources = new Map<string, number>();

  for (const row of rows) {
    const staffId = row.staff_id === null || row.staff_id === undefined ? 'unknown' : String(row.staff_id);
    let agg = byPacker.get(staffId);
    if (!agg) {
      agg = {
        staffId,
        packer: row.packer?.trim() || `Staff #${staffId}`,
        ...emptyTotals(),
      };
      byPacker.set(staffId, agg);
    }

    const tier = tierOf(row.pack_tier);
    const standard = num(row.standard_minutes) ?? DEFAULT_TIER_MINUTES[tier];
    const handle = num(row.handle_minutes);
    const waitRaw = num(row.wait_minutes);
    const attended = num(row.attended_minutes);

    agg.boxes += 1;
    if (tier === 'SMALL') agg.small += 1;
    else if (tier === 'MEDIUM') agg.medium += 1;
    else agg.large += 1;
    agg.earned += standard;

    if (handle === null) {
      agg.unpaired += 1;
    } else {
      agg.handle += Math.max(0, handle);
    }

    if (waitRaw !== null) {
      const wait = Math.max(0, waitRaw);
      // A long gap is a break, not a starving bench — it never enters wait.
      if (wait > BREAK_THRESHOLD_MINUTES) agg.breaks += 1;
      else agg.wait += wait;
    }

    // Every row of a packer's day carries the same attended window; take the
    // widest one seen rather than summing it.
    if (attended !== null) agg.attended = Math.max(agg.attended, attended);

    tiers[tier].boxes += 1;
    tiers[tier].earned += standard;
    if (handle !== null) tiers[tier].actual += Math.max(0, handle);

    const source = row.tier_source?.trim() || 'unknown';
    tierSources.set(source, (tierSources.get(source) ?? 0) + 1);
  }

  const packers = [...byPacker.values()].sort(
    (a, b) => b.boxes - a.boxes || b.earned - a.earned || a.packer.localeCompare(b.packer),
  );

  const total = emptyTotals();
  for (const p of packers) {
    total.boxes += p.boxes;
    total.small += p.small;
    total.medium += p.medium;
    total.large += p.large;
    total.earned += p.earned;
    total.handle += p.handle;
    total.wait += p.wait;
    total.breaks += p.breaks;
    total.attended += p.attended;
    total.unpaired += p.unpaired;
  }

  return { packers, tiers, tierSources, total };
}

// ─── Sections ────────────────────────────────────────────────────────────────

function perPackerSection(
  packers: readonly PackerAgg[],
  total: Omit<PackerAgg, 'staffId' | 'packer'>,
  workdayMinutes: number,
  dailyCapacityMinutes: number,
): ArtifactReportSection {
  const rows = packers.map((p) => ({
    packer: p.packer,
    boxes: count(p.boxes),
    small: count(p.small),
    medium: count(p.medium),
    large: count(p.large),
    earned: minutes(p.earned),
    handle: minutes(p.handle),
    wait: minutes(p.wait),
    efficiency: percent(ratio(p.earned, p.handle)),
    utilization: percent(ratio(p.handle, p.attended)),
    pct_of_day: percent(ratio(p.handle, workdayMinutes)),
  }));

  return {
    title: 'Per packer',
    note: 'Earned is standard minutes for the tier mix; handle is scan-to-complete clock time.',
    columns: [
      { key: 'packer', label: 'Packer', align: 'left' },
      { key: 'boxes', label: 'Boxes', align: 'right' },
      { key: 'small', label: 'Small', align: 'right' },
      { key: 'medium', label: 'Medium', align: 'right' },
      { key: 'large', label: 'Big', align: 'right' },
      { key: 'earned', label: 'Earned', align: 'right', unit: 'min' },
      { key: 'handle', label: 'Handle', align: 'right', unit: 'min' },
      { key: 'wait', label: 'Wait', align: 'right', unit: 'min' },
      { key: 'efficiency', label: 'Efficiency', align: 'right' },
      { key: 'utilization', label: 'Utilization', align: 'right' },
      { key: 'pct_of_day', label: '% of day', align: 'right' },
    ],
    rows,
    totals: {
      packer: packers.length === 1 ? packers[0].packer : `${count(packers.length)} packers`,
      boxes: count(total.boxes),
      small: count(total.small),
      medium: count(total.medium),
      large: count(total.large),
      earned: minutes(total.earned),
      handle: minutes(total.handle),
      wait: minutes(total.wait),
      efficiency: percent(ratio(total.earned, total.handle)),
      utilization: percent(ratio(total.handle, total.attended)),
      pct_of_day: percent(ratio(total.handle, dailyCapacityMinutes)),
    },
  };
}

function itemTimeSection(rows: readonly PackCompletionRow[]): ArtifactReportSection {
  const ordered = [...rows].sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  return {
    title: 'Item number to time',
    note: `Newest first, one row per completed pack scan (max ${ITEM_ROWS_MAX}).`,
    columns: [
      { key: 'packed_at', label: 'Packed', align: 'left' },
      { key: 'item_number', label: 'Item #', align: 'left' },
      { key: 'sku', label: 'SKU', align: 'left' },
      { key: 'product', label: 'Product', align: 'left' },
      { key: 'tier', label: 'Tier', align: 'left' },
      { key: 'standard', label: 'Standard', align: 'right', unit: 'min' },
      { key: 'handle', label: 'Handle', align: 'right', unit: 'min' },
      { key: 'wait', label: 'Wait', align: 'right', unit: 'min' },
      { key: 'packer', label: 'Packer', align: 'left' },
    ],
    rows: ordered.slice(0, ITEM_ROWS_MAX).map((row) => {
      const tier = tierOf(row.pack_tier);
      const ident = identity(row);
      const handle = num(row.handle_minutes);
      const waitRaw = num(row.wait_minutes);
      const wait = waitRaw === null ? null : Math.max(0, waitRaw);
      const title = row.product_title?.trim() || '';
      return {
        packed_at: row.completed_hm?.trim() || '—',
        item_number: ident.item,
        sku: ident.sku,
        product: title ? (title.length <= PRODUCT_TITLE_MAX ? title : `${title.slice(0, PRODUCT_TITLE_MAX - 1)}…`) : '—',
        tier: TIER_LABEL[tier],
        standard: minutes(num(row.standard_minutes) ?? DEFAULT_TIER_MINUTES[tier]),
        handle: handle === null ? '—' : minutes(handle),
        wait: wait === null ? '—' : wait > BREAK_THRESHOLD_MINUTES ? `break ${minutes(wait)}` : minutes(wait),
        packer: row.packer?.trim() || '—',
      };
    }),
  };
}

function tierMixSection(tiers: Record<PackTier, TierAgg>): ArtifactReportSection {
  return {
    title: 'Tier mix vs standard',
    note: 'Variance is actual handle minus earned: positive means the tier ran over standard.',
    columns: [
      { key: 'tier', label: 'Tier', align: 'left' },
      { key: 'boxes', label: 'Boxes', align: 'right' },
      { key: 'standard_each', label: 'Standard each', align: 'right', unit: 'min' },
      { key: 'earned', label: 'Earned', align: 'right', unit: 'min' },
      { key: 'actual', label: 'Actual', align: 'right', unit: 'min' },
      { key: 'variance', label: 'Variance', align: 'right', unit: 'min' },
    ],
    rows: TIER_ORDER.map((tier) => ({
      tier: TIER_LABEL[tier],
      boxes: count(tiers[tier].boxes),
      standard_each: minutes(DEFAULT_TIER_MINUTES[tier]),
      earned: minutes(tiers[tier].earned),
      actual: minutes(tiers[tier].actual),
      variance: signedMinutes(tiers[tier].actual - tiers[tier].earned),
    })),
  };
}

// ─── Standards & notes ───────────────────────────────────────────────────────

function standardsFor(workdayMinutes: number, headcount: number): ArtifactReportStandard[] {
  return [
    ...packStandards(),
    {
      label: 'Workday',
      value: String(workdayMinutes),
      unit: 'min/day',
      note: `Per packer, at ${count(headcount)} packer headcount — ${count(workdayMinutes * headcount)} floor minutes a day.`,
    },
    {
      label: 'Break threshold',
      value: String(BREAK_THRESHOLD_MINUTES),
      unit: 'min',
      note: 'An idle gap longer than this counts as a break and is excluded from wait minutes.',
    },
  ];
}

function notesFor(roll: Rollup): string[] {
  const sources = [...roll.tierSources.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([source, n]) => `${source} ${count(n)}`)
    .join(' · ');
  return [
    `Wait minutes are queue/idle time between boxes — previous completion to the next scan. Gaps over ${BREAK_THRESHOLD_MINUTES} min are treated as breaks, not wait: ${count(roll.total.breaks)} today.`,
    `Unpaired completions have no preceding PACK_SCAN, so they carry no handle or wait time: ${count(roll.total.unpaired)} of ${count(roll.total.boxes)} boxes.`,
    `Pack tier comes from the operator SKU profile when the box is linked, otherwise from the title rules — tier source: ${sources || 'none'}.`,
    'This counts PACK_COMPLETED scans only: a box scanned but never completed is not on this report.',
  ];
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

function kpisFor(
  total: Omit<PackerAgg, 'staffId' | 'packer'>,
  capacityMinutes: number,
  singlePacker: boolean,
): ArtifactReportKpi[] {
  const waitPerBox = ratio(total.wait, total.boxes);
  const efficiency = ratio(total.earned, total.handle);
  const utilization = ratio(total.handle, total.attended);
  const perBox = ratio(total.handle, total.boxes);
  const capacityLeft = capacityMinutes - total.handle;

  return [
    {
      id: 'boxes',
      label: 'Boxes packed',
      value: count(total.boxes),
      unit: 'boxes',
      status: 'neutral',
      definition: 'PACK_COMPLETED scans on the PACK station for the scope, on the selected PST day.',
    },
    {
      id: 'earned_minutes',
      label: 'Earned minutes',
      value: minutes(total.earned),
      unit: 'min',
      status: 'neutral',
      definition: `Standard minutes the work was worth: ${DEFAULT_TIER_MINUTES.SMALL} small, ${DEFAULT_TIER_MINUTES.MEDIUM} medium, ${DEFAULT_TIER_MINUTES.LARGE} big per box, or the per-SKU estimate when the operator has profiled it.`,
    },
    {
      id: 'handle_minutes',
      label: 'Handle minutes',
      value: minutes(total.handle),
      unit: 'min',
      status: 'neutral',
      definition: 'Clock time from each PACK_SCAN to its matching PACK_COMPLETED, summed. Unpaired completions contribute nothing.',
    },
    {
      id: 'wait_minutes',
      label: 'Wait minutes',
      value: minutes(total.wait),
      unit: 'min',
      target: `${WAIT_PER_BOX_GOOD} min/box`,
      status: statusBelow(waitPerBox, WAIT_PER_BOX_GOOD, WAIT_PER_BOX_WATCH),
      definition: `Idle time between boxes: previous completion to the next scan, clamped at zero, gaps over ${BREAK_THRESHOLD_MINUTES} min excluded as breaks. Verdict is on wait per box (${minutes(waitPerBox)}).`,
    },
    {
      id: 'efficiency',
      label: 'Efficiency',
      value: percent(efficiency),
      target: '100%',
      status: statusAbove(efficiency, EFFICIENCY_GOOD, EFFICIENCY_WATCH),
      definition: 'Earned minutes ÷ handle minutes. Over 100% means the floor beat the pack standard.',
    },
    {
      id: 'utilization',
      label: 'Utilization',
      value: percent(utilization),
      target: `${Math.round(UTILIZATION_GOOD * 100)}%`,
      status: statusAbove(utilization, UTILIZATION_GOOD, UTILIZATION_WATCH),
      definition: 'Handle minutes ÷ attended minutes (first scan to last completion). Low utilization is a feeding problem, not a packer problem.',
    },
    {
      id: 'minutes_per_box',
      label: 'Minutes per box',
      value: minutes(perBox),
      unit: 'min/box',
      status: 'neutral',
      definition: 'Handle minutes ÷ boxes packed. Compare against the tier mix before reading it as a pace.',
    },
    {
      id: 'capacity_left',
      label: 'Capacity left',
      value: minutes(Math.max(0, capacityLeft)),
      unit: 'min',
      status: 'neutral',
      definition: singlePacker
        ? 'Workday minutes minus handle minutes for this packer.'
        : 'Daily floor capacity (headcount × workday minutes) minus handle minutes.',
    },
  ];
}

// ─── Staff resolution ────────────────────────────────────────────────────────

interface Resolution {
  staffId: number | null;
  staffName: string | null;
  matches: StaffMatchRow[];
}

async function resolveStaff(
  args: PackingPerformanceArgs,
  ctx: AssistantToolCtx,
  deps: ReportDeps,
): Promise<Resolution> {
  if (typeof args.staffId === 'number') {
    return { staffId: args.staffId, staffName: null, matches: [] };
  }
  const name = args.staffName?.trim();
  if (!name) return { staffId: null, staffName: null, matches: [] };

  const { rows } = await deps.query(ctx.organizationId, STAFF_MATCH_SQL, [ctx.organizationId, name]);
  const matches = rows as unknown as StaffMatchRow[];
  if (matches.length === 1) {
    const only = matches[0];
    return { staffId: int(only.id, 0) || null, staffName: only.name?.trim() || name, matches };
  }
  return { staffId: null, staffName: name, matches };
}

function ambiguousReport(args: {
  name: string;
  matches: readonly StaffMatchRow[];
  now: Date;
  day: string;
  question: string;
}): ArtifactReport {
  return {
    kind: 'report',
    title: 'Packing performance — which packer?',
    question: args.question,
    asOf: operatorStamp(args.now),
    scope: `Name match "${args.name}" · ${args.day} (PT)`,
    headline: {
      value: count(args.matches.length),
      unit: 'staff',
      label: 'Staff matched that name',
      hint: 'Pick one and ask again — this report will not guess a person.',
    },
    kpis: [],
    sections: [
      {
        title: 'Matches',
        note: `Active staff whose name contains "${args.name}".`,
        columns: [
          { key: 'staff', label: 'Staff', align: 'left' },
          { key: 'role', label: 'Role', align: 'left' },
          { key: 'staff_id', label: 'Staff ID', align: 'right' },
        ],
        rows: args.matches.map((m) => ({
          staff: m.name?.trim() || `Staff #${m.id ?? '?'}`,
          role: m.role?.trim() || '—',
          staff_id: m.id === null || m.id === undefined ? '—' : String(m.id),
        })),
      },
    ],
    standards: packStandards(),
    notes: [
      `"${args.name}" matches ${count(args.matches.length)} active staff. Ask again with the full name so the numbers belong to one person.`,
    ],
    followUps: args.matches.slice(0, 6).map((m) => ({
      label: m.name?.trim() || `Staff #${m.id ?? '?'}`,
      question: `What is ${m.name?.trim() || `staff #${m.id ?? ''}`}'s packing performance today?`,
    })),
  };
}

// ─── Builder ─────────────────────────────────────────────────────────────────

export async function buildPackingPerformanceReport(
  args: PackingPerformanceArgs,
  ctx: AssistantToolCtx,
  deps: ReportDeps,
  now: Date = new Date(),
): Promise<ToolArtifactEnvelope> {
  const today = operatorDay(now);
  const day = args.dayPst?.trim() || today;
  const dayPhrase = day === today ? 'today' : `on ${day}`;

  const resolution = await resolveStaff(args, ctx, deps);
  const askedName = args.staffName?.trim() || null;
  const subject = resolution.staffName ?? (args.staffId ? `staff #${args.staffId}` : 'the pack floor');
  const question =
    askedName || args.staffId
      ? `What is ${subject}'s packing performance ${dayPhrase}?`
      : `What is the pack floor's packing performance ${dayPhrase}?`;

  if (askedName && resolution.staffId === null) {
    if (resolution.matches.length > 1) {
      const report = ambiguousReport({
        name: askedName,
        matches: resolution.matches,
        now,
        day,
        question,
      });
      return reportEnvelope(
        report,
        `"${askedName}" matches ${resolution.matches.length} active staff — the panel lists them; ask again with one name.`,
      );
    }
    const report = emptyReport({
      title: 'Packing performance',
      question,
      now,
      scope: `Name match "${askedName}" · ${day} (PT)`,
      label: 'Boxes packed',
      note: `No active staff match the name "${askedName}", so there is nothing to measure. Check the spelling or ask for the whole pack floor.`,
      standards: packStandards(),
    });
    return reportEnvelope(report, `No active staff match "${askedName}", so no packing performance could be measured.`);
  }

  const staffId = resolution.staffId;
  const params: unknown[] = staffId === null ? [ctx.organizationId, day] : [ctx.organizationId, day, staffId];
  const [capacityRes, completionsRes] = await Promise.all([
    deps.query(ctx.organizationId, CAPACITY_SQL, [ctx.organizationId]),
    deps.query(ctx.organizationId, completionsSql(staffId !== null), params),
  ]);

  const capRow = (capacityRes.rows[0] ?? null) as unknown as PackCapacityRow | null;
  const headcount = Math.max(1, int(capRow?.packer_headcount ?? null, 2));
  const workdayMinutes = Math.max(1, int(capRow?.workday_minutes ?? null, 480));
  const dailyCapacityMinutes = headcount * workdayMinutes;

  const rows = completionsRes.rows as unknown as PackCompletionRow[];
  const singlePacker = staffId !== null;
  const scopeName = singlePacker
    ? resolution.staffName ?? rows[0]?.packer?.trim() ?? `Staff #${staffId}`
    : 'Pack floor';
  const scope = `${scopeName} · ${day} (PT)`;

  if (rows.length === 0) {
    const report = emptyReport({
      title: 'Packing performance',
      question,
      now,
      scope,
      label: 'Boxes packed',
      note: singlePacker
        ? `No PACK_COMPLETED scans for ${scopeName} on ${day} (PT). Either nothing was completed or the boxes were scanned under another packer.`
        : `No PACK_COMPLETED scans on the PACK station on ${day} (PT). Nothing was completed, so there is no packing performance to report.`,
      standards: standardsFor(workdayMinutes, headcount),
    });
    return reportEnvelope(report, `No boxes were completed by ${scopeName.toLowerCase()} on ${day} (PT).`);
  }

  const roll = rollup(rows);
  const capacityMinutes = singlePacker ? workdayMinutes : dailyCapacityMinutes;
  const efficiency = ratio(roll.total.earned, roll.total.handle);

  const report: ArtifactReport = {
    kind: 'report',
    title: 'Packing performance',
    question,
    asOf: operatorStamp(now),
    scope,
    headline: {
      value: count(roll.total.boxes),
      unit: 'boxes',
      label: 'Boxes packed',
      hint: `${count(roll.total.small)} small · ${count(roll.total.medium)} medium · ${count(roll.total.large)} big`,
    },
    kpis: kpisFor(roll.total, capacityMinutes, singlePacker),
    sections: [
      perPackerSection(roll.packers, roll.total, workdayMinutes, capacityMinutes),
      itemTimeSection(rows),
      tierMixSection(roll.tiers),
    ],
    standards: standardsFor(workdayMinutes, headcount),
    notes: notesFor(roll),
    followUps: [
      { label: 'Yesterday', question: "What was the pack floor's packing performance yesterday?" },
      { label: 'Slowest items', question: 'Which items took the longest to pack today?' },
      { label: 'Whole floor', question: `What is the pack floor's packing performance on ${day}?` },
    ],
  };

  const summary = `${scopeName} completed ${count(roll.total.boxes)} boxes on ${day} (PT) — ${minutes(roll.total.earned)} earned against ${minutes(roll.total.handle)} handled, ${percent(efficiency)} efficiency, ${minutes(roll.total.wait)} waiting. The report is on the panel.`;
  return reportEnvelope(report, summary);
}
