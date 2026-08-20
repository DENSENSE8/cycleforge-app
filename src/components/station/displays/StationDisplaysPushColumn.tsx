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
 * **Filter is row 2** (`subHeader`, index only). There is **no bottom band** —
 * the column ends at its body. **Top band keeps maximize + optional ring + the carton Macro
 * verbs** ({@link headerActions}, `⋯` last). The carton `↑↓` cursor no longer
 * mounts here (2026-08-18) — the corner is the utility cluster's.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from '@/components/Icons';
import {
  STATION_CHROME_ROW_FACE,
  STATION_CHROME_SEAM_HAIRLINE,
} from '@/components/station/entity-context';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { StationDisplaysEdgeToggle } from './StationDisplaysEdgeToggle';
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
  `pointer-events-none relative z-header flex ${STATION_CHROME_ROW_FACE} items-stretch gap-0.5 pr-2 ${STATION_CHROME_SEAM_HAIRLINE}`;

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
 * The band has NO leading pad (2026-08-19): the leaf Back chevron takes the
 * column's own left corner. The trailing `pr-2` is the window controls' optical
 * inset.
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
  /**
   * Carton Macro verbs — top-right of the band, `⋯` last
   * ({@link StationDisplaysHeaderActions}). Moved here from the retired bottom
   * `actionFloor` rung (2026-08-18): a control that acts on the open carton
   * belongs in the corner the operator already looks at for chrome, not at the
   * far end of a scrolling column. Never desk `InspectorActionFloor`.
   */
  headerActions?: ReactNode;
  /**
   * Row 2 — a full-width band directly under the header, above the body.
   *
   * **This is where `Filter displays…` lives (ruled 2026-08-19).** It used to
   * sit in the bottom footer as the left context rail's twin; that pairing
   * stopped holding the moment `→|` left the footer for the header band, since
   * what made the two rails read alike was the filter sharing a band with the
   * dismiss control. A find field that filters the list *below* it now sits
   * above that list — the same order the Unbox workbench sheet already uses
   * (Band 1 chrome → Band 3 find → rows), so one muscle memory covers both.
   *
   * Index-only by contract: a leaf must never inherit list-filter chrome that
   * does not refine the leaf.
   */
  subHeader?: ReactNode;
  /**
   * PARKED-strip content, given the restore callback so a cell can open the
   * column ON the display it names. Rendered instead of the old empty mid +
   * foot button: 32px of chrome that says what is behind it beats 32px that
   * says nothing and repeats the click the whole strip already accepts.
   */
  parkedRail?: (open: () => void) => ReactNode;
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
  /**
   * The header `→|` PARKS (2026-08-19) — it does not unmount the column.
   *
   * It used to call the host's `onClose`, which took the column off screen
   * entirely, so the parked icon strip was only reachable by dragging the sash
   * past its min — a gesture most operators never find. Parking on the control
   * they already use is what makes the strip the normal closed state.
   *
   * Full close still exists and is Esc's job (`onEscape` → leaf → index →
   * `onClose`). Two controls, two meanings: `→|` gets the column out of the
   * way and leaves the index one click away; Esc puts it away.
   */
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

  /**
   * While PARKED, this column owns ⌘] — because nothing else does.
   *
   * The chord's normal owner is whichever `StationDisplaysEdgeToggle` is
   * mounted (`←|` pane-open when the column is absent, `→|` column-close when
   * it is open). A parked column mounts neither: the host still believes
   * Displays is open, so the pane's `←|` is gone, and the parked strip paints
   * no band. Without this the chord would be dead in exactly the state the
   * operator most needs it.
   *
   * The callback no-ops while open, so the band's toggle stays the single
   * ACTING owner and the two are never both live.
   */
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
        {/* The Root Index as icons (2026-08-19). The strip used to be an empty
            mid plus a restore button at its foot; both are gone. The foot
            button spent a permanent cell on the one action the WHOLE strip
            already performs, and the empty mid told the operator nothing about
            what was parked behind it. Now the strip shows the displays and a
            cell opens the one it names — the click an operator was going to
            make anyway, minus the intermediate open.

            Whole-strip click still restores (role=button above); the rail stops
            propagation so a cell never fires both. */}
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
        {/* ONE header band (2026-08-18):
              [ < > ] Displays ………… [ ring ][ verbs ⋮ ][ ⤢ ][ →| ]
            Left answers "where am I", right answers "what can I do to this".
            Fullscreen and close are the two WINDOW controls, so they close the
            row and never collapse — the item verbs to their left are what a
            narrower column would fold into `⋮`. */}
        <div className={STATION_DISPLAYS_PUSH_TOP_BAND}>
          {headerNav}
          {headerNav == null ? <div className="flex-1" /> : null}
          <div className="pointer-events-auto flex h-full shrink-0 items-stretch gap-0.5">
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
                  className="h-full w-full rounded-none"
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
