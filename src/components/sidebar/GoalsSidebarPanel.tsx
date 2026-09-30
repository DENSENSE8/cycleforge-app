'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { ViewDropdown } from '@/components/ui/ViewDropdown';
import { Loader2, RefreshCw, X } from '@/components/Icons';
import { sectionLabel, dataValue, fieldLabel } from '@/design-system/tokens/typography/presets';
import { getAllStaffGoals, invalidateStaffGoalsCache, type GoalRow } from '@/lib/staffGoalsCache';
import { getStaffThemeById, stationThemeColors } from '@/utils/staff-colors';
import { SearchBar } from '@/components/ui/SearchBar';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';

/** Ex-Admin › Goals home after the dissolution: the monitor desk's Goals mode. */
const OPERATIONS_GOALS_PATH = '/operations';

const GOAL_VIEW_OPTIONS = [
  { value: 'all', label: 'All Staff' },
  { value: 'behind', label: 'Below 70%' },
  { value: 'on-track', label: '70% - 99%' },
  { value: 'exceeded', label: '100%+' },
] as const;

export type GoalViewMode = (typeof GOAL_VIEW_OPTIONS)[number]['value'];

function emitGoalsRefresh() {
  window.dispatchEvent(new CustomEvent('admin-goals-refresh'));
}

export function getGoalProgress(row: GoalRow) {
  const percent = row.daily_goal > 0 ? Math.round((row.today_count / row.daily_goal) * 100) : 0;
  return { percent, progress: row.daily_goal > 0 ? row.today_count / row.daily_goal : 0 };
}

function getGoalStatus(percent: number, current: number, goal: number) {
  if (percent <= 0 || current <= 0) {
    return { label: 'Not Started', className: 'text-text-faint' };
  }
  if (current > goal || percent > 100) {
    return { label: 'Above Goal', className: 'text-cyan-700' };
  }
  if (current === goal || percent === 100) {
    return { label: 'Hit Goal', className: 'text-emerald-700' };
  }
  if (percent >= 75) {
    return { label: 'On the Way', className: 'text-blue-700' };
  }
  if (percent >= 40) {
    return { label: 'Making Progress', className: 'text-sky-700' };
  }
  return { label: 'Getting Started', className: 'text-indigo-600' };
}

export function matchesView(progress: number, goalView: GoalViewMode) {
  if (goalView === 'behind') return progress < 0.7;
  if (goalView === 'on-track') return progress >= 0.7 && progress < 1;
  if (goalView === 'exceeded') return progress >= 1;
  return true;
}

export function CurrentGoalEntry({
  row,
  onSaved,
  selected,
  onSelect,
}: {
  row: GoalRow;
  onSaved: () => Promise<void>;
  selected: boolean;
  onSelect: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(row.daily_goal));
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const theme = getStaffThemeById(row.staff_id);
  const colors = stationThemeColors[theme];
  const { percent } = getGoalProgress(row);
  const statusDisplay = getGoalStatus(percent, row.today_count, row.daily_goal);

  useEffect(() => {
    setEditValue(String(row.daily_goal));
  }, [row.daily_goal]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    const nextGoal = parseInt(editValue, 10);
    if (!Number.isFinite(nextGoal) || nextGoal <= 0 || nextGoal === row.daily_goal) {
      setIsEditing(false);
      setEditValue(String(row.daily_goal));
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch('/api/staff-goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: row.staff_id,
          dailyGoal: nextGoal,
          station: row.station,
        }),
      });

      if (!res.ok) throw new Error('Failed to save goal');

      invalidateStaffGoalsCache(String(row.staff_id));
      emitGoalsRefresh();
      await onSaved();
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      setEditValue(String(row.daily_goal));
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`cursor-pointer rounded-sm border bg-surface-card px-3 py-2.5 space-y-1.5 transition-all hover:shadow-sm ${
        selected
          ? 'border-blue-300 ring-1 ring-blue-500/30 shadow-sm shadow-blue-200/40'
          : 'border-border-hairline hover:border-border-soft'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`h-5 w-5 rounded-sm ${colors.light} flex items-center justify-center text-role-eyebrow ${colors.text}`}>
            {row.name[0]}
          </div>
          <div className="min-w-0">
            <p className="truncate text-role-caption font-semibold text-text-default">{row.name}</p>
            <p className="truncate text-role-eyebrow font-medium text-text-faint">
              {sentenceCaseLabel(row.station)}
            </p>
          </div>
        </div>
        <span className={`text-role-eyebrow ${statusDisplay.className}`}>
          {statusDisplay.label}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className={`h-full ${colors.bg}`}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>

        <div className="relative flex min-w-[44px] items-center justify-end">
          {!isEditing ? (
            /* ds-raw-button: inline edit-affordance counter (today/goal with underlined editable segment) — heightless inline layout, not the Button primitive shape */
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              className="ds-raw-button flex items-center gap-0.5 text-role-micro tabular-nums text-text-muted transition-colors hover:text-blue-600"
            >
              <span>{row.today_count}</span>
              <span className="text-text-faint">/</span>
              <span className="underline decoration-slate-200 underline-offset-2 decoration-2 hover:decoration-blue-400">
                {row.daily_goal}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-role-micro tabular-nums text-text-faint">{row.today_count}/</span>
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => {
                  void handleSave();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void handleSave();
                  } else if (e.key === 'Escape') {
                    setIsEditing(false);
                    setEditValue(String(row.daily_goal));
                  }
                }}
                disabled={isSaving}
                className="w-8 border-b-2 border-blue-500 bg-blue-50/50 py-0 text-center text-role-micro tabular-nums text-blue-700 outline-none"
              />
              {isSaving && (
                <Loader2 className="absolute -right-4 h-2.5 w-2.5 animate-spin text-blue-500" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function GoalsSidebarPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchValue = searchParams.get('search') || '';
  const goalView = (searchParams.get('goalView') as GoalViewMode) || 'all';
  const selectedStaffId = (() => {
    const raw = searchParams.get('staffId');
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const selectStaff = (id: number) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('mode', 'goals');
    next.delete('section');
    next.set('staffId', String(id));
    router.replace(`${OPERATIONS_GOALS_PATH}?${next.toString()}`);
  };

  const [rows, setRows] = useState<GoalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const updateParams = (patch: { search?: string; goalView?: GoalViewMode }) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('section', 'goals');

    if (patch.search !== undefined) {
      const value = patch.search.trim();
      if (value) nextParams.set('search', value);
      else nextParams.delete('search');
    }

    if (patch.goalView !== undefined) {
      if (patch.goalView === 'all') nextParams.delete('goalView');
      else nextParams.set('goalView', patch.goalView);
    }

    const nextSearch = nextParams.toString();
    // Ex-Admin › Goals lives at `/operations?mode=goals` since the dissolution;
    // the mode param rides in `nextParams`, so writing the desk path keeps the
    // operator on the page whose filters this rail owns.
    router.replace(nextSearch ? `${OPERATIONS_GOALS_PATH}?${nextSearch}` : OPERATIONS_GOALS_PATH);
  };

  const clearFilters = () => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('mode', 'goals');
    nextParams.delete('section');
    nextParams.delete('search');
    nextParams.delete('goalView');
    const nextSearch = nextParams.toString();
    router.replace(nextSearch ? `${OPERATIONS_GOALS_PATH}?${nextSearch}` : OPERATIONS_GOALS_PATH);
  };

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
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      invalidateStaffGoalsCache();
      void fetchRows();
    };

    window.addEventListener('admin-goals-refresh', handleRefresh as EventListener);
    return () => window.removeEventListener('admin-goals-refresh', handleRefresh as EventListener);
  }, []);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    return rows
      .filter((row) => {
        const matchesSearch =
          !normalizedSearch ||
          row.name.toLowerCase().includes(normalizedSearch) ||
          row.role.toLowerCase().includes(normalizedSearch);
        return matchesSearch && matchesView(getGoalProgress(row).progress, goalView);
      })
      .sort((a, b) => getGoalProgress(b).percent - getGoalProgress(a).percent || a.name.localeCompare(b.name));
  }, [goalView, rows, searchValue]);

  return (
    <SidebarShell
      className={appChromeClass}
      headerAbove={
        <>
          <div className="border-b border-border-soft">
            <ViewDropdown
              options={GOAL_VIEW_OPTIONS}
              value={goalView}
              onChange={(nextValue) => updateParams({ goalView: nextValue as GoalViewMode })}
              variant="boxy"
              buttonClassName={`h-full w-full appearance-none bg-surface-card px-4 py-3 pr-8 text-left ${fieldLabel} outline-none transition-all hover:bg-surface-hover`}
              optionClassName={fieldLabel}
            />
          </div>
          {/* In-context list filter — local base SearchBar. The global header
              pill stays global. */}
          <div className={`${SIDEBAR_GUTTER} pt-3 pb-2`}>
            <SearchBar
              size="compact"
              variant="blue"
              value={searchValue}
              onChange={(value) => updateParams({ search: value })}
              onClear={() => updateParams({ search: '' })}
              placeholder="Filter staff or role"
            />
          </div>
        </>
      }
      bodyClassName="pb-4 space-y-5"
    >
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className={sectionLabel}>Current Goals</p>
            <span className="text-role-micro font-semibold text-text-faint">
              {filteredRows.length}
            </span>
          </div>

          {loading ? (
            <div className="rounded-sm border border-dashed border-border-soft px-3 py-4 text-xs text-text-soft">
              Loading current goal progress...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border-soft px-3 py-4 text-xs text-text-soft">
              No current goal cards match this search or goal range.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRows.map((row) => (
                <CurrentGoalEntry
                  key={`${row.staff_id}-${row.station}`}
                  row={row}
                  onSaved={fetchRows}
                  selected={selectedStaffId === row.staff_id}
                  onSelect={() => selectStaff(row.staff_id)}
                />
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-sm border border-border-soft">
          <div className="border-b border-border-soft px-4 py-3">
            <p className={sectionLabel}>Goal Tools</p>
          </div>

          {/* ds-raw-button: full-width menu row (two-line text block + bordered icon cell) — not the Button primitive shape */}
          <button
            type="button"
            onClick={() => {
              emitGoalsRefresh();
              void fetchRows();
            }}
            className="ds-raw-button flex w-full items-center justify-between border-b border-border-soft px-4 py-3 text-left transition-colors hover:bg-surface-hover"
          >
            <div>
              <p className={dataValue}>Refresh Goal Data</p>
              <p className={`mt-0.5 ${fieldLabel} text-text-soft`}>Reload counts, goals, and KPI history</p>
            </div>
            <span className="inline-flex h-10 w-12 items-center justify-center border-l border-border-soft text-text-muted">
              <RefreshCw className="h-3.5 w-3.5" />
            </span>
          </button>

          {/* ds-raw-button: full-width menu row (two-line text block + bordered icon cell) — not the Button primitive shape */}
          <button
            type="button"
            onClick={clearFilters}
            className="ds-raw-button flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-hover"
          >
            <div>
              <p className={dataValue}>Clear Filters</p>
              <p className={`mt-0.5 ${fieldLabel} text-text-soft`}>Reset search and goal range filters</p>
            </div>
            <span className="inline-flex h-10 w-12 items-center justify-center border-l border-border-soft text-text-muted">
              <X className="h-3.5 w-3.5" />
            </span>
          </button>
        </section>
    </SidebarShell>
  );
}
