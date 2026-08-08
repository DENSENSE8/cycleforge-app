'use client';

/**
 * Station Displays right-edge **push** column — shared shell for
 * {@link StationDisplaysPushStack} (Unbox golden · Arrival · Testing · Pack ·
 * Shipping · Review). Not a `RightRailHost` occupant.
 *
 * This column reuses detail-stack SURFACE tokens — flush in-flow
 * ({@link DETAIL_STACK_PUSH_COLUMN_CLASS}); elevated
 * {@link DETAIL_STACK_ASIDE_SURFACE} only for the narrow-viewport overlay
 * exception.
 *
 * **Flex-Grow Sandwich invader (station):** in-flow Displays is `flex-1` so it
 * **always fills leftover** beside the locked 720 middle (flush hairline — no
 * emergent gray band). Resize desire from {@link useHorizontalEdgeResize}
 * still drives dual-rail inverse trade with the context rail
 * (`left + 720 + displays = frame`); the sash never invents a host gutter.
 * Never host `gap-*` / `justify-between` / gutter divs / `ml-auto` detach.
 *
 * **Flush planes (ruled 2026-08-03):** wide push is a flush sibling of the
 * sunken center — no outer `my-2` / host `pr-2` islands. Narrow overlay may
 * float (true floater exception) with bookmark top inset.
 *
 * **Dismiss + filter live in the footer** (left-rail twin) — hosts pass
 * {@link footer}. Top band keeps fullscreen + optional ring / carton cursor.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from '@/components/Icons';
import { STATION_IDENTITY_INSET_TOP } from '@/components/station/entity-context';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useEscapeClose, useHorizontalEdgeResize } from '@/design-system/hooks';
import { LIST_KEY_REGION_OPEN_ATTR } from '@/lib/keyboard/list-key-scope';
import { IconButton } from '@/design-system/primitives';
import {
  DETAIL_STACK_ASIDE_SURFACE,
  DETAIL_STACK_PUSH_COLUMN_CLASS,
} from '@/design-system/shells/detail-stack';
import { STATION_DISPLAYS_MIN_WIDTH_PX } from '@/components/station/workbench/workbench-layout';
import {
  getContextRailCostOpenPx,
  getRightRailFrame,
  getRightRailFrameWidthPx,
  getServerRightRailFrame,
  setStationPushDemand,
  subscribeRightRailFrame,
  UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX,
} from '@/lib/right-rail/frame';
import {
  applyStationDisplaysDelta,
  getServerStationCoupled,
  getStationCoupled,
  isStationDualRailCouplingActive,
  registerStationDisplaysStorageKey,
  stationLadderMaxDisplaysPx,
  subscribeStationCoupled,
} from '@/lib/right-rail/station-dual-rail';
import { zIndex } from '@/design-system/tokens/z-index';
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

/**
 * Default dual-rail / overlay desire when `storageKey` has no persisted width.
 * In-flow visual fill is `flex-1` (always expanded); this value seeds resize
 * coupling and narrow/fullscreen overlay painted width.
 */
const STATION_DISPLAYS_FILL_DEFAULT_WIDTH_PX = 10_000;

/**
 * The column's own header band — a REAL row, not an absolute float.
 *
 * One row: `[fullscreen] ……… [ring?] [↑ ↓]`. Column dismiss (`→|`) seats in the
 * **footer** with the filter search (left-rail twin) — see {@link footer}.
 *
 * **Height is derived, not picked.** Carton cursor on this band uses `xs`
 * IconButtons. Flush push has no `my-2`, so `h-8` (32px) with controls
 * pinned to the band's TOP clears identity chrome optically. When Displays
 * is closed the cursor lives on {@link ScanStationUtilityRail} instead.
 *
 * **The band aligns to the CONTENT gutter, and it aligns OPTICALLY** — `pl-2`,
 * not the `px-4` every other row in the column carries. Ruled 2026-08-02 after
 * the third report that the `→|` "is still not on the left column", against an
 * E2E that measured it as aligned and passed.
 *
 * Both halves of that contradiction were real. The band used to put its BOX on
 * the `px-4` content edge, which is correct arithmetic and the wrong reference:
 * an `sm` (28px) control around a 14px glyph insets its box by 7px, and a lucide
 * glyph draws ~2px inside its own viewBox, so the mark an operator sees landed
 * **~9px right of the gutter its box was sitting on**. Everything the occupant
 * puts under it — a heading, an avatar, a card border — is ink AT the gutter,
 * because for text and borders box IS ink.
 *
 * Measured @1440 on a 420px column (gutter = 1px surface border + `px-4` = 17):
 *
 * | | box | glyph ink |
 * |---|---|---|
 * | `→|`, `px-4` (before) | 16 | **25.0** |
 * | Claim's "FILE A CLAIM" heading | 17 | **17.0** |
 * | Displays' card border | 17 | **17.0** |
 * | `→|`, `pl-2` (after) | 8 | **~16.8** |
 *
 * **Why this only ever looked right on Displays.** Displays is the one occupant
 * whose first row is also a glyph plate (`ICON_CELL_*` — SpaceX `h-10`), so it
 * was indented by the same ~8px and the two agreed with each other while both
 * missed the card border below them. Displays is also the only occupant that
 * was ever measured, so the band shipped tuned to the single surface where the
 * defect cancels. On Claim / the tool bodies the `→|` sat a visible 8px right of
 * the first line of text; on Ticket, whose header is `px-2.5` around an avatar,
 * further still.
 *
 * The 8px is the control's optical inset, not a taste nudge, and `pl-2` keeps it
 * density-aware (`spacing.mjs` → `calc(rem × var(--cf-density))`) so it tracks
 * the box it is correcting for. The button's box now overhangs the gutter — that
 * is the point: a hit box may bleed, a mark may not.
 *
 * `sm` and not `xs` is still a two-axis decision: a 24px box parks its centre at
 * y 12 against the ring's y 14.
 *
 * The Displays topic plate cancels host `px-4` with `-mx-4` (edge-to-edge
 * Cybertruck plate + trailing ⋮). Nested verb strips sit `gap-0` flush under it.
 * The E2E pins that dismiss + plate stay column-aligned.
 */
/** `relative z-raised` keeps `→|` above the inset resize sash (same token).
 *  One horizontal row: `[→|] [fullscreen] ……… [↑ ↓]` — `items-center`, never a
 *  stacked trailing cluster. */
const STATION_DISPLAYS_PUSH_TOP_BAND =
  'relative z-raised flex h-8 shrink-0 items-center gap-0.5 border-b border-border-hairline pl-2 pr-2';

/**
 * Fullscreen toggle — names the REGION. "Expand panel" / "Collapse panel",
 * never "Expand displays" — the control is mounted once in the shared shell.
 */
const STATION_DISPLAYS_PUSH_EXPAND_LABEL = 'Expand panel';
const STATION_DISPLAYS_PUSH_COLLAPSE_LABEL = 'Collapse panel';

export function StationDisplaysPushColumn({
  ariaLabel,
  testId,
  dataTool,
  storageKey,
  maxWidthPx,
  resizeLabel,
  resizeTestId,
  resizeTooltip,
  onClose,
  onEscape,
  headerTrailing = null,
  headerRightSlot = null,
  footer = null,
  children,
}: {
  ariaLabel: string;
  testId: string;
  /** Optional `data-tool` discriminator (tool push). */
  dataTool?: string;
  /** Per-surface width preference key. */
  storageKey: string;
  /**
   * Optional absolute ceiling for this surface. Omit for station Displays —
   * in-flow is `flex-1` (always fills leftover beside the locked 720 middle).
   * Pass only when a demo / special surface needs a tighter taste cap
   * (overlay still honors it).
   */
  maxWidthPx?: number;
  resizeLabel: string;
  resizeTestId: string;
  resizeTooltip: string;
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
   * Bottom band — filter search + `→|` Hide right panel (left-rail twin).
   * Hosts compose {@link TechRailSearchBar} + Displays edge close toggle.
   */
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEscapeClose(true, onEscape ?? onClose);

  // Frame `capPx` = leftover beside the 720 middle lock; `stationDisplaysCollapsed`
  // = has the frame yielded Displays to an overlay (Fiori/M3 collapse). In-flow
  // is flex-1 (always fills leftover); resize desire feeds dual-rail coupling.
  const { capPx, stationDisplaysCollapsed } = useSyncExternalStore(
    subscribeRightRailFrame,
    getRightRailFrame,
    getServerRightRailFrame,
  );
  // While coupling with the context rail, the sash may grow Displays across the
  // FULL yield range — the coupling shrinks the rail toward its 300 hardMin, so
  // the ceiling is `frame − 720 − 300` (the ladder max), NOT `capPx` (which
  // reserves the rail's *current* open cost, ~60px tighter). Feeding the tight
  // cap is what forced the coupling to clamp the sash back every frame — the old
  // edge jitter. Off a coupling, `capPx` (parked strip / no rail) is correct.
  const resolvedMaxWidthPx = isStationDualRailCouplingActive()
    ? stationLadderMaxDisplaysPx(getRightRailFrameWidthPx())
    : capPx;
  const effectiveMaxWidthPx =
    maxWidthPx != null ? Math.min(maxWidthPx, resolvedMaxWidthPx) : resolvedMaxWidthPx;

  const { width, setWidth, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey,
    defaultWidth: STATION_DISPLAYS_FILL_DEFAULT_WIDTH_PX,
    minWidth: STATION_DISPLAYS_MIN_WIDTH_PX,
    maxWidthPad: UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX,
    maxWidth: effectiveMaxWidthPx,
    enabled: true,
    edge: 'leading',
    label: resizeLabel,
    testId: resizeTestId,
  });

  const layoutWidth = Math.min(width, effectiveMaxWidthPx);

  // Fullscreen is an operator TOGGLE, not a persisted width — it must not
  // write through `setWidth` (localStorage), or restoring from fullscreen
  // would leave the panel at whatever px the toggle happened to land on
  // instead of the operator's own resized width. It resets on remount
  // (closing and reopening the column), same as every other transient view
  // flag on this shell.
  const [expanded, setExpanded] = useState(false);

  // Overlay = float over the work canvas instead of pushing an in-flow column.
  // Two triggers, ONE mechanism:
  //  - `stationDisplaysCollapsed` — the frame budget yielded Displays first
  //    (Fiori / M3 collapse). It floats rather than crushing the 720 middle or
  //    clipping past the pane edge. This is the frame-derived, spine-aware,
  //    hysteresis-latched replacement for the old fixed 1024px viewport MQ (a
  //    viewport MQ ignored the spine and the context rail, so the crush zone
  //    between ~1024 and 1300 clipped in-flow instead of collapsing cleanly).
  //  - `expanded` — the operator's fullscreen toggle. A genuinely full-width
  //    push column would crush the center floor (the frame-budget law bans it),
  //    so fullscreen reuses the overlay mechanism.
  const overlay = expanded || stationDisplaysCollapsed;

  // Per-surface key so a context-rail sash can persist the inverse Displays width.
  useEffect(() => registerStationDisplaysStorageKey(storageKey), [storageKey]);

  // Wide in-flow push publishes frame demand so the shared width budget (right
  // resize cap beside an open context rail) knows this column is pushing.
  // Narrow / fullscreen overlay does not push — clear demand so the frame does
  // not still count a floating column. Separate channel from RightRailHost —
  // assistant push:false must not clear it.
  // Publish live width while dragging so dual-rail coupling (and cap math that
  // follows left) see the sash; freeze only the cleanup snapshot.
  const publishedDesireRef = useRef(layoutWidth);
  publishedDesireRef.current = layoutWidth;
  useEffect(() => {
    if (overlay) {
      setStationPushDemand({ active: false, desiredWidthPx: publishedDesireRef.current });
      return undefined;
    }
    setStationPushDemand({ active: true, desiredWidthPx: layoutWidth });
    return () => setStationPushDemand({ active: false, desiredWidthPx: publishedDesireRef.current });
  }, [overlay, layoutWidth]);

  // Inverse-couple: Displays sash → shrink/grow context rail by the same Δ.
  const dragWidthRef = useRef(layoutWidth);
  useEffect(() => {
    if (!isDragging || overlay) {
      dragWidthRef.current = layoutWidth;
      return;
    }
    const delta = layoutWidth - dragWidthRef.current;
    dragWidthRef.current = layoutWidth;
    if (delta === 0 || !isStationDualRailCouplingActive()) return;
    const next = applyStationDisplaysDelta(delta, {
      leftPx: getContextRailCostOpenPx(),
      displaysPx: layoutWidth - delta,
    });
    // Peer clamp may pull Displays back — honor the resolved pair.
    if (next && next.displaysPx !== layoutWidth) {
      setWidth(next.displaysPx);
      dragWidthRef.current = next.displaysPx;
    }
  }, [layoutWidth, isDragging, overlay, setWidth]);

  // Peer context-rail sash wrote Displays — sync sticky width (not while we drag).
  const coupled = useSyncExternalStore(
    subscribeStationCoupled,
    getStationCoupled,
    getServerStationCoupled,
  );
  useEffect(() => {
    if (!coupled || coupled.source !== 'context' || isDragging || overlay) return;
    if (coupled.displaysPx === layoutWidth) return;
    setWidth(coupled.displaysPx);
  }, [coupled, isDragging, overlay, layoutWidth, setWidth]);

  return (
    <aside
      role="region"
      aria-label={ariaLabel}
      data-testid={testId}
      // While this column is open, the receiving table / record cursor behind it
      // stands down for ↑/↓ (see `isListKeyRegionOpen`) — this is what stops an
      // arrow press from stepping the map and popping a second sidebar.
      {...{ [LIST_KEY_REGION_OPEN_ATTR]: '' }}
      {...(dataTool ? { 'data-tool': dataTool } : null)}
      className={cn(
        'relative min-h-0 overflow-visible',
        // Narrow overlay: float with identity top inset. Fullscreen expand:
        // edge-to-edge over the pane (square — no floating card radius).
        // In-flow: flex-1 always fills leftover beside the locked 720 middle
        // (no ml-auto detach band).
        overlay
          ? expanded
            ? 'absolute inset-0'
            : cn('absolute bottom-2 right-0 shrink-0', STATION_IDENTITY_INSET_TOP)
          : 'min-w-0 flex-1 self-stretch',
      )}
      style={{
        // Fullscreen fills its positioning context. Narrow overlay keeps a
        // resized px width. In-flow: no painted width — flex-1 claims leftover.
        width: overlay ? (expanded ? '100%' : layoutWidth) : undefined,
        minWidth: overlay || expanded ? undefined : STATION_DISPLAYS_MIN_WIDTH_PX,
        ...(overlay ? { zIndex: zIndex.panel } : null),
      }}
    >
      {/* Flush in-flow surface; elevated aside for narrow overlay. Fullscreen
          expands the same aside but square + no float shadow (edge-to-edge). */}
      <div
        className={cn(
          overlay ? DETAIL_STACK_ASIDE_SURFACE : DETAIL_STACK_PUSH_COLUMN_CLASS,
          expanded && 'rounded-none shadow-none',
          'relative h-full min-h-0',
        )}
      >
        {/* Drag ONLY — inset on this card's border-l seam (display hairline). */}
        <HorizontalEdgeResizeHandle
          edgeHandleProps={edgeHandleProps}
          isDragging={isDragging}
          edge="leading"
          placement="inset"
          tooltipLabel={resizeTooltip}
        />
        <div className={STATION_DISPLAYS_PUSH_TOP_BAND}>
          <HoverTooltip
            label={
              expanded
                ? STATION_DISPLAYS_PUSH_COLLAPSE_LABEL
                : STATION_DISPLAYS_PUSH_EXPAND_LABEL
            }
            asChild
          >
            <IconButton
              size="sm"
              tone="neutral"
              ariaLabel={
                expanded
                  ? STATION_DISPLAYS_PUSH_COLLAPSE_LABEL
                  : STATION_DISPLAYS_PUSH_EXPAND_LABEL
              }
              icon={
                expanded ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )
              }
              onClick={() => setExpanded((prev) => !prev)}
              className="rounded-none"
              data-testid="unbox-push-fullscreen"
            />
          </HoverTooltip>
          {/* Progress ring (optional) + carton ↑↓ — top-right when Displays open. */}
          {headerRightSlot != null || headerTrailing != null ? (
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              {headerRightSlot}
              {headerTrailing}
            </div>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        {footer}
      </div>
    </aside>
  );
}
