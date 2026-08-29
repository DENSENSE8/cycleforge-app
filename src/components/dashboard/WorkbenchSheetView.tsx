'use client';

/**
 * `WorkbenchSheetView` — the three-band Sheets flush workbench, as ONE shell.
 *
 * ```text
 * ┌ chrome (pinned, outside the scroll port) ─────────────────┐
 * │ Band 1  trailing CTAs (tabs PUBLISH to the bottom bar)     │
 * │ Band 3  triage — find · refine · inspector                 │
 * ├ body (WORKBENCH_SHEET_HOST) ──────────────────────────────┤
 * │ the grid / feed, optionally crossfading on the tab         │
 * ├ SheetBottomBar (sticky) ──────────────────────────────────┤
 * │ tabs                                     counts            │
 * └───────────────────────────────────────────────────────────┘
 * ```
 *
 * **Band 2 (KPI) is gone** — operator ruling 2026-08-29,
 * `docs/todo/one-sheet-table-sot-PLAN.md` § 3.5. Every table workbench lost its
 * metric strip; `/signals`, `/reports` and the operations dashboard keep theirs,
 * because those pages exist to show metrics and have no table to host. The `kpi`
 * and `band2` slots are removed rather than deprecated, so a strip cannot grow
 * back on a sheet by someone passing the prop.
 *
 * **Tabs moved to the bottom.** `WorkbenchChromeHeader` publishes them into the
 * sheet chrome; this shell renders {@link SheetBottomBar} under the body. The
 * strip's `onTabChange` is still the surface's own callback, so every deep link
 * and every URL-driven test is unaffected.
 *
 * **Why a shell and not five more copies.** Testing · Pack · Shipping · Arrival ·
 * Labels each re-typed the same assembly: `cn(WORKBENCH_SHEET_CHROME, 'flex
 * flex-col gap-0')`, the header's `rounded-none border-l-0 border-t-0 shadow-sm`,
 * the KPI band's three-callback wiring, `<div className={WORKBENCH_SHEET_HOST}>`,
 * the `AnimatePresence` + `motionRole.swap.focus` tab swap, and a `TableFallback`
 * that Pack and Shipping had each declared **byte-identically**. That is sameness
 * by assertion — 271 guards checking that every page imports the same consts —
 * where the fix is sameness by construction (briefing §1 / D1).
 *
 * **The chrome controller is injectable, and that is the load-bearing part.**
 * Most surfaces want the local one ({@link useWorkbenchSheetChrome}); To-ship
 * takes its `controlsEl` from `useOrdersViewChrome` **context**, because its
 * View-topic controls portal into the pushing right inspector. A shell that
 * always owned the state would have forced that surface to fork.
 *
 * **What it deliberately does NOT own:** the outer positioning wrapper (each
 * surface's overlay/bulk-bar needs differ) and the band components themselves.
 * Slots receive exactly the values they need — nothing takes a grab-bag props
 * object it half-uses.
 *
 * Recipe: `source-of-truth.md` → Ops table / spreadsheet surface shell → Sheets
 * flush mount. Guard: `workbench-sheet-view.guard.test.ts`.
 */

import { Suspense, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import { SheetBottomBar } from '@/components/sheet/SheetBottomBar';
import {
  SheetChromeProvider,
  useSheetChrome,
} from '@/components/sheet/sheet-chrome-context';
import { cn } from '@/utils/_cn';

/**
 * Band-1 header face on a flush sheet: no top/left seam — GlobalHeader owns the
 * seam above, the context rail owns the hairline to the left.
 *
 * **No `rounded-none`, deliberately.** `WorkbenchChromeHeader` applies
 * `cornerClass('flush')` unconditionally, so a call-site `rounded-none` is a
 * redundant override — and `dashboard-orders-sheet.guard` already bans it by
 * name ("no call-site rounded-none fight"). Consolidating the five station
 * copies onto this token is what surfaced that four of them were carrying an
 * override their sibling's guard forbids.
 */
const WORKBENCH_SHEET_TABS_CLASS = 'border-l-0 border-t-0 shadow-sm';

/** The one chrome host: bands are static siblings in ONE pinned stack. */
const WORKBENCH_SHEET_CHROME_STACK = cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0');

/** What the bands need from the surface. */
export interface WorkbenchSheetChrome {
  /**
   * Band-3 controls portal target (▦ column display, toolbars). `HTMLElement`,
   * not `HTMLDivElement` — every portal-target consumer already takes the wider
   * type, and To-ship's context publishes it that way.
   */
  controlsEl: HTMLElement | null;
  /**
   * Band-3 controls host. `null` on a surface whose Band 3 hosts no controls at
   * all (To-ship + Arrival: the View cluster lives on the inspector, so there is
   * nothing to portal into) — honest absence, not a no-op stub the bands call.
   */
  controlsSlotRef: ((el: HTMLDivElement | null) => void) | null;
}

/**
 * Local chrome controller — the Band-3 controls portal, and nothing else.
 *
 * `surface` used to select a per-staff KPI collapse preference; the band is
 * gone (2026-08-29). The parameter is still accepted and ignored because it is
 * a surface's own identity string, harmless to pass, and eleven call sites read
 * better naming which desk they are than not.
 */
export function useWorkbenchSheetChrome(_surface?: string): WorkbenchSheetChrome {
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);
  return { controlsEl, controlsSlotRef: setControlsEl };
}

/** Neutral stand-in at the grid's own geometry — never a spinner over a table. */
export function WorkbenchSheetFallback() {
  return <div className="min-h-[240px] flex-1 bg-surface-canvas" aria-hidden />;
}

interface WorkbenchSheetViewProps<TTab extends string | number> {
  chrome: WorkbenchSheetChrome;
  /** Band 1. Receives the flush face class so no surface re-types it. */
  tabs?: (p: { className: string }) => ReactNode;
  /**
   * Bottom-bar status extras (a sync stamp, a lane note) — left of the counts.
   */
  bottomStatus?: ReactNode;
  /** Band 3. Gets exactly the controller values the band takes. */
  triage?: (p: {
    controlsSlotRef: ((el: HTMLDivElement | null) => void) | null;
  }) => ReactNode;
  /**
   * Crossfade the body when this changes (the lifecycle tab). Omit to render the
   * body directly — a surface whose body is already keyed, or which must not
   * animate, opts out rather than passing a sentinel.
   */
  swapKey?: TTab;
  /** Body. `controlsEl` is the ▦ / toolbar portal target. */
  children: (p: { controlsEl: HTMLElement | null }) => ReactNode;
  /** In-flow siblings of the sheet inside the scroll shell (rails, overlays). */
  overlays?: ReactNode;
  /**
   * Class for the scroll PORT (not the shell). Deliberately has **no default**:
   * the stations pass `h-full bg-transparent`, Labels passes `h-full`, and
   * To-ship passes nothing at all. Defaulting it would have silently added
   * `h-full` to the To-ship scroll port during the 2d migration — a layout
   * change on the golden that no guard would have caught.
   */
  className?: string;
  /** Escape for a surface whose body is not the standard flush sheet host. */
  sheetHostClassName?: string;
  /** Style hook for the sheet host (spreadsheet zoom). */
  sheetHostStyle?: React.CSSProperties;
}

/**
 * Inner half — the parts that read the sheet chrome, which cannot be read in the
 * same component that mounts its provider.
 */
function WorkbenchSheetViewBody<TTab extends string | number>({
  chrome,
  tabs,
  bottomStatus,
  triage,
  swapKey,
  children,
  overlays,
  className,
  sheetHostClassName,
  sheetHostStyle,
}: WorkbenchSheetViewProps<TTab>) {
  const { presence, transition } = useMotionRole(motionRole.swap.focus);
  // Published by `WorkbenchChromeHeader` from the surface's own `tabs` props.
  const { tabs: publishedTabs } = useSheetChrome();

  const body = (
    <Suspense fallback={<WorkbenchSheetFallback />}>{children({ controlsEl: chrome.controlsEl })}</Suspense>
  );

  const hasChrome = Boolean(tabs || triage);

  return (
    <DashboardScrollShell
      className={className}
      chrome={
        hasChrome ? (
          <div className={WORKBENCH_SHEET_CHROME_STACK}>
            {/* Band 1 still renders — it carries the surface's trailing CTAs
                and its leading cluster. Its TAB RAIL no longer draws here; the
                header publishes it and the bottom bar below picks it up. */}
            {tabs?.({ className: WORKBENCH_SHEET_TABS_CLASS })}
            {triage?.({ controlsSlotRef: chrome.controlsSlotRef })}
          </div>
        ) : undefined
      }
    >
      <div className={cn(WORKBENCH_SHEET_HOST, sheetHostClassName)} style={sheetHostStyle}>
        {swapKey === undefined ? (
          body
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={swapKey}
              {...presence}
              transition={transition}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              {body}
            </motion.div>
          </AnimatePresence>
        )}
        {/*
          Sheet tabs + status counts, bottom of the sheet host. Rendered only
          when a strip was published or a surface supplied status: a sheet with
          neither would otherwise reserve 28px to say nothing.
        */}
        {publishedTabs || bottomStatus ? (
          <SheetBottomBar
            tabsAction={publishedTabs?.action}
            tabs={publishedTabs?.tabs}
            activeTab={publishedTabs?.activeTab}
            onTabChange={publishedTabs?.onTabChange}
            status={bottomStatus}
          />
        ) : null}
      </div>
      {overlays}
    </DashboardScrollShell>
  );
}

/**
 * Mounts the sheet chrome (so `WorkbenchChromeHeader` has somewhere to publish
 * its tabs, and grids have somewhere to report their counts) around the body.
 *
 * `tableId` is optional: this shell serves feeds and boards as well as grids,
 * and a surface with no prefs bucket still wants the tab strip relocated.
 */
export function WorkbenchSheetView<TTab extends string | number>(
  props: WorkbenchSheetViewProps<TTab> & { tableId?: string },
) {
  const { tableId = 'workbench', ...rest } = props;
  return (
    <SheetChromeProvider tableId={tableId}>
      <WorkbenchSheetViewBody {...rest} />
    </SheetChromeProvider>
  );
}
