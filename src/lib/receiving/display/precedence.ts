/** Receiving precedence — rules-as-data SoT. */

/** Rank for a manually/auto-flagged carton (is_priority) — leads the sort. */
const PRIORITY_RANK_FLAGGED = 0;
/** Rank for an unmatched / untagged carton (no source platform). */
const PRIORITY_RANK_UNMATCHED = 1;
/** Rank for any platform without a specific rank below. */
const PRIORITY_RANK_OTHER = 9;

/**
 * Platform → rank, after the flagged (0) and unmatched (1) cases. This array IS
 * the source of truth; both the SQL CASE and the JS lookup derive from it. Add a
 * platform here and both surfaces update together.
 */
const PRIORITY_PLATFORM_RANKS: ReadonlyArray<{ platform: string; rank: number }> = [
  { platform: 'amazon', rank: 2 },
  { platform: 'ebay', rank: 3 },
  { platform: 'goodwill', rank: 4 },
];

/** The platform-derived rank (lower = higher priority). */
export function platformPriorityRank(
  isUnmatched: boolean,
  sourcePlatform: string | null | undefined,
  isPriority?: boolean | null,
): number {
  if (isPriority) return PRIORITY_RANK_FLAGGED;
  const platform = (sourcePlatform ?? '').trim();
  if (isUnmatched || platform === '') return PRIORITY_RANK_UNMATCHED;
  const hit = PRIORITY_PLATFORM_RANKS.find((r) => r.platform === platform.toLowerCase());
  return hit ? hit.rank : PRIORITY_RANK_OTHER;
}

/** Platform rank → the manual tier it reads as (0 Priority · 1 High · 2 Medium · 3 Low); ranks off the map read Low. */
const RANK_TO_TIER: Readonly<Record<number, 0 | 1 | 2 | 3>> = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 3 };

/**
 * The tier an order on `platform` gets when its priority is Auto — what Auto
 * resolves to (Goodwill → 3 Low). Same rank data as {@link platformPriorityRank};
 * a blank platform reads as unmatched.
 */
export function defaultInboundTierForPlatform(platform: string | null): 0 | 1 | 2 | 3 {
  return RANK_TO_TIER[platformPriorityRank(false, platform)] ?? 3;
}

/** Column/expression names for {@link priorityRankSql} (lets carton/line callers vary the alias). */
interface PriorityRankSqlCols {
  /** Manual override column, e.g. 'r.priority_tier'. */
  tier: string;
  /** is_priority boolean column, e.g. 'r.is_priority'. */
  isPriority: string;
  /** source column (the 'unmatched' sentinel), e.g. 'r.source'. */
  source: string;
  /** source_platform column, e.g. 'r.source_platform'. */
  sourcePlatform: string;
}

/** Build the `COALESCE(tier, CASE …)` priority-rank SQL fragment from the same rank data the JS twin uses. */
export function priorityRankSql(cols: PriorityRankSqlCols): string {
  const platformWhens = PRIORITY_PLATFORM_RANKS
    .map((r) => `    WHEN lower(${cols.sourcePlatform}) = '${r.platform}' THEN ${r.rank}`)
    .join('\n');
  return `
  COALESCE(${cols.tier}, CASE
    WHEN COALESCE(${cols.isPriority}, false) THEN ${PRIORITY_RANK_FLAGGED}
    WHEN ${cols.source} = 'unmatched' OR ${cols.sourcePlatform} IS NULL THEN ${PRIORITY_RANK_UNMATCHED}
${platformWhens}
    ELSE ${PRIORITY_RANK_OTHER}
  END)`;
}

/** Triage priority-lane rank (docs/receiving-triage-redesign-plan.md §4.2) — a SECONDARY tie-breaker layered on top of {@link… */
const LANE_RANK_ORDER: ReadonlyArray<string> = [
  'PO_STOCKOUT',
  'RETURN',
  'PO_STANDARD',
  'HOLD',
];

/** SQL CASE fragment for {@link laneRank}, keyed by the given `priority_lane` column/alias. */
export function laneRankSql(laneCol: string): string {
  const whens = LANE_RANK_ORDER
    .map((lane, i) => `    WHEN '${lane}' THEN ${i}`)
    .join('\n');
  return `
  CASE ${laneCol}
${whens}
    ELSE ${LANE_RANK_ORDER.length}
  END`;
}
