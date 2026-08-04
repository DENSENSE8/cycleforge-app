import type { CSSProperties } from 'react';
import { cn } from '@/utils/_cn';

/** Shared layout tokens — one place to tune inset / width / header offset. */
export const DETAIL_STACK_LAYOUT = {
  widthPx: 420,
  /** Uniform floating gap from the viewport edges on all four sides. */
  insetPx: 12,
  /** Matches global header band (`z-header` / `top-[40px]`). */
  headerOffsetPx: 40,
} as const;

/**
 * Drag-to-resize contract for NON-MODAL detail inspectors (dashboard order
 * inspector, receiving More details). Modal occupants keep the fixed
 * {@link DETAIL_STACK_LAYOUT} width.
 *
 * `maxWidthPad` is the viewport the panel must leave behind, and it is derived,
 * not taste: the docked sidebar is 360px and the Pending grid's own minimum
 * content width is ~596px (the sum of its column tracks — below that it
 * horizontal-scrolls and starts force-hiding columns). 360 + 596 ≈ 960, so at
 * 1440 the inspector caps near 480px and the queue stays readable; at 1920 it
 * can reach ~960. Sizing past that trades the collection map for the record,
 * which is the trade this whole surface exists to avoid.
 */
export const DETAIL_STACK_RESIZE = {
  storageKey: 'detail-inspector-width',
  defaultWidthPx: DETAIL_STACK_LAYOUT.widthPx,
  minWidthPx: 360,
  maxWidthPadPx: 960,
} as const;

/**
 * Collapse contract for NON-MODAL detail inspectors on {@link RightRailHost}.
 *
 * Open: collapse chevron on the leading {@link HorizontalEdgeResizeHandle}
 * (`onCollapse`). Collapsed: width-drawer to 0 + a slim expand strip on the
 * right edge ({@link detailStackCollapseStripClassName}). Persists beside
 * {@link DETAIL_STACK_RESIZE}. Modal + assistant dock do not use this.
 */
export const DETAIL_STACK_COLLAPSE = {
  storageKey: 'detail-inspector-collapsed',
  /** Slim expand strip width when the inspector is parked (Tailwind twin: `w-8`). */
  stripWidthPx: 32,
} as const;

/** @param widthPx overrides the fixed default (resizable non-modal inspectors). */
export function detailStackAsideStyle(widthPx?: number): CSSProperties {
  const { insetPx, widthPx: defaultWidthPx } = DETAIL_STACK_LAYOUT;
  const width = widthPx ?? defaultWidthPx;
  // Floats near the top-right of the viewport with an even gap on every side —
  // ABOVE the (backdrop-dimmed) global header, not below it. `top: insetPx`
  // moves it up; `right: insetPx` pulls it in off the flush edge (over to the
  // left); `bottom: insetPx` keeps a matching gap so the padding wraps the whole
  // card. Height fills top→bottom within those insets.
  return {
    top: insetPx,
    right: insetPx,
    bottom: insetPx,
    width: `min(${width}px, calc(100vw - ${insetPx * 2}px))`,
  };
}

/**
 * Parked expand strip when a non-modal detail inspector is collapsed.
 * Fixed chrome on the right edge — not a second white card.
 */
export function detailStackCollapseStripClassName(elevated = false): string {
  return cn(
    'fixed flex w-8 flex-col items-center pt-3',
    elevated ? 'z-detailStack' : 'z-panel',
  );
}

export function detailStackCollapseStripStyle(): CSSProperties {
  const { insetPx } = DETAIL_STACK_LAYOUT;
  return {
    top: insetPx,
    right: insetPx,
    bottom: insetPx,
  };
}

/**
 * The detail-stack aside surface shell — elevated float recipe for modal /
 * overlay inspectors and the **narrow-viewport** Unbox push exception.
 * In-flow flush push columns use {@link DETAIL_STACK_PUSH_COLUMN_CLASS} instead.
 */
export const DETAIL_STACK_ASIDE_SURFACE =
  'isolate flex flex-col overflow-hidden rounded-2xl border border-border-soft bg-surface-card shadow-2xl shadow-scrim/40';

/**
 * The IN-FLOW flush push column — right-edge mirror of
 * {@link CONTEXT_PANEL_COLUMN_CLASS} (ruled 2026-08-03 exact flush planes).
 *
 * - **The card itself is the element that tweens its width**, not an
 *   `overflow-hidden` host wrapping a fixed-width absolute child (the spine's
 *   shape in `SidebarNavColumn`). The leading resize grip renders *outside* the
 *   card (`HorizontalEdgeResizeHandle` `placement="outset"`), so a clipping host
 *   would shear it. `ContextPanelLayout` solved exactly this on the left edge by
 *   animating the card at `overflow-visible` with an inner clip shell — this is
 *   that recipe mirrored, not a second drawer.
 * - **Flat elevation + leading hairline** against the sunken/canvas center —
 *   outer `m-*` islands and cast shadows are not depth (source-of-truth → Depth
 *   elevation · Frame column budget).
 */
export const DETAIL_STACK_PUSH_COLUMN_CLASS = cn(
  'relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden',
  'border-l border-border-soft bg-surface-card',
);

/**
 * Parked push column — the in-flow twin of
 * {@link detailStackCollapseStripClassName}. Same 32px strip, flush on the
 * shared ground (no outer margin island).
 */
export const DETAIL_STACK_PUSH_STRIP_CLASS =
  'relative flex h-full w-8 shrink-0 flex-col items-center border-l border-border-soft bg-surface-card pt-3';

/** Default detail stack — panel band (`z-panel`). */
export const detailStackAsideClassName = `fixed z-panel ${DETAIL_STACK_ASIDE_SURFACE}`;

/**
 * Elevated variant — sits in the dedicated `detailStack` band (above a
 * workbench workspace overlay + its popovers, below modals). Opt-in per
 * occupant via the `elevated` flag so only surfaces that open OVER a
 * `panel`-band workspace (receiving Unbox/Triage) rise; every other detail
 * stack keeps `z-panel` so its own sub-dialogs (portaled at
 * `panelPopover`/`panelOverlay`) stay on top.
 */
export const detailStackAsideElevatedClassName = `fixed z-detailStack ${DETAIL_STACK_ASIDE_SURFACE}`;
/**
 * Viewport backdrop behind a detail stack. Two variants pair with the two aside
 * bands above and pull their z-band from the SoT scale
 * (`src/design-system/tokens/z-index.ts`) — never a raw `z-[NNN]`:
 * - default: `panelBackdrop` (just under `panel`), a light dim.
 * - elevated: `detailStackBackdrop` (just under `detailStack`), a deeper dim +
 *   blur so the workbench canvas recedes with slide-over depth.
 */
export const detailStackBackdropClassName =
  'fixed inset-0 z-panelBackdrop bg-scrim/55 backdrop-blur-[2px]';

export const detailStackBackdropElevatedClassName =
  'fixed inset-0 z-detailStackBackdrop bg-scrim/70 backdrop-blur-md';

/**
 * Invisible dismiss layer for NON-MODAL inspectors that still want click-off
 * close (receiving details). Same z-band as the modal backdrop pair, but no
 * scrim / blur — the queue stays visually undimmed while the first outside
 * click closes the panel. Opt-in via `closeOnOutsideClick`; dashboard order
 * inspector leaves this off so the grid stays live underneath.
 */
export const detailStackDismissLayerClassName = 'fixed inset-0 z-panelBackdrop';

export const detailStackDismissLayerElevatedClassName =
  'fixed inset-0 z-detailStackBackdrop';

/** Full-height dock for the persistent assistant (⌘J) — flush right edge, no inset card. */
export function assistantDockAsideStyle(): CSSProperties {
  const { headerOffsetPx, widthPx } = DETAIL_STACK_LAYOUT;
  return {
    top: headerOffsetPx,
    right: 0,
    bottom: 0,
    width: `min(${widthPx}px, 100vw)`,
  };
}

export const assistantDockAsideClassName =
  'fixed z-panel flex flex-col overflow-hidden border-l border-border-soft bg-surface-card shadow-xl';
