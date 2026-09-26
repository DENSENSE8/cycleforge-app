'use client';

/** Entity scan-station pane — the ONE host composition for any single record rendered in station chrome. */

import { useCallback, useMemo, type ReactNode } from 'react';
import { motion, motionRole, useMotionRole } from '@/design-system/motion';
import type { SectionTab } from '@/design-system/components';
import {
  StationPanelRoot,
  StationScanPaneHost,
  StationWorkbench,
} from '@/components/station/workbench';
import { STATION_SCAN_WELL_CLASS } from '@/components/station/scan-depth';
import { StationContextBar } from '@/components/station/entity-context';
import {
  StationDisplaysParkedRail,
  StationDisplaysPushStack,
  StationDisplaysUtilityRail,
  STATION_DISPLAY_INDEX,
  resolveDisplaysActiveTab,
  useYieldStationDisplaysOnAssistantOpen,
  type DisplayIndexRow,
} from '@/components/station/displays';

/** Displays nav: closed is `null`; open is the Root Index or a content leaf. */
export type StationDisplayNav = string;

/** Whether this mount may commit work. */
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

  const resolvedSideTab: StationDisplayNav | null = useMemo(
    () =>
      resolveDisplaysActiveTab(
        activeSideTab,
        displayTabs.map((t) => t.id),
      ),
    [activeSideTab, displayTabs],
  );

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
                <div className={STATION_SCAN_WELL_CLASS}>{centre}</div>
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
