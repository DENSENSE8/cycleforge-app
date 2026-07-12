'use client';

/**
 * Home ("/") workbench shell — Phase A of the home-ops-tv-collab plan.
 *
 * Reads `?mode=` (the single source of truth, owned by the mode rail) and
 * renders the matching region inside a height-bounded host. This is the
 * Workbench contract for Home (plan §2): pick a mode, act in the region.
 * `today` is the default and stays on the bare `/` path. Mirrors
 * `OperationsWorkspace`'s mode-router shape.
 *
 * Composition (do not rebuild — plan §21):
 *   today → the real `MyDayWorkspace` (ranked personal work + onboarding pane)
 *   forge → the real `AgenticLoopLiveConsole` (live master-plan + agent),
 *           self-gated on `operations.plans.view`
 *   tasks / collab / brief → Phase B/D/E teaching seams
 *
 * The rail lives at the top of the page here (self-contained). The house-final
 * placement is the sidebar (sidebar-mode law #1) via a `HomeSidebarPanel` +
 * `sidebar-navigation` route key — deferred so this increment doesn't touch the
 * dual mode-SoT + round-trip guard (plan §21/§30).
 */

import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { MyDayWorkspace } from '@/features/my-day/MyDayWorkspace';
import { AgenticLoopLiveConsole } from '@/components/forge/AgenticLoopLiveConsole';
import { HOME_MODE_ITEMS, homeModeLabel, type HomeMode } from './home-modes';
import { useHomeMode } from './useHomeMode';
import { HomeTasksMode } from './HomeTasksMode';
import { HomeCollabPanel, HomeBriefPanel } from './HomeModePanels';

export function HomeWorkspace() {
  const { mode, updateMode } = useHomeMode();

  return (
    <div className="flex h-[calc(100vh-64px)] min-h-0 flex-col overflow-hidden bg-surface-canvas">
      <header className="shrink-0 border-b border-border-soft bg-surface-card/90 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-text-soft">Home</p>
            <span className="text-text-soft/60">·</span>
            <h1 className="text-sm font-bold text-text-strong">{homeModeLabel(mode)}</h1>
          </div>
          <HorizontalButtonSlider
            items={HOME_MODE_ITEMS}
            value={mode}
            onChange={(id) => updateMode(id as HomeMode)}
            variant="nav"
            dense
            className="w-full"
            aria-label="Home modes"
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'today' && <MyDayWorkspace />}
        {mode === 'forge' && (
          <div className="h-full overflow-hidden px-4 py-4">
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
