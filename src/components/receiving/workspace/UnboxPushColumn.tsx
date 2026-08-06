'use client';

/**
 * Unbox right-edge **push** column — the shared shell for
 * {@link ReceivingDisplaysPushStack} (Ticket · Photos · Linkage · … — Ticket
 * presence-exclusive Claim vs Chat). LineEditPanel wires exclusion vs `detail:receiving` / AI
 * (see `unbox-right-edge.ts`).
 *
 * These are **not** `RightRailHost` occupants: receiving More details keeps the
 * float host (`detail:receiving`). This column reuses detail-stack SURFACE
 * tokens — flush in-flow ({@link DETAIL_STACK_PUSH_COLUMN_CLASS}); elevated
 * {@link DETAIL_STACK_ASIDE_SURFACE} only for the narrow-viewport overlay
 * exception.
 *
 * **Flush planes (ruled 2026-08-03):** wide push is a flush sibling of the
 * sunken center — no outer `my-2` / host `pr-2` islands. Narrow overlay may
 * float (true floater exception) with bookmark top inset.
 *
 * **The column owns its own visible dismiss** — see {@link UNBOX_PUSH_TOP_BAND}.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from '@/components/Icons';
import { STATION_IDENTITY_INSET_TOP } from '@/components/station/entity-context';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useEscapeClose, useHorizontalEdgeResize } from '@/design-system/hooks';
import { IconButton } from '@/design-system/primitives';
import {
  DETAIL_STACK_ASIDE_SURFACE,
  DETAIL_STACK_PUSH_COLUMN_CLASS,
  DETAIL_STACK_RESIZE,
} from '@/design-system/shells/detail-stack';
import { STATION_DISPLAYS_MIN_WIDTH_PX } from '@/components/station/workbench/workbench-layout';
import {
  getContextRailCostOpenPx,
  getRightRailFrame,
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
  subscribeStationCoupled,
} from '@/lib/right-rail/station-dual-rail';
import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';
import { UnboxDisplaysEdgeToggle } from './UnboxDisplaysEdgeToggle';

/**
 * Host trailing padding while a push column is mounted.
 *
 * Empty since flush planes (2026-08-03) — was `pr-2` island gutter. Kept as a
 * named export so LineEditPanel composes one host pad token (now a no-op).
 * Never `py-*`.
 */
export const TICKET_PUSH_HOST_PAD_CLASS = '';

/** Below this viewport width, the push column overlays instead of crushing Unbox. */
const NARROW_PUSH_MQ = '(max-width: 1023px)';

/**
 * The column's own header band — a REAL row, not an absolute float.
 *
 * It holds the visible dismiss at the column's **top-left**, fullscreen beside
 * it, and the carton cursor (`↑ ↓`) at the **top-right** when the host passes
 * {@link headerTrailing}. One row: `[→|] [fullscreen] ……… [↑ ↓]`.
 *
 * **Why the shell and not each occupant.** Ruled 2026-08-02: the `→|` in the
 * pane utility row closed the whole CARTON while its glyph, its corner and its
 * rail-gating all said "collapse this panel" — an operator reaching for it lost
 * their carton. Dismiss for the column belongs to the column, so it lives in the
 * shell that already owns `onClose`, the Escape close and the collapse chevron.
 *
 * **Why a visible button when the edge grip already collapses.** That chevron is
 * `opacity-0 group-hover:opacity-100` — it does not exist until the pointer is
 * already on the 8px sash. A non-modal push column has no scrim to click off, so
 * a dismiss the operator cannot see is a dismiss they do not have.
 *
 * **Why in flow.** An absolute button would land on three of the four occupants'
 * headers (`SupportTicketDetail`, `ReceivingClaimPanel`, the tool bodies all
 * start their chrome at y 0) — only Displays reserved a band, and it reserved it
 * for the cluster on the *other* side. A real row cannot overlap by construction.
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
const UNBOX_PUSH_TOP_BAND =
  'relative z-raised flex h-8 shrink-0 items-center gap-0.5 pl-2 pr-2';

/**
 * The band's dismiss names the REGION, not the occupant — "Hide right panel",
 * never "Hide displays" / "Hide ticket".
 *
 * This control belongs to the shell and closes whatever holds the edge, so its
 * copy has to be true for all four occupants at once. It is also what an
 * operator is actually thinking when they reach for it: *close this panel*.
 *
 * It is now the ONLY dismiss button on the column, which is why the per-occupant
 * `collapseLabel` prop is gone rather than kept for a second control. Exclusive
 * `layoutId` handoff with the pane open control: {@link UnboxDisplaysEdgeToggle}.
 */

/**
 * Fullscreen toggle — names the REGION, same rule as the edge-toggle close label
 * (`Hide right panel`). "Expand panel" / "Collapse panel", never "Expand
 * displays" — the control is mounted once in the shared shell and must read
 * true for all four occupants.
 */
const UNBOX_PUSH_EXPAND_LABEL = 'Expand panel';
const UNBOX_PUSH_COLLAPSE_LABEL = 'Collapse panel';

export function UnboxPushColumn({
  ariaLabel,
  testId,
  dataTool,
  storageKey,
  maxWidthPx,
  resizeLabel,
  resizeTestId,
  resizeTooltip,
  onClose,
  headerTrailing = null,
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
   * in-flow the column is `flex-1` and fills leftover beside the locked 720
   * middle (no painted width). Pass only when a demo / special surface needs
   * a tighter taste cap (overlay still honors it).
   */
  maxWidthPx?: number;
  resizeLabel: string;
  resizeTestId: string;
  resizeTooltip: string;
  onClose: () => void;
  /**
   * Top-right of the details panel header band — carton `↑ ↓` cursor when
   * Displays is open. Hosts compose {@link ScanStationCartonCursor}; omit when
   * the station has no carton pager.
   */
  headerTrailing?: ReactNode;
  children: ReactNode;
}) {
  useEscapeClose(true, onClose);

  // Frame `capPx` reserves the 720 middle lock; optional taste ceiling may
  // tighten further. In-flow FILLS leftover (`flex-1`) — no painted width.
  const { capPx } = useSyncExternalStore(
    subscribeRightRailFrame,
    getRightRailFrame,
    getServerRightRailFrame,
  );
  const effectiveMaxWidthPx =
    maxWidthPx != null ? Math.min(maxWidthPx, capPx) : capPx;

  const { width, setWidth, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey,
    defaultWidth: DETAIL_STACK_RESIZE.defaultWidthPx,
    minWidth: STATION_DISPLAYS_MIN_WIDTH_PX,
    maxWidthPad: UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX,
    maxWidth: effectiveMaxWidthPx,
    enabled: true,
    edge: 'leading',
    label: resizeLabel,
    testId: resizeTestId,
  });

  const layoutWidth = Math.min(width, effectiveMaxWidthPx);

  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(NARROW_PUSH_MQ);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Fullscreen is an operator TOGGLE, not a persisted width — it must not
  // write through `setWidth` (localStorage), or restoring from fullscreen
  // would leave the panel at whatever px the toggle happened to land on
  // instead of the operator's own resized width. It resets on remount
  // (closing and reopening the column), same as every other transient view
  // flag on this shell.
  const [expanded, setExpanded] = useState(false);

  // Fullscreen reuses the narrow-viewport OVERLAY mechanism rather than a
  // second one: a genuinely full-width push column would crush the center
  // floor (MIN_WORK_SURFACE_PX, `src/lib/right-rail/frame.ts`), which the
  // frame-budget law bans. An overlay does not reserve width — it floats
  // over the canvas, exactly like the narrow branch already does below
  // ~1024px — so "expand" and "narrow" collapse onto one `overlay` state.
  const overlay = narrow || expanded;

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
      {...(dataTool ? { 'data-tool': dataTool } : null)}
      className={cn(
        'relative min-h-0 overflow-visible',
        // Narrow overlay: float with identity top inset. Fullscreen expand:
        // edge-to-edge over the pane (square — no floating card radius).
        // In-flow: `flex-1` fills from the locked 720 middle to the pane's
        // right edge — no sticky painted width (that left a trailing gutter).
        overlay
          ? expanded
            ? 'absolute inset-0'
            : cn('absolute bottom-2 right-0 shrink-0', STATION_IDENTITY_INSET_TOP)
          : 'min-w-0 flex-1 self-stretch',
      )}
      style={{
        // Fullscreen fills its positioning context. Narrow overlay keeps a
        // resized px width. In-flow: no `width` — flex-1 claims leftover.
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
        <div className={UNBOX_PUSH_TOP_BAND}>
          {/* Exclusive host of the Displays edge toggle when the column is up —
              shared `layoutId` with the pane-open control. Never a second close
              on the carton pane. */}
          <UnboxDisplaysEdgeToggle variant="column-close" onClick={onClose} />
          <HoverTooltip
            label={expanded ? UNBOX_PUSH_COLLAPSE_LABEL : UNBOX_PUSH_EXPAND_LABEL}
            asChild
          >
            <IconButton
              size="sm"
              tone="neutral"
              ariaLabel={expanded ? UNBOX_PUSH_COLLAPSE_LABEL : UNBOX_PUSH_EXPAND_LABEL}
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
          {/* Carton ↑↓ — same row, top-right (SoT when Displays open). */}
          {headerTrailing != null ? (
            <div className="ml-auto flex shrink-0 items-center gap-0">{headerTrailing}</div>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </aside>
  );
}
