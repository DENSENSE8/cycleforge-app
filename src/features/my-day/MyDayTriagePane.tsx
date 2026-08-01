'use client';

/**
 * My Day triage pane — the focus surface beside {@link MyDayRail}.
 *
 * **Thin shell, deliberately.** The plan's F1 target is a categorized
 * open/done triage board, but `MyDayFeed` (`src/lib/my-day/my-day-types.ts`)
 * carries no `category` / `open` / `done` today — those are born on the backend
 * `TriageTask` in phases B0–B3, which do not exist in this repo yet. So F0
 * names the module and wraps exactly what already renders here (onboarding +
 * the selected-record context pane); inventing categories or placeholder
 * buckets now would make the surface look more finished than the data is.
 *
 * Plan: `docs/todo/daily-triage-FRONTEND-PLAN-VALIDATION.md` (F0 → F1).
 */

import type { MyDaySelectedItem } from '@/lib/my-day/my-day-types';
import { MyDayOnboardingPanel } from './MyDayOnboardingPanel';
import { MyDayContextPane } from './MyDayContextPane';

export function MyDayTriagePane({ selected }: { selected: MyDaySelectedItem | null }) {
  return (
    <div className="hidden min-h-0 min-w-0 flex-1 flex-col lg:flex">
      <MyDayOnboardingPanel />
      <MyDayContextPane selected={selected} />
    </div>
  );
}
