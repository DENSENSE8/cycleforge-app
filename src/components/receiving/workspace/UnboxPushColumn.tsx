'use client';

/**
 * Unbox right-edge **push** column — the shared shell for every station-scoped
 * secondary surface that squeezes the Unbox workbench in-flow.
 *
 * Consumers: {@link ReceivingDisplaysPushStack} (the section displays),
 * {@link ReceivingTicketStack}, {@link ReceivingClaimStack},
 * {@link ReceivingToolPushStack}. All four are mutually exclusive — LineEditPanel
 * wires the exclusion (see `unbox-right-edge.ts`).
 *
 * These are **not** `RightRailHost` occupants: receiving More details keeps the
 * float host (`detail:receiving`), and the store stays single-slot. This column
 * reuses detail-stack SURFACE tokens — flush in-flow
 * ({@link DETAIL_STACK_PUSH_COLUMN_CLASS}); elevated
 * {@link DETAIL_STACK_ASIDE_SURFACE} only for the narrow-viewport overlay
 * exception.
 *
 * WHY A SHELL: the aside + leading resize grip + narrow-viewport overlay +
 * Escape close was copy-pasted three times before the displays column landed.
 * A fourth copy is the page-local fork `pattern-evolution.md` bans, so the
 * geometry lives here once and each surface supplies only its own knobs.
 *
 * **Flush planes (ruled 2026-08-03):** wide push is a flush sibling of the
 * sunken center — no outer `my-2` / host `pr-2` islands. Narrow overlay may
 * float (true floater exception) with bookmark top inset.
 *
 * **The column owns its own visible dismiss** — see {@link UNBOX_PUSH_TOP_BAND}.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRightToLine, Maximize2, Minimize2 } from '@/components/Icons';
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
import {
  setStationPushDemand,
  UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX,
} from '@/lib/right-rail/frame';
import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';

/** Below this viewport width, the push column overlays instead of crushing Unbox. */
const NARROW_PUSH_MQ = '(max-width: 1023px)';

/**
 * The column's own header band — a REAL row, not an absolute float.
 *
 * It holds the visible dismiss at the column's **top-left**, and it reserves the
 * band the pane-anchored carton cursor (`↑ ↓`) floats over on the right. One
 * row, read left to right: `[→|] ……… [↑ ↓]` (progress ring is under the dock).
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
 * **Height is derived, not picked.** The pane-anchored carton cursor uses
 * {@link STATION_IDENTITY_INSET_TOP} (`top-0`) on the pane host (`xs`
 * IconButtons). Flush push has no `my-2`, so `h-8` (32px) with the button
 * pinned to the band's TOP still clears the cursor optically.
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
 * whose first row is *also* a glyph in a box (`ICON_CELL_COMPACT_CLASS` — 26px
 * around 14px), so it was indented by the same ~8px and the two agreed with each
 * other while both missed the card border below them. Displays is also the only
 * occupant that was ever measured, so the band shipped tuned to the single
 * surface where the defect cancels. On Claim / the tool bodies the `→|` sat a
 * visible 8px right of the first line of text; on Ticket, whose header is
 * `px-2.5` around an avatar, further still.
 *
 * The 8px is the control's optical inset, not a taste nudge, and `pl-2` keeps it
 * density-aware (`spacing.mjs` → `calc(rem × var(--cf-density))`) so it tracks
 * the box it is correcting for. The button's box now overhangs the gutter — that
 * is the point: a hit box may bleed, a mark may not.
 *
 * `sm` and not `xs` is still a two-axis decision: a 24px box parks its centre at
 * y 12 against the ring's y 14.
 *
 * `-ml-px` survives and its job is unchanged — it reconciles the shell's 28px
 * control with the occupant strip's 26px cell (`ICON_CELL_COMPACT_CLASS`, a 6px
 * inset), which `IconButton` has no size to express. Both now resolve onto the
 * gutter within a pixel; the Displays strip pays the same 8px on its own row
 * (`DISPLAYS_STRIP_HEADER_CLASS`). The E2E pins that they stay together.
 */
const UNBOX_PUSH_TOP_BAND = 'flex h-8 shrink-0 items-start gap-0.5 pl-2 pr-4';

/**
 * The band's dismiss names the REGION, not the occupant — "Hide right panel",
 * never "Hide displays" / "Hide ticket".
 *
 * This control belongs to the shell and closes whatever holds the edge, so its
 * copy has to be true for all four occupants at once. It is also what an
 * operator is actually thinking when they reach for it: *close this panel*.
 *
 * It is now the ONLY dismiss button on the column, which is why the per-occupant
 * `collapseLabel` prop is gone rather than kept for a second control.
 */
const UNBOX_PUSH_CLOSE_LABEL = 'Hide right panel';

/**
 * Fullscreen toggle — names the REGION, same rule as {@link UNBOX_PUSH_CLOSE_LABEL}.
 * "Expand panel" / "Collapse panel", never "Expand displays" — the control is
 * mounted once in the shared shell and must read true for all four occupants.
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
  children,
}: {
  ariaLabel: string;
  testId: string;
  /** Optional `data-tool` discriminator (tool push). */
  dataTool?: string;
  /** Per-surface width preference key. */
  storageKey: string;
  /** Absolute ceiling for this surface's column. Viewport pad still wins. */
  maxWidthPx: number;
  resizeLabel: string;
  resizeTestId: string;
  resizeTooltip: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscapeClose(true, onClose);

  const { width, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey,
    defaultWidth: DETAIL_STACK_RESIZE.defaultWidthPx,
    minWidth: DETAIL_STACK_RESIZE.minWidthPx,
    maxWidthPad: UNBOX_STATION_PUSH_MAX_WIDTH_PAD_PX,
    maxWidth: maxWidthPx,
    enabled: true,
    edge: 'leading',
    label: resizeLabel,
    testId: resizeTestId,
  });

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

  // Wide in-flow push publishes frame demand so ContextPanelLayout can park the
  // context rail at 1440 (MIN_WORK_SURFACE floor). Narrow overlay does not push.
  // Fullscreen is an overlay too, so it must clear the same demand — otherwise
  // the context rail would stay parked (or the frame budget would still count
  // this column as pushing) while it is actually floating over the canvas.
  // Separate channel from RightRailHost — assistant push:false must not clear it.
  useEffect(() => {
    if (overlay) {
      setStationPushDemand({ active: false, desiredWidthPx: width });
      return undefined;
    }
    setStationPushDemand({ active: true, desiredWidthPx: width });
    return () => setStationPushDemand({ active: false, desiredWidthPx: width });
  }, [overlay, width]);

  return (
    <aside
      role="region"
      aria-label={ariaLabel}
      data-testid={testId}
      {...(dataTool ? { 'data-tool': dataTool } : null)}
      className={cn(
        'relative min-h-0 shrink-0 overflow-visible',
        // Narrow overlay: float with identity top inset. Fullscreen expand:
        // edge-to-edge over the pane (square — no floating card radius).
        // Otherwise: flush sibling of the sunken center (no outer Y gutter).
        overlay
          ? expanded
            ? 'absolute inset-0'
            : cn('absolute bottom-2 right-0', STATION_IDENTITY_INSET_TOP)
          : 'self-stretch',
      )}
      style={{
        // Fullscreen fills its positioning context (the pane's own `relative`
        // row — center column + push column together), which is what makes
        // this "fullscreen the column over the center work surface" rather
        // than a bigger px number chasing the viewport. Narrow-but-not-expanded
        // keeps the resized px width; only a real fullscreen toggle goes wide.
        width: expanded ? '100%' : width,
        ...(overlay ? { zIndex: zIndex.panel } : null),
      }}
    >
      {/* Drag ONLY — no `onCollapse`. The leading edge used to grow a
          hover-revealed collapse chevron, which made two dismiss controls for
          one column: that chevron and the band's `→|`, 40px apart, doing the
          identical thing. It was also the weaker of the two — invisible until
          the pointer was already on the 8px sash, and hanging OUTSIDE the card
          in the workspace's own space. Dropping it also drops the
          "· click chevron to hide" half of the sash tooltip, so the grip now
          says one thing: drag to resize. Escape still closes the column. */}
      <HorizontalEdgeResizeHandle
        edgeHandleProps={edgeHandleProps}
        isDragging={isDragging}
        edge="leading"
        placement="outset"
        tooltipLabel={resizeTooltip}
      />
      {/* Flush in-flow surface; elevated aside for narrow overlay. Fullscreen
          expands the same aside but square + no float shadow (edge-to-edge). */}
      <div
        className={cn(
          overlay ? DETAIL_STACK_ASIDE_SURFACE : DETAIL_STACK_PUSH_COLUMN_CLASS,
          expanded && 'rounded-none shadow-none',
          'h-full min-h-0',
        )}
      >
        <div className={UNBOX_PUSH_TOP_BAND}>
          <HoverTooltip label={UNBOX_PUSH_CLOSE_LABEL} asChild>
            <IconButton
              // `sm` (28px) + a 14px glyph, with the band's `pl-2` paying off
              // the resulting optical inset so the MARK — not the box — lands on
              // the occupant's content gutter. See UNBOX_PUSH_TOP_BAND.
              size="sm"
              tone="neutral"
              ariaLabel={UNBOX_PUSH_CLOSE_LABEL}
              // `→|` — the panel is PARKED back against the edge it came from,
              // not cancelled, and the arrow says which way it goes. Same glyph
              // it wore in the pane cluster; the glyph was never the defect.
              icon={<ArrowRightToLine className="h-3.5 w-3.5" />}
              onClick={onClose}
              // `rounded-none`: bare `<button>`s pick up a faint native
              // rounded-box chrome in WebKit (Tailwind's own Preflight sets
              // `appearance: button`, not `none`, specifically so border-radius
              // becomes stylable on iOS Safari — it does not zero it). Flush is
              // the house rule for this band; nothing here earns a corner.
              className="-ml-px rounded-none"
              data-testid="unbox-push-close"
            />
          </HoverTooltip>
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
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </aside>
  );
}
