/**
 * Module-level cache for staff daily goals.
 *
 * The full goals list (used by GoalsAnalyticsTab) includes live today/week
 * counts, so it uses a 30-second TTL.
 *
 * Call invalidateStaffGoalsCache() after any PUT to /api/staff-goals so the
 * next read gets fresh data.
 *
 * (A per-staff `getStaffGoalById` fetcher lived here for the station sidebars'
 * goal bars; the Packing sidebar was its last caller and now shows the recent-
 * packs rail instead. Re-add it from git history if a sidebar needs a single
 * staffer's goal again.)
 */

const ALL_GOALS_TTL_MS = 30 * 1000;      // 30 seconds (live counts)

// ── Full goals list (with live today/week counts) ─────────────────────────────

export interface GoalRow {
  staff_id: number;
  name: string;
  role: string;
  employee_id: string | null;
  station: string;
  daily_goal: number;
  today_count: number;
  week_count: number;
  avg_daily_last_7d: number;
}

interface AllGoalsEntry {
  data: GoalRow[];
  expiresAt: number;
}

/** Cache key = station filter or 'ALL' */
const _allGoalsCache = new Map<string, AllGoalsEntry>();
const _allGoalsPromises = new Map<string, Promise<GoalRow[]>>();

/** Returns the full goals list (includes live today/week counts). Optionally filter by station. */
export function getAllStaffGoals(station?: string): Promise<GoalRow[]> {
  const cacheKey = station || 'ALL';
  const cached = _allGoalsCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return Promise.resolve(cached.data);
  }

  let promise = _allGoalsPromises.get(cacheKey);
  if (!promise) {
    const url = station
      ? `/api/staff-goals?station=${encodeURIComponent(station)}`
      : '/api/staff-goals';
    promise = fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: GoalRow[]) => {
        const result = Array.isArray(data) ? data : [];
        _allGoalsCache.set(cacheKey, { data: result, expiresAt: Date.now() + ALL_GOALS_TTL_MS });
        _allGoalsPromises.delete(cacheKey);
        return result;
      })
      .catch(() => {
        _allGoalsPromises.delete(cacheKey);
        return [];
      });
    _allGoalsPromises.set(cacheKey, promise);
  }
  return promise;
}

// ── Invalidation ──────────────────────────────────────────────────────────────

/**
 * Call after a PUT to /api/staff-goals.
 *
 * `staffId` is accepted for call-site clarity but no longer narrows the clear —
 * the only remaining cache is the full goals list, which any single-staff edit
 * invalidates anyway.
 */
export function invalidateStaffGoalsCache(_staffId?: string): void {
  _allGoalsCache.clear();
  _allGoalsPromises.clear();
}
