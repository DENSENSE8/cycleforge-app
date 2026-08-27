'use client';

/**
 * `WorkbenchSheetView` — the three-band Sheets flush workbench, as ONE shell.
 *
 * ```text
 * ┌ chrome (pinned, outside the scroll port) ─────────────────┐
 * │ Band 1  tabs + trailing CTAs                              │
 * │ Band 2  WorkbenchKpiBand (snap-collapse; omit ⇒ no band)   │
 * │ Band 3  triage — find · refine · KPI toggle · inspector    │
 * ├ body (WORKBENCH_SHEET_HOST) ──────────────────────────────┤
 * │ the grid / feed, optionally crossfading on the tab         │
 * └───────────────────────────────────────────────────────────┘
 * ```
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
 * Most surfaces want the local one ({@link useWorkbenchSheetChrome}). To-ship
 * takes its `controlsEl` / KPI state from `useOrdersViewChrome` **context**,
 * because its View cluster lives on the pushing right inspector rather than on
 * Band 3 — a ruled SoT split (`workbench-ops-queue.md`), not drift. A shell that
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
import {
  WorkbenchKpiBand,
  type WorkbenchKpiSurfaceId,
} from '@/components/dashboard/workbench-kpi-collapse';
import { useWorkbenchKpiCollapsed } from '@/hooks/useWorkbenchKpiCollapsed';
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

/**
 * What the bands need from the surface. `kpiOpen` + `toggleKpi` is the only
 * shape both controller flavours share: the local hook exposes
 * `setCollapsed(true|false)` and To-ship's context exposes a bare `onToggleKpi`,
 * and a toggle expresses both without either side re-deriving the other.
 */
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
  kpiOpen: boolean;
  toggleKpi: () => void;
}

/**
 * Local chrome controller — per-staff KPI collapse + the Band-3 controls portal.
 *
 * `surface` is **optional**: a two-band sheet (tabs + triage, no KPI — Pickup,
 * the Review family, Locations, …) has no collapse preference to read, and
 * passing a surface id there would persist a pref nothing can toggle. Omitted,
 * the KPI half is inert and only the controls portal is live.
 */
export function useWorkbenchSheetChrome(surface?: WorkbenchKpiSurfaceId): WorkbenchSheetChrome {
  const [controlsEl, setControlsEl] = useState<HTMLDivElement | null>(null);
  const { collapsed, toggleCollapsed } = useWorkbenchKpiCollapsed(surface ?? null);
  return {
    controlsEl,
    controlsSlotRef: setControlsEl,
    kpiOpen: !collapsed,
    toggleKpi: toggleCollapsed,
  };
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
   * Band 2 body, wrapped in {@link WorkbenchKpiBand} — the per-staff,
   * snap-collapsible KPI band. Omit for a surface with no KPI (honest absence).
   */
  kpi?: ReactNode;
  /**
   * Band 2 as a RAW band — for a strip that is not a per-staff KPI preference
   * and therefore must not be collapsible. FBA is the case: its stage counts are
   * **mode-scoped** (they change with the tab, and toggling one filters the
   * board), so a per-staff collapse pref would be the wrong control entirely.
   *
   * Mutually exclusive with `kpi`: a band is one or the other, and passing both
   * would stack two Band 2s.
   */
  band2?: ReactNode;
  /** Band 3. Gets exactly the controller values the bands take. */
  triage?: (p: {
    controlsSlotRef: ((el: HTMLDivElement | null) => void) | null;
    kpiOpen: boolean;
    onToggleKpi: () => void;
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

export function WorkbenchSheetView<TTab extends string | number>({
  chrome,
  tabs,
  kpi,
  band2,
  triage,
  swapKey,
  children,
  overlays,
  className,
  sheetHostClassName,
  sheetHostStyle,
}: WorkbenchSheetViewProps<TTab>) {
  const { presence, transition } = useMotionRole(motionRole.swap.focus);

  const body = (
    <Suspense fallback={<WorkbenchSheetFallback />}>{children({ controlsEl: chrome.controlsEl })}</Suspense>
  );

  if (process.env.NODE_ENV !== 'production' && kpi && band2) {
    throw new Error(
      'WorkbenchSheetView: pass `kpi` (snap-collapsible KPI) OR `band2` (raw strip), never both — they are the same band.',
    );
  }
  const hasChrome = Boolean(tabs || kpi || band2 || triage);

  return (
    <DashboardScrollShell
      className={className}
      chrome={
        hasChrome ? (
          <div className={WORKBENCH_SHEET_CHROME_STACK}>
            {tabs?.({ className: WORKBENCH_SHEET_TABS_CLASS })}
            {kpi ? (
              <WorkbenchKpiBand
                open={chrome.kpiOpen}
                // Snap is binary and instant; the controller only exposes a
                // toggle, so guard each direction against a redundant flip.
                onSnapCollapse={() => {
                  if (chrome.kpiOpen) chrome.toggleKpi();
                }}
                onSnapExpand={() => {
                  if (!chrome.kpiOpen) chrome.toggleKpi();
                }}
              >
                {kpi}
              </WorkbenchKpiBand>
            ) : (
              band2 ?? null
            )}
            {triage?.({
              controlsSlotRef: chrome.controlsSlotRef,
              kpiOpen: chrome.kpiOpen,
              onToggleKpi: chrome.toggleKpi,
            })}
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
      </div>
      {overlays}
    </DashboardScrollShell>
  );
}
