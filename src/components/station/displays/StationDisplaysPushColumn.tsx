'use client';

/**
 * Station Displays right-edge **push** column — shared shell for
 * {@link StationDisplaysPushStack} (Unbox golden · Arrival · Testing · Pack ·
 * Shipping · Review). Not a `RightRailHost` occupant.
 *
 * **In-flow when it fits** (ruled 2026-08-10): flush
 * {@link DETAIL_STACK_PUSH_COLUMN_CLASS} sibling that **encloses** the middle
 * (and its bottom dock) — never an overlay that covers them. When the frame
 * cannot seat Displays beside an open left rail, the frame store parks the
 * **left** rail first so Displays stays open. Displays itself auto-parks to the
 * slim strip only when even a parked left cannot seat
 * `{@link resolveStationDisplaysCollapse}` — so nothing paints off-screen.
 * Expand maximizes the sash to the local cap (still in flow).
 *
 * **Local splitter (Option A, 2026-08-10):** in-flow Displays is an
 * explicitly-sized `shrink-0` sibling of the elastic center. Its leading-edge
 * sash resizes ONLY Displays; the center absorbs the change and the left context
 * rail is untouched (VS Code / Figma splitter model). The sash clamps at
 * {@link RightRailFrameSnapshot.stationDisplaysCapPx} (`frame − leftCost − 720`)
 * so it stops at the center floor rather than crushing the middle or reaching
 * across to move the far rail — there is no inverse coupling. Because the center
 * eats all leftover, Displays always abuts the center with no gray band. Never
 * host `gap-*` / `justify-between` / gutter divs / `ml-auto` detach.
 *
 * **Dismiss + filter live in the footer** (left-rail twin) — hosts pass
 * {@link footer}. Top band keeps maximize + optional ring / carton cursor.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowLeftToLine, Maximize2, Minimize2 } from '@/components/Icons';
import {
  STATION_CHROME_ROW_FACE,
  STATION_CHROME_SEAM_HAIRLINE,
} from '@/components/station/entity-context';
import { STATION_COLUMN_FOOTER_BAND_FACE } from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
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
import { DETAIL_STACK_PUSH_COLUMN_CLASS } from '@/design-system/shells/detail-stack';
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
/**
 * Host trailing padding while a push column is mounted.
 *
 * Empty since flush planes (2026-08-03) — was `pr-2` island gutter. Kept as a
 * named export so LineEditPanel composes one host pad token (now a no-op).
 * Never `py-*`.
 */
/** Host trailing pad while a Displays push column is mounted (flush — no-op). */
export const STATION_DISPLAYS_HOST_PAD_CLASS = '';

/** Default open width preference for Unbox Displays / Ticket / Claim / tool. */
const STATION_DISPLAYS_DEFAULT_WIDTH_PX = 420;

/**
 * Top chrome band — widen/restore + optional progress ring / carton `↑↓`.
 *
 * **Height matches the station chrome seam** (`STATION_CHROME_ROW_FACE` /
 * `h-9`) so this band, the leaf `← →` header, and the Root Index eyebrow share
 * one row rhythm. Controls fill the band (`items-stretch` · `h-full`) — never
 * a centered island that leaves air above/below the glyph.
 *
 * Bottom rule = {@link STATION_CHROME_SEAM_HAIRLINE} (not `border-b` — that
 * double-paints against the leaf header's top hairline).
 */
const STATION_DISPLAYS_PUSH_TOP_BAND =
  `pointer-events-none relative z-header flex ${STATION_CHROME_ROW_FACE} items-stretch gap-0.5 pl-2 pr-2 ${STATION_CHROME_SEAM_HAIRLINE}`;

/** Hit cell for a top-band IconButton — stretch to the band, re-enable pointer. */
const STATION_DISPLAYS_PUSH_TOP_CELL =
  'pointer-events-auto flex h-full shrink-0 items-stretch';

const STATION_DISPLAYS_PUSH_EXPAND_LABEL = 'Widen panel';
const STATION_DISPLAYS_PUSH_COLLAPSE_LABEL = 'Restore panel width';

/**
 * `relative z-header` keeps maximize / trailing cursor above the inset
 * resize sash's elevated hairline paint. Children re-enable pointer events
 * (`pointer-events-auto` on the cell) so the band itself stays pass-through
 * for the sash hit area under empty chrome.
 *
 * The 8px is the control's optical inset, not a taste nudge, and `pl-2` keeps it
 * clear of the leading hairline.
 */
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
  headerTrailing,
  headerRightSlot,
  actionFloor,
  footer,
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
   * Top-right of the details panel header band — carton `↑ ↓` cursor when
   * Displays is open. Hosts compose {@link ScanStationCartonCursor}; omit when
   * the station has no carton pager.
   */
  headerTrailing?: ReactNode;
  /**
   * Trailing peer before carton cursor — Unbox: procedure progress ring
   * (was Displays icon-plate `rightSlot`).
   */
  headerRightSlot?: ReactNode;
  /**
   * Carton Macro floor — seated **above** the close chrome {@link footer}
   * (`→|` / Filter hairline). Unbox golden: {@link StationDisplaysActionFloor}
   * at dock Band 1 `h-11`. Never desk `InspectorActionFloor`.
   */
  actionFloor?: ReactNode;
  /**
   * Absolute-bottom close chrome — Root Index filter + `→|` · leaf dismiss ·
   * leaf `/` commands. Always below {@link actionFloor} when both are set.
   */
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEscapeClose(true, onEscape ?? onClose);

  // `stationDisplaysCapPx` = the LOCAL sash clamp (`frame − leftCost − 720`) so
  // dragging Displays resizes only Displays and the elastic center absorbs it;
  // the far left rail is untouched (no coupling). `stationDisplaysCollapsed` =
  // frame budget cannot seat Displays' min — auto-park to the slim strip
  // (never overlay, never off-screen overflow).
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

  // Operator PARK — drag the sash past its min collapses the whole column to a
  // slim right-edge strip (mirror of the left context rail's drag-past-min
  // park). Transient by design: it survives leaf changes WITHIN an open session
  // (so the cockpit's auto-follow respects the park), and resets when the
  // display is closed and reopened (the column unmounts), so opening a display
  // fresh always shows it. Click the strip to restore the column at its width
  // — unless the frame is still too narrow (`stationDisplaysCollapsed`).
  const [parked, setParked] = useState(false);
  const collapsed = parked || stationDisplaysCollapsed;
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

  // Publish this column's live width + in-flow state so the frame store can
  // reactively clamp the CONTEXT sash (`frame − displays − 720`) — the symmetric
  // local clamp, not coupling. Parked / frame-collapsed release push demand so
  // the center reclaims width — never overlay.
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

  // Tell the frame store when THIS sash is being dragged — the one signal that
  // opens the cascade's Stage 2 (Displays cap → ladder max; the left rail's cap
  // goes tight and its own resize-clamp yields it). Idle → the left rail is the
  // default authority, so opening Displays or narrowing the viewport yields
  // Displays width into leftover, never the operator's rail.
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

  // Parked (drag-past-min OR frame too narrow): a slim right-edge strip in place
  // of the column — whole-strip click / Enter / Space restores it when the frame
  // can seat it again (mirror of the left rail's parked strip). The column body
  // unmounts; local leaf selection keeps the leaf, so it comes back at its width on restore.
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
          'group relative flex h-full w-8 shrink-0 cursor-pointer flex-col items-center self-stretch',
          'border-l border-border-soft bg-surface-card hover:bg-surface-sunken',
          frameParked && 'cursor-default',
        )}
      >
        {/* Empty mid — the whole strip is clickable when restore is allowed. */}
        <div className="min-h-0 flex-1" aria-hidden />
        {/* Restore control in the BOTTOM footer band — same seat as the `→|`
            close / `←|` open toggle (Displays dismiss chrome lives at the
            bottom), and a mirror of the left rail's parked-strip expand. */}
        <div className={cn(STATION_COLUMN_FOOTER_BAND_FACE, 'justify-center')}>
          <HoverTooltip label={showLabel} asChild focusable={false}>
            <IconButton
              size="sm"
              tone="neutral"
              ariaLabel={showLabel}
              disabled={frameParked}
              icon={<ArrowLeftToLine className="h-3.5 w-3.5" />}
              onClick={(e) => {
                e.stopPropagation();
                restore();
              }}
              className="h-full rounded-none"
              data-testid="unbox-displays-parked-expand"
            />
          </HoverTooltip>
        </div>
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
      <div className={cn(DETAIL_STACK_PUSH_COLUMN_CLASS, 'relative h-full min-h-0')}>
        {/* Drag ONLY — inset on this card's border-l seam (display hairline).
            `elevatedHairline` paints the rule ABOVE the leaf ← → header band
            (`z-header`, opaque) so the seam reads continuously over the Back
            chevron; the hit stays below the chrome so the chevron keeps its
            clicks. The flash marks the pane about to DISAPPEAR, not the sash
            under the cursor — so Displays lights only when the CONTEXT sash is
            one shove from closing THIS column, never while its own sash parks
            the context rail (that flash belongs to the context rail). */}
        <HorizontalEdgeResizeHandle
          edgeHandleProps={edgeHandleProps}
          isDragging={isDragging}
          edge="leading"
          placement="inset"
          elevatedHairline
          armed={stationContextSashArmed}
          tooltipLabel={resizeTooltip}
        />
        <div className={STATION_DISPLAYS_PUSH_TOP_BAND}>
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
                className="h-full w-full rounded-none"
                data-testid="unbox-push-fullscreen"
              />
            </span>
          </HoverTooltip>
          {/* Progress ring (optional) + carton ↑↓ — top-right when Displays open. */}
          {headerRightSlot != null || headerTrailing != null ? (
            <div className="pointer-events-auto ml-auto flex h-full shrink-0 items-stretch gap-0.5">
              {headerRightSlot}
              {headerTrailing}
            </div>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        {actionFloor}
        {footer}
      </div>
    </aside>
  );
}
