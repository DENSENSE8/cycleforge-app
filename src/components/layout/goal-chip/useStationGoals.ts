'use client';

import { useCallback, useEffect, useState } from 'react';
import { activeKey, asStation, readLS, writeLS, type StationGoal, type StationKey } from './goal-chip-shared';

type GoalsPayload = {
  primary: string | null;
  stations?: Array<{ station: string; is_primary: boolean; daily_goal: number; today_count: number }>;
};

function parseGoals(d: GoalsPayload | null): { goals: StationGoal[]; primary: StationKey } | null {
  const rows = d?.stations ?? [];
  if (rows.length === 0) return null;
  const parsed: StationGoal[] = rows
    .map((row) => {
      const st = asStation(row.station);
      if (!st) return null;
      const target = Number(row.daily_goal) > 0 ? Number(row.daily_goal) : 50;
      return { station: st, isPrimary: Boolean(row.is_primary), target, scanCount: Number(row.today_count) || 0 };
    })
    .filter((x): x is StationGoal => x !== null);
  if (parsed.length === 0) return null;
  const primary = asStation(d?.primary) ?? parsed.find((g) => g.isPrimary)?.station ?? parsed[0].station;
  return { goals: parsed, primary };
}

/**
 * Loads the logged-in user's admin-assigned station goals (+ live deduped today
 * counts) from GET /api/staff-goals/me, and tracks the active station. The
 * active station resolves to: a still-valid current pick → the LS-remembered one
 * → the primary. `reload()` is called on mount and whenever the popover opens.
 *
 * `goalsLoading` is true only until the first fetch for the current `staffId`
 * settles — popover refreshes must not flip it (that would flicker the header
 * face back to the idle placeholder).
 */
export function useStationGoals(staffId: number | null) {
  const [goals, setGoals] = useState<StationGoal[] | null>(null);
  const [active, setActive] = useState<StationKey | null>(null);
  /** Staff id whose first fetch has settled; mismatch with `staffId` ⇒ loading. */
  const [readyForStaffId, setReadyForStaffId] = useState<number | null>(null);

  const applyPayload = useCallback((d: GoalsPayload | null, forStaffId: number) => {
    const parsed = parseGoals(d);
    if (!parsed) {
      setGoals(null);
      return;
    }
    setGoals(parsed.goals);
    setActive((cur) => {
      const valid = (s: StationKey | null) => !!s && parsed.goals.some((g) => g.station === s);
      if (valid(cur)) return cur;
      const stored = asStation(readLS<string>(activeKey(forStaffId), ''));
      return valid(stored) ? stored : parsed.primary;
    });
  }, []);

  const reload = useCallback(() => {
    if (!staffId) return;
    const id = staffId;
    fetch('/api/staff-goals/me', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GoalsPayload | null) => applyPayload(d, id))
      .catch(() => setGoals(null));
  }, [staffId, applyPayload]);

  // Initial load (and staffId change): gate the header face until this settles.
  useEffect(() => {
    if (!staffId) {
      setGoals(null);
      setActive(null);
      return;
    }

    let cancelled = false;
    setGoals(null);
    setActive(null);

    fetch('/api/staff-goals/me', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: GoalsPayload | null) => {
        if (cancelled) return;
        applyPayload(d, staffId);
      })
      .catch(() => {
        if (cancelled) return;
        setGoals(null);
      })
      .finally(() => {
        if (!cancelled) setReadyForStaffId(staffId);
      });

    return () => {
      cancelled = true;
    };
  }, [staffId, applyPayload]);

  const selectStation = useCallback(
    (st: StationKey) => {
      if (!staffId) return;
      setActive(st);
      writeLS(activeKey(staffId), st);
    },
    [staffId],
  );

  return {
    goals,
    active,
    selectStation,
    reload,
    /** First fetch for this staffId still in flight — not popover refresh. */
    goalsLoading: staffId != null && readyForStaffId !== staffId,
  };
}
