'use client';

/**
 * Home ("/") workbench shell.
 *
 * Reads `?mode=` (the single source of truth) and renders the matching region
 * inside a height-bounded host. `daily` is the default and stays on the bare `/`
 * path. Mirrors `OperationsWorkspace`'s mode-router shape.
 *
 * **This file renders no chrome of its own.** It used to stack a page header
 * (eyebrow + mode label) over a full-width `HorizontalButtonSlider` of the six
 * modes — the twin of the GlobalHeader control that `display/workbench.md`
 * forbids ("L2 Mode lives in GlobalHeader… never remount a full-width mode rail
 * as a twin"), and 60px of permanent vertical cost on the first screen an
 * operator opens.
 *
 * Home's modes are registered in `SIDEBAR_PAGE_NAV`, and since 2026-08-31 the
 * page's own frame draws them: `app/page.tsx` mounts `DeskPageLayout`, so Daily
 * · Today · Tasks ride the same tab row every desk and station wears. That is
 * not a return of the banned rail — the ban was on a page-local full-width twin
 * of the header control; this row is the product's ONE page chrome, sized to
 * the stage.
 *
 * It also no longer paints its own surface. The frame's card owns that, and a
 * `bg-surface-canvas` child inside a `bg-surface-card` card was the ground
 * showing through the object sitting on it.
 *
 * Composition (do not rebuild):
 *   daily → `HomeDailyMode` (the daily checklist + the day's report) — DEFAULT
 *   today → `MyDayWorkspace` (the My Day triage workbench)
 *   tasks → `TasksWorkbench` (the staffer's own `staff_todos`, as a spreadsheet)
 *
 * TWO modes as of 2026-08-19. `inbox` and `tasks` were deleted; `forge` moved to
 * its own `/forge` route (see `app/forge/page.tsx`). `collab` and `brief` went
 * earlier the same day. Home is the first screen of a shift — the modes it keeps
 * are the ones an operator actually opens.
 */

import { MyDayWorkspace } from '@/features/my-day/MyDayWorkspace';
import { useHomeMode } from './useHomeMode';
import { HomeDailyMode } from './HomeDailyMode';
import { TasksWorkbench } from '@/features/tasks/TasksWorkbench';

export function HomeWorkspace() {
  const { mode } = useHomeMode();

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        {mode === 'daily' && <HomeDailyMode />}
        {mode === 'today' && <MyDayWorkspace />}
        {mode === 'tasks' && <TasksWorkbench />}
      </div>
    </div>
  );
}
