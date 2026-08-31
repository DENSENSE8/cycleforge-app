'use client';

/**
 * Entity scan-station pane — the ONE host composition for any single record
 * rendered in station chrome.
 *
 * Promoted 2026-08-20 out of `SupportOrdersFocusHost`, which had hand-typed
 * this exact tree; `PackOrderPanel` and `ActiveOrderWorkspace` had typed it a
 * third and fourth time. Widened from `OrderStationPane` the same day: the host
 * was only order-typed by accident (it read `order.id` for a motion key and
 * nothing else), and `unit` / `sku` previews need the identical tree. What is
 * genuinely per-entity is the IDENTITY adapter and the CENTRE — both props.
 *
 * The tree is the Unbox anatomy:
 *
 *   StationScanPaneHost
 *     └ StationPanelRoot
 *         ├ StationContextBar placement="flow"   ← identity (CartonContextCard)
 *         └ StationWorkbench                     ← centre = ops-flow only
 *     └ StationDisplaysPushStack                 ← right edge = reference leaves
 *
 * **The right edge is Displays, never `RightRailHost`.** The desk inspector
 * beside a Displays column is the `kinetic-ledger.md` dual-right-edge ban, and
 * `unbox-station.md` bars the desk `InspectorActionFloor` from this column.
 *
 * **Displays open on the Root Index, never a guessed leaf** — and a requested
 * leaf that gated away falls back to the index rather than to `tabs[0]`.
 * Silently swapping in an unrelated display is the failure the index exists to
 * prevent.
 *
 * Displays nav state is CONTROLLED by the host: a leaf's own content often
 * needs to close the column (Pack's Locations leaf does), which an internally
 * owned `useState` could never reach.
 */

import { useCallback, useMemo, type ReactNode } from 'react';
import { motion, motionRole, useMotionRole } from '@/design-system/motion';
import type { SectionTab } from '@/design-system/components';
import {
  StationPanelRoot,
  StationScanPaneHost,
  StationWorkbench,
} from '@/components/station/workbench';
import { StationContextBar } from '@/components/station/entity-context';
import {
  StationDisplaysParkedRail,
  StationDisplaysPushStack,
  StationDisplaysUtilityRail,
  STATION_DISPLAY_INDEX,
  useYieldStationDisplaysOnAssistantOpen,
  type DisplayIndexRow,
} from '@/components/station/displays';

/** Displays nav: closed is `null`; open is the Root Index or a content leaf. */
export type StationDisplayNav = string;

/**
 * Whether this mount may commit work.
 *
 * **REQUIRED — no default, deliberately.** A defaulted classification is a
 * silent opt-in for every call site you did not visit, and the compiler stays
 * quiet about exactly the ones you missed (same law as `scanKind` /
 * `intakeSurface` in).
 *
 *   • `work`    — the operator's bench. A dock may mount; the centre commits.
 *   • `preview` — a read surface (`/search?sel=order:`). No dock, and the
 *                 centre paints its fields read-only. The Displays column
 *                 still WRITES: preview is about the centre, not the edge.
 */
export type StationStance = 'work' | 'preview';

export interface EntityStationPaneProps {
  /**
   * Identity of the record on screen — the motion key, so a record swap
   * crossfades instead of mutating in place. Any stable per-record value
   * (order id, serial unit id, sku code).
   */
  entityKey: string | number;
  stance: StationStance;
  /** `ShippedOrder → CartonContextCard` adapter — see `OrderStationIdentity`. */
  identity: ReactNode;
  /** Quiet trailing actions on the identity row (`StationMoreDetails`). */
  moreDetails?: ReactNode;
  /** Ops-flow only. Never a `SectionTabsSlider` — reference lives on Displays. */
  centre: ReactNode;
  /**
   * Station floor. `stance="preview"` must pass nothing: a read surface with a
   * commit floor is the "lobotomized work chrome" shape in reverse.
   */
  dock?: ReactNode;
  displayTabs: SectionTab[];
  displayIndexRows: DisplayIndexRow[];
  activeSideTab: StationDisplayNav | null;
  onSideTabChange: (next: StationDisplayNav | null) => void;
  /** Per-surface so the resize preference does not collide across stations. */
  storageKey: string;
  ariaLabel: string;
  centerTestId: string;
  displaysTestId: string;
  displaysResizeTestId: string;
  /** Extra centre scroll padding (Support reserves room for its editor dock). */
  scrollClassName?: string;
  /**
   * Centre scrollport `onScroll`. Forwarded to `StationWorkbench`, whose port is
   * internal — a centre that reacts to scroll depth (Search & Details
   * auto-collapse) has no other way to observe it. Throttle in the consumer.
   */
  onCentreScroll?: (event: { currentTarget: { scrollTop: number } }) => void;
  /**
   * Centre plane. `card` gives the flat white column a read surface wants, and
   * drops the ambient wash with it. Default keeps the scan-station sunken plane.
   */
  surface?: 'well' | 'card';
  /**
   * The centre claims the port height rather than being sized by its content.
   * Pass this when the centre's last block is a conversation whose composer
   * belongs on the floor of the pane. See `StationWorkbench` → `bodyFill`.
   */
  centreFill?: boolean;
}

export function EntityStationPane({
  entityKey,
  stance,
  identity,
  moreDetails,
  centre,
  dock = null,
  displayTabs,
  displayIndexRows,
  activeSideTab,
  onSideTabChange,
  storageKey,
  ariaLabel,
  centerTestId,
  displaysTestId,
  displaysResizeTestId,
  scrollClassName,
  onCentreScroll,
  surface = 'card',
  centreFill = false,
}: EntityStationPaneProps) {
  const { presence: paneMotion, transition: paneTransition } = useMotionRole(
    motionRole.swap.focus,
  );

  const closeDisplays = useCallback(() => onSideTabChange(null), [onSideTabChange]);
  useYieldStationDisplaysOnAssistantOpen(closeDisplays);

  // `←|` Open displays → the Root Index, never a guessed leaf.
  const openDisplaysIndex = useCallback(
    () => onSideTabChange(STATION_DISPLAY_INDEX),
    [onSideTabChange],
  );

  const resolvedSideTab: StationDisplayNav | null = useMemo(() => {
    if (!activeSideTab) return null;
    if (activeSideTab === STATION_DISPLAY_INDEX) return STATION_DISPLAY_INDEX;
    if (displayTabs.some((t) => t.id === activeSideTab)) return activeSideTab;
    return STATION_DISPLAY_INDEX;
  }, [activeSideTab, displayTabs]);

  const utilityRail = !activeSideTab ? (
    <StationDisplaysUtilityRail
      onOpenDisplays={openDisplaysIndex}
      indexRail={
        <StationDisplaysParkedRail
          rows={displayIndexRows}
          tabs={displayTabs}
          activeId={activeSideTab ?? null}
          onOpenLeaf={onSideTabChange}
        />
      }
    />
  ) : null;

  // A preview mount never carries a floor. Asserting here rather than in prose
  // keeps the stance honest at every future call site.
  const resolvedDock = stance === 'preview' ? null : dock;

  return (
    <motion.div
      key={entityKey}
      className="relative flex h-full min-h-0 w-full flex-col"
      initial={paneMotion.initial}
      animate={paneMotion.animate}
      exit={paneMotion.exit}
      transition={paneTransition}
      data-station-stance={stance}
    >
      <StationScanPaneHost
        displaysOpen={Boolean(resolvedSideTab)}
        centerTestId={centerTestId}
        utilityRail={utilityRail}
        center={
          <StationPanelRoot surface={surface}>
            <div className="relative flex min-h-0 flex-1 flex-col overflow-visible">
              <StationContextBar
                placement="flow"
                identity={identity}
                moreDetails={moreDetails}
              />

              <StationWorkbench
                ambientWash={false}
                className="relative z-0 flex-1 bg-transparent"
                reserveScrollClearance={false}
                // Identity is in-flow above this workbench — no guessed
                // stacked pt clearance.
                reserveIdentityClearance={false}
                bodyGap="none"
                bodyFill={centreFill}
                scrollClassName={scrollClassName}
                onScroll={onCentreScroll}
                footer={resolvedDock}
              >
                {centre}
              </StationWorkbench>
            </div>
          </StationPanelRoot>
        }
        displays={
          resolvedSideTab ? (
            <StationDisplaysPushStack
              ariaLabel={ariaLabel}
              storageKey={storageKey}
              testId={displaysTestId}
              resizeTestId={displaysResizeTestId}
              tabs={displayTabs}
              indexRows={displayIndexRows}
              activeTab={resolvedSideTab}
              onTabChange={onSideTabChange}
              onClose={closeDisplays}
            />
          ) : null
        }
      />
    </motion.div>
  );
}
