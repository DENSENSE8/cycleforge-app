import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/** Context-panel layout tokens — the route's own sidebar, in the CONTENT region. */

/** Default context-panel width in px. */
export const CONTEXT_PANEL_WIDTH_PX = 360;

/** Drag-to-resize contract for every context-panel rail (left-anchored, right-edge handle via `useHorizontalEdgeResize` `edge: */
export const CONTEXT_PANEL_RESIZE = {
  storageKey: 'context-panel-width',
  defaultWidthPx: CONTEXT_PANEL_WIDTH_PX,
  minWidthPx: 300,
  /**
   * Desk / picker routes — leave ~760 for the work surface.
   * Scan stations use {@link CONTEXT_PANEL_RESIZE.stationMaxWidthPadPx} (0) so
   * the left rail can meet an open Displays column.
   */
  maxWidthPadPx: 760,
  /** Scan stations — no forced center pad; rails may close the gap entirely. */
  stationMaxWidthPadPx: 0,
} as const;

/** Collapse contract for every context-panel rail (picker / scan + recents / feed — whatever the route mounts in {@link ContextPanelLayout}). */
export const CONTEXT_PANEL_COLLAPSE = {
  storageKey: 'context-panel-collapsed',
  /** Slim expand strip width when the rail is parked (Tailwind twin: `w-8`). */
  stripWidthPx: 32,
  /**
   * Mid-strip MRU peek when the operator parks the rail — top-N from the open
   * rail's visible feed (Unbox golden = `unboxRecent` status-dot pins).
   */
  mruPinCount: 5,
} as const;

/**
 * @deprecated Floating-island gutters retired 2026-08-03 (flush planes).
 * @deprecated Floating-island gutters retired 2026-08-03 (flush planes). Kept
 */
const CONTEXT_PANEL_OUTER_MARGIN = 'm-2';

/**
 * @deprecated See {@link CONTEXT_PANEL_OUTER_MARGIN}. Unbox flush push columns
 * no longer use vertical outer gutters.
 */
const CONTEXT_PANEL_OUTER_MARGIN_Y = 'my-2';

/** Parked expand strip when the context panel is collapsed. */
export const CONTEXT_PANEL_COLLAPSE_STRIP_CLASS = cn(
  'relative',
  'flex h-full w-8 shrink-0 flex-col items-center border-r border-border-soft bg-surface-card',
);

/** The in-DISPLAY context panel column (picker / rail / scan bar). */
export const CONTEXT_PANEL_COLUMN_CLASS = cn(
  'relative',
  'flex h-full w-[360px] shrink-0 flex-col overflow-hidden',
  'border-r border-border-soft bg-surface-card',
);

/**
 * Host for {@link CONTEXT_PANEL_COLUMN_CLASS} + the workspace inside the content region:
 * WHITE (operator ruling, 2026-08-30). It was `appCanvasClass` on the theory
 */
export const CONTEXT_PANEL_HOST_CLASS = cn(
  // No padding and no gap:
  'flex min-h-0 min-w-0 flex-1 overflow-hidden',
  appChromeClass,
);
