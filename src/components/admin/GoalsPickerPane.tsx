'use client';

/**
 * Today's goal cards beside the goal history on /operations?mode=goals. They
 * were the old rail (`GoalsSidebarPanel`); the contextual sidebar now owns
 * the filters (Find → `?search=`, Progress → `?goalView=`), so this is the
 * list — in the stage, left of the record it opens. A card still edits its
 * daily goal in place; picking one writes `?staffId=`.
 */

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { sectionLabel } from '@/design-system/tokens/typography/presets';
import { getAllStaffGoals, invalidateStaffGoalsCache, type GoalRow } from '@/lib/staffGoalsCache';
import {
  CurrentGoalEntry,
  getGoalProgress,
  matchesView,
  type GoalViewMode,
} from '@/components/sidebar/GoalsSidebarPanel';
import { useAdminUrlState } from './shared';

const GOALS_REFRESH_EVENT = 'admin-goals-refresh';

export function GoalsPickerPane() {
  const { searchParams, setParam } = useAdminUrlState();
  const search = (searchParams.get('search') ?? '').trim().toLowerCase();
  const goalViewRaw = searchParams.get('goalView');
  const goalView: GoalViewMode =
    goalViewRaw === 'behind' || goalViewRaw === 'on-track' || goalViewRaw === 'exceeded' ? goalViewRaw : 'all';
  const selected = searchParams.get('staffId') ?? '';

  const [rows, setRows] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = async () => {
    setLoading(true);
    try {
      const data = await getAllStaffGoals();
      setRows(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRows();
    const handleRefresh = () => {
      invalidateStaffGoalsCache();
      void fetchRows();
    };
    window.addEventListener(GOALS_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(GOALS_REFRESH_EVENT, handleRefresh);
  }, []);

  const filtered = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            (!search || row.name.toLowerCase().includes(search) || row.role.toLowerCase().includes(search)) &&
            matchesView(getGoalProgress(row).progress, goalView),
        )
        .sort((a, b) => getGoalProgress(b).percent - getGoalProgress(a).percent || a.name.localeCompare(b.name)),
    [rows, search, goalView],
  );

  return (
    <nav
      aria-label="Current goals"
      data-testid="operations-goals-picker"
      className="flex h-full w-72 shrink-0 flex-col border-r border-border-soft bg-surface-card"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-hairline px-3 py-1.5">
        <p className={sectionLabel}>
          Current goals <span className="font-semibold tabular-nums text-text-faint">{filtered.length}</span>
        </p>
        <HoverTooltip label="Reload counts, goals and KPI history" asChild>
          <IconButton
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(GOALS_REFRESH_EVENT))}
            ariaLabel="Refresh goal data"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            className="rounded p-1 text-text-faint transition-colors hover:bg-surface-sunken hover:text-text-muted"
          />
        </HoverTooltip>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {loading ? (
          <p className="px-2 py-6 text-center text-xs text-text-faint">Loading current goal progress…</p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-text-faint">No goal cards match this search or range.</p>
        ) : (
          filtered.map((row) => (
            <CurrentGoalEntry
              key={`${row.staff_id}-${row.station}`}
              row={row}
              onSaved={fetchRows}
              selected={selected === String(row.staff_id)}
              onSelect={() => setParam((p) => p.set('staffId', String(row.staff_id)))}
            />
          ))
        )}
      </div>
    </nav>
  );
}
