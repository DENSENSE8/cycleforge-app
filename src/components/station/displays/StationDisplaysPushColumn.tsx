'use client';

/** Station Displays right-edge **push** column — shared shell for {@link StationDisplaysPushStack} (Unbox golden · Arrival · Testing · Pack… */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from '@/components/Icons';
import {
  STATION_DISPLAYS_BAND_CLASS,
  STATION_DISPLAYS_COLUMN_CLASS,
  STATION_DISPLAYS_STRIP_CLASS,
} from '@/components/station/scan-depth';
import {
  STATION_DISPLAYS_PUSH_TOP_BAND,
  STATION_DISPLAYS_PUSH_TOP_CELL,
  STATION_DISPLAYS_PUSH_TOP_CLUSTER,
} from '@/components/station/entity-context/station-identity-chrome';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { StationDisplaysEdgeToggle } from './StationDisplaysEdgeToggle';
import { STATION_DISPLAYS_HEADER_ACTION_FACE } from './StationDisplaysHeaderActions';
import { useStationDisplaysToggleHotkey } from './displays-toggle-hotkey';
import {
  EDGE_RESIZE_COLLAPSE_SLACK_PX,
  useEscapeClose,
  useHorizontalEdgeResize,
} from '@/design-system/hooks';
import {
  KEYBOARD_REGION_ACTIVE_ATTR,
  KEYBOARD_REGION_ATTR,
} from '@/lib/keyboard/keyboard-region-owner';
import { LIST_KEY_REGION_OPEN_ATTR } from '@/lib/keyboard/list-key-scope';
import { useKeyboardRegionOwner } from '@/lib/keyboard/useKeyboardRegionOwner';
import { IconButton } from '@/design-system/primitives';
import { STATION_DISPLAYS_MIN_WIDTH_PX } from '@/components/station/workbench/workbench-layout';
import {
  getRightRailFrame,
  getServerRightRailFrame,
  requestStationCollapseContext,
  setStationDisplaysSashArmed,
  setStationDisplaysSashDragging,
  setStationPushDemand,
  subscribeRightRailFrame,
  subscribeStationFarRailRequest,
  UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX,
} from '@/lib/right-rail/frame';
import { cn } from '@/utils/_cn';
/** Host trailing padding while a push column is mounted. */
/** Host trailing pad while a Displays push column is mounted (flush — no-op). */
export const STATION_DISPLAYS_HOST_PAD_CLASS = '';

/** Default open width preference for Unbox Displays / Ticket / Claim / tool. */
const STATION_DISPLAYS_DEFAULT_WIDTH_PX = 420;

const STATION_DISPLAYS_PUSH_EXPAND_LABEL = 'Widen panel';
const STATION_DISPLAYS_PUSH_COLLAPSE_LABEL = 'Restore panel width';

/** `relative z-header` keeps maximize / trailing cursor above the inset resize sash's elevated hairline paint. */
export function StationDisplaysPushColumn({
  ariaLabel,
  testId = 'receiving-displays-push',
  dataTool,
  storageKey = 'unbox-displays-push-width',
  maxWidthPx,
  resizeLabel = 'Resize displays panel',
  resizeTestId = 'unbox-displays-push-resize',
  resizeTooltip = 'Drag to resize · drag past min to park',
  onClose,
  onEscape,
  headerNav,
  headerRightSlot,
  headerActions,
  subHeader,
  parkedRail,
  children,
}: {
  ariaLabel: string;
  testId?: string;
  /** Optional `data-tool` discriminator (tool push). */
  dataTool?: string;
  /** Per-surface width preference key. */
  storageKey?: string;
  /**
   * Optional absolute ceiling for this surface. Omit for station Displays —
   * the sash clamps at {@link RightRailFrameSnapshot.stationDisplaysCapPx}.
   * Pass only when a demo / special surface needs a tighter taste cap.
   */
  maxWidthPx?: number;
  resizeLabel?: string;
  resizeTestId?: string;
  resizeTooltip?: string;
  onClose: () => void;
  /**
   * Esc handler — defaults to {@link onClose}. Drill-down hosts pass a pop
   * (leaf → index) so Esc does not dismiss the whole column from a leaf.
   */
  onEscape?: () => void;
  /**
   * LEFT group of the header band — history `← →` + the current title
   * ({@link StationDisplayLeafHeader}). Merged into this band 2026-08-18; it
   * used to be its own sticky row inside the body.
   */
  headerNav?: ReactNode;
  /**
   * Leading peer of the header band's trailing cluster — Unbox: procedure
   * progress ring. A read-only metric, so it sits left of the action verbs.
   */
  headerRightSlot?: ReactNode;
  /** Carton Macro verbs — top-right of the band, `⋯` last ({@link StationDisplaysHeaderActions}). */
  headerActions?: ReactNode;
  /** Row 2 — a full-width band directly under the header, above the body. */
  subHeader?: ReactNode;
  /** PARKED-strip content, given the restore callback so a cell can open the column ON the display it names. */
  parkedRail?: (open: () => void) => ReactNode;
  children: ReactNode;
}) {
  useEscapeClose(true, onEscape ?? onClose);

  // `stationDisplaysCapPx` = the LOCAL sash clamp (`frame − leftCost − 720`) so dragging Displays resizes only Displays and the elastic…
  const { stationDisplaysCapPx, stationDisplaysCollapsed, stationContextSashArmed } =
    useSyncExternalStore(
      subscribeRightRailFrame,
      getRightRailFrame,
      getServerRightRailFrame,
    );
  const effectiveMaxWidthPx =
    maxWidthPx != null ? Math.min(maxWidthPx, stationDisplaysCapPx) : stationDisplaysCapPx;

  // Maximize is an in-flow sash widen to the local cap — never a cover overlay.
  // Transient: remount (close/reopen) restores the persisted preference width.
  const [maximized, setMaximized] = useState(false);
  const preMaxWidthRef = useRef<number | null>(null);

  // Operator PARK — drag the sash past its min collapses the whole column to a slim right-edge strip (mirror of the left context rail's…
  const [parked, setParked] = useState(false);
  const collapsed = parked || stationDisplaysCollapsed;
  /** The header `→|` PARKS (2026-08-19) — it does not unmount the column. */
  const park = useCallback(() => setParked(true), []);
  const restore = useCallback(() => {
    // Frame auto-park refuses restore while the pane still cannot seat the
    // column — that would paint Displays off-screen again.
    if (stationDisplaysCollapsed) return;
    setParked(false);
  }, [stationDisplaysCollapsed]);

  const { width, setWidth, edgeHandleProps, isDragging, overshootArmed } = useHorizontalEdgeResize({
    storageKey,
    defaultWidth: STATION_DISPLAYS_DEFAULT_WIDTH_PX,
    minWidth: STATION_DISPLAYS_MIN_WIDTH_PX,
    maxWidthPad: UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX,
    maxWidth: effectiveMaxWidthPx,
    enabled: !collapsed,
    edge: 'leading',
    label: resizeLabel,
    testId: resizeTestId,
    // Stage 3: dragging Displays past its cap (the context rail already at its
    // min) parks the context rail, so Displays keeps growing into the freed
    // space. Idempotent — a no-op once the rail is parked.
    onOvershootMax: collapsed ? undefined : requestStationCollapseContext,
    overshootBeyondPx: collapsed
      ? undefined
      : effectiveMaxWidthPx + EDGE_RESIZE_COLLAPSE_SLACK_PX,
    // Mirror the left rail: dragging the sash the OTHER way — past this column's
    // min — parks the whole column to a slim strip (release restores the
    // pre-drag width, so the strip floor never persists).
    onCollapseBeyondMin: collapsed ? undefined : () => setParked(true),
    collapseBelowPx: STATION_DISPLAYS_MIN_WIDTH_PX - EDGE_RESIZE_COLLAPSE_SLACK_PX,
  });

  // A live sash drag abandons the maximize latch — the operator owns the width.
  useEffect(() => {
    if (!isDragging || !maximized) return;
    setMaximized(false);
    preMaxWidthRef.current = null;
  }, [isDragging, maximized]);

  const toggleMaximize = useCallback(() => {
    if (maximized) {
      const restoreTo = preMaxWidthRef.current;
      preMaxWidthRef.current = null;
      setMaximized(false);
      if (restoreTo != null) setWidth(restoreTo);
      return;
    }
    preMaxWidthRef.current = width;
    setMaximized(true);
    setWidth(effectiveMaxWidthPx);
  }, [maximized, width, effectiveMaxWidthPx, setWidth]);

  const layoutWidth = Math.min(
    maximized ? effectiveMaxWidthPx : width,
    effectiveMaxWidthPx,
  );

  // Publish this column's live width + in-flow state so the frame store can reactively clamp the CONTEXT sash (`frame − displays − 720`) —…
  const publishedDesireRef = useRef(layoutWidth);
  publishedDesireRef.current = layoutWidth;
  useEffect(() => {
    if (collapsed) {
      setStationPushDemand({ active: false, desiredWidthPx: publishedDesireRef.current });
      return undefined;
    }
    setStationPushDemand({ active: true, desiredWidthPx: layoutWidth });
    return () => setStationPushDemand({ active: false, desiredWidthPx: publishedDesireRef.current });
  }, [collapsed, layoutWidth]);

  // Tell the frame store when THIS sash is being dragged — the one signal that opens the cascade's Stage 2 (Displays cap → ladder max; the…
  useEffect(() => {
    setStationDisplaysSashDragging(isDragging && !collapsed);
    return () => setStationDisplaysSashDragging(false);
  }, [isDragging, collapsed]);

  // Relay the Stage-3 arm to the far CONTEXT rail so it lights its own seam
  // warning (the rail lives in a different subtree). True only while the Displays
  // sash is leaning past its cap into the close slack, in flow.
  const displaysArmToClose = overshootArmed && !collapsed;
  useEffect(() => {
    setStationDisplaysSashArmed(displaysArmToClose);
    return () => setStationDisplaysSashArmed(false);
  }, [displaysArmToClose]);

  // Reverse Stage 3: a context-sash overshoot (the operator dragging the recents
  // rail so wide Displays is already at its min) closes THIS column — the far
  // rail on that gesture. Ref so the subscription never re-binds on prop churn.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(
    () =>
      subscribeStationFarRailRequest((req) => {
        if (req === 'close-displays') onCloseRef.current();
      }),
    [],
  );

  /** While PARKED, this column owns ⌘] — because nothing else does. */
  const parkedChordToggle = useCallback(() => {
    if (collapsed) restore();
  }, [collapsed, restore]);
  useStationDisplaysToggleHotkey(parkedChordToggle);

  // Pointer into Displays claims Right as keyboard owner (← → → history; focus face).
  const { isOwner: isRightOwner, claim: claimKeyboardRegion } = useKeyboardRegionOwner();
  const rightOwnsKeyboard = isRightOwner('right');
  const claimRight = useCallback(() => {
    claimKeyboardRegion('right');
  }, [claimKeyboardRegion]);
  useEffect(() => {
    // Opening the column seeds Right ownership (operator opened it to work here);
    // parking it hands ← → back to the Middle procedure until it is restored.
    claimKeyboardRegion(collapsed ? 'middle' : 'right');
    return () => {
      // Closing Displays returns horizontal keys to Middle.
      claimKeyboardRegion('middle');
    };
  }, [claimKeyboardRegion, collapsed]);

  // Parked (drag-past-min OR frame too narrow):
  if (collapsed) {
    const frameParked = stationDisplaysCollapsed;
    const showLabel = frameParked
      ? `Widen the window to show ${ariaLabel}`
      : `Show ${ariaLabel}`;
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={showLabel}
        aria-expanded={false}
        aria-disabled={frameParked || undefined}
        data-testid={testId}
        data-displays-parked=""
        data-displays-frame-parked={frameParked ? '' : undefined}
        {...(dataTool ? { 'data-tool': dataTool } : null)}
        onClick={restore}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            restore();
          }
        }}
        className={cn(
          STATION_DISPLAYS_STRIP_CLASS,
          'group cursor-pointer',
          frameParked && 'cursor-default',
        )}
        data-station-displays=""
      >
        {/* The Root Index as icons (2026-08-19). */}
        {frameParked ? (
          <div className="min-h-0 flex-1" aria-hidden />
        ) : (
          (parkedRail?.(restore) ?? <div className="min-h-0 flex-1" aria-hidden />)
        )}
      </div>
    );
  }

  return (
    <aside
      role="region"
      aria-label={ariaLabel}
      data-testid={testId}
      // While this column is open, the receiving table / record cursor behind it
      // stands down for ↑/↓ (see `isListKeyRegionOpen`) — this is what stops an
      // arrow press from stepping the map and popping a second sidebar.
      {...{ [LIST_KEY_REGION_OPEN_ATTR]: '' }}
      {...{ [KEYBOARD_REGION_ATTR]: 'right' }}
      {...(rightOwnsKeyboard ? { [KEYBOARD_REGION_ACTIVE_ATTR]: '' } : null)}
      {...(dataTool ? { 'data-tool': dataTool } : null)}
      onPointerDownCapture={claimRight}
      data-keyboard-region-focus={rightOwnsKeyboard ? 'true' : undefined}
      className={cn(
        'relative min-h-0 overflow-visible',
        'shrink-0 self-stretch',
        // Focus feedback — inset accent ring while Right owns keyboard (click / open).
        rightOwnsKeyboard && 'ring-1 ring-inset ring-accent-border',
      )}
      style={{
        width: layoutWidth,
        minWidth: STATION_DISPLAYS_MIN_WIDTH_PX,
      }}
    >
      <div
        className={cn(STATION_DISPLAYS_COLUMN_CLASS, 'relative h-full min-h-0')}
        data-station-displays=""
      >        {/* Drag ONLY — inset on this card's border-l seam (display hairline). */}
        <HorizontalEdgeResizeHandle
          edgeHandleProps={edgeHandleProps}
          isDragging={isDragging}
          edge="leading"
          placement="inset"
          elevatedHairline
          armed={stationContextSashArmed}
          tooltipLabel={resizeTooltip}
        />
        {/* ONE header band (2026-08-18): */}
        <div className={cn(STATION_DISPLAYS_PUSH_TOP_BAND, STATION_DISPLAYS_BAND_CLASS)}>
          {headerNav}
          {headerNav == null ? <div className="flex-1" /> : null}
          <div className={STATION_DISPLAYS_PUSH_TOP_CLUSTER}>
            {headerRightSlot}
            {headerActions}
            <HoverTooltip
              label={
                maximized
                  ? STATION_DISPLAYS_PUSH_COLLAPSE_LABEL
                  : STATION_DISPLAYS_PUSH_EXPAND_LABEL
              }
              asChild
            >
              <span className={STATION_DISPLAYS_PUSH_TOP_CELL}>
                <IconButton
                  size="sm"
                  tone="neutral"
                  ariaLabel={
                    maximized
                      ? STATION_DISPLAYS_PUSH_COLLAPSE_LABEL
                      : STATION_DISPLAYS_PUSH_EXPAND_LABEL
                  }
                  icon={
                    maximized ? (
                      <Minimize2 className="h-3.5 w-3.5" />
                    ) : (
                      <Maximize2 className="h-3.5 w-3.5" />
                    )
                  }
                  onClick={toggleMaximize}
                  className={STATION_DISPLAYS_HEADER_ACTION_FACE}
                  data-testid="unbox-push-fullscreen"
                />
              </span>
            </HoverTooltip>
            {/* Absolute far right, never collapses. */}
            <span className={STATION_DISPLAYS_PUSH_TOP_CELL}>
              <StationDisplaysEdgeToggle
                variant="column-close"
                onClick={park}
              />
            </span>
          </div>
        </div>
        {subHeader}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </aside>
  );
}
