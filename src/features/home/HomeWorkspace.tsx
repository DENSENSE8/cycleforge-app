'use client';

/**
 * Home ("/") workbench shell.
 *
 * Reads `?mode=` (the single source of truth) and renders the matching region
 * inside a height-bounded host. `today` is the default and stays on the bare `/`
 * path. Mirrors `OperationsWorkspace`'s mode-router shape.
 *
 * **This file renders no chrome of its own.** It used to stack a page header
 * (eyebrow + mode label) over a full-width `HorizontalButtonSlider` of the six
 * modes — the twin of the GlobalHeader control that `display/workbench.md`
 * forbids ("L2 Mode lives in GlobalHeader… never remount a full-width mode rail
 * as a twin"), and 60px of permanent vertical cost on the first screen an
 * operator opens. Home's modes are now registered in `SIDEBAR_PAGE_NAV`, so
 * `HeaderPageSwitcher` serves them exactly like Dashboard's and Operations'.
 *
 * Composition (do not rebuild):
 *   today → `MyDayWorkspace` (the Today triage workbench)
 *   forge → `AgenticLoopLiveConsole`, self-gated on `operations.plans.view`
 *   tasks / collab / brief → Phase B/D/E teaching seams
 */

import { MyDayWorkspace } from '@/features/my-day/MyDayWorkspace';
import { AgenticLoopLiveConsole } from '@/components/forge/AgenticLoopLiveConsole';
import { useHomeMode } from './useHomeMode';
import { HomeTasksMode } from './HomeTasksMode';
import { HomeInboxMode } from './HomeInboxMode';
import { HomeCollabPanel, HomeBriefPanel } from './HomeModePanels';

export function HomeWorkspace() {
  const { mode } = useHomeMode();

  return (
    <div className="flex h-[calc(100vh-64px)] min-h-0 flex-col overflow-hidden bg-surface-canvas">
      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'today' && <MyDayWorkspace />}
        {mode === 'inbox' && <HomeInboxMode />}
        {mode === 'forge' && (
          <div className="flex h-full min-h-0 flex-col overflow-hidden px-4 py-4">
            <AgenticLoopLiveConsole />
          </div>
        )}
        {mode === 'tasks' && <HomeTasksMode />}
        {mode === 'collab' && <HomeCollabPanel />}
        {mode === 'brief' && <HomeBriefPanel />}
      </div>
    </div>
  );
}
