/**
 * Station bookmark chrome — floating identity + corner utilities.
 *
 * Identity + more-details are raised shells (full radius, full hairline, soft
 * elevation) that **overlay** the work canvas — same placement idea as a
 * floating `SlicedActionDock` (`docked: false`), but pinned to the top.
 * The host is absolute (no in-flow canvas band / gray shelf behind the shell).
 * Elevation uses DS {@link elevationClass}(`raised`, `soft`) — softer than
 * glass work cards (`raised` default). Inner pad + icon gap match GlobalHeader
 * via {@link HEADER_ICON_GAP} (header-shell SoT).
 *
 * Top (+ right for more-details) inset matches the context-panel card gutter
 * (`CONTEXT_PANEL_OUTER_MARGIN` = `m-2` → `top-2` / `right-2`) so bookmark
 * chrome and the sidebar card share one top edge under GlobalHeader.
 *
 * Mid-canvas right-edge jumps stay a sliced side bookmark (flush right) —
 * different job from the floating identity / more-details shells.
 */
import { HEADER_ICON_GAP } from '@/components/layout/header-shell';
import { elevationClass } from '@/design-system/tokens/shadows';

/** Soft raised — lighter than glass work-card `raised` default. */
const STATION_BOOKMARK_ELEVATION = elevationClass('raised', 'soft');

/**
 * Canvas gutter twin of the context-panel card margin (`m-2` /
 * `CONTEXT_PANEL_OUTER_MARGIN` in `context-panel-column.ts`).
 * Host uses `top-2`; more-details stays `top-0` *inside* that host and only
 * adds `right-2` so the corner shell shares the panel’s right gutter without
 * double-inset.
 */
const STATION_BOOKMARK_CANVAS_INSET_TOP = 'top-2';
const STATION_BOOKMARK_CANVAS_INSET_RIGHT = 'right-2';

/**
 * Absolute float host for {@link StationContextBar} — overlays the panel top
 * with no reserved in-flow shelf (the gray “context bar band”). Click-through
 * outer; children re-enable with `pointer-events-auto`. Mirrors
 * `slicedActionDockWrapperClass({ docked: false })` for the bottom dock.
 * Top inset matches the context-panel card under GlobalHeader.
 */
export const stationContextBarHostClass =
  `pointer-events-none absolute inset-x-0 ${STATION_BOOKMARK_CANVAS_INSET_TOP} z-raised`;

/**
 * Centered identity shell — full `rounded-2xl` + full hairline so it floats
 * over the work canvas.
 */
export const stationBookmarkPanelClass =
  `rounded-2xl border border-border-soft ${STATION_BOOKMARK_ELEVATION}`;

/**
 * Top-right utilities shell — same floating recipe as the identity bookmark.
 * Host places it at the canvas top + right via {@link StationContextBar}.
 */
export const stationMoreDetailsPanelClass =
  `rounded-2xl border border-border-soft ${STATION_BOOKMARK_ELEVATION}`;

/**
 * Mid-canvas right-edge action tab (e.g. Triage → Open in Unbox) — flush
 * right; hairline on left · top · bottom; left corners rounded; right edge
 * sliced (no right radius / border) so it reads as a canvas bookmark.
 *
 * Host: mount on the station panel’s `relative` canvas root with
 * {@link stationRightEdgeActionHostClass} — **not** inside
 * `StationContextBar` `moreDetails` (that slot is top-right utilities only).
 */
export const stationRightEdgeActionClass =
  `rounded-l-2xl rounded-r-none border border-r-0 border-border-soft ${STATION_BOOKMARK_ELEVATION}`;

/**
 * Required placement for {@link StationRightEdgeAction}: flush right, ~¼ down
 * the work canvas (thumb zone). Apply on the action panel itself; parent must
 * be `position: relative` and full-height. Stays below SlicedActionDock / dock
 * (`z-fab`) and overlays; above workbench body (`z-0`).
 */
export const stationRightEdgeActionHostClass =
  'absolute right-0 top-1/4 z-raised';

/** Inner pad for identity + more-details bookmark faces (matches icon-gap unit). */
export const stationBookmarkPadClass = 'p-0.5';

/** Gap between icons / chips inside a bookmark — same integer as GlobalHeader. */
export const stationBookmarkGapClass = HEADER_ICON_GAP;

/**
 * Corner placement for more-details inside the floating context-bar host —
 * `top-0` of that host (which already carries the canvas top gutter) +
 * `right-2` so the shell matches the context-panel card’s right margin.
 * Pair with `pointer-events-auto`.
 *
 * When Ticket push squeezes Unbox, mount More details on the **pane** outer
 * host instead via {@link stationMoreDetailsPaneHostClass} so the icons do
 * not slide left with the Unbox column.
 */
export const stationMoreDetailsHostClass =
  `pointer-events-auto absolute top-0 ${STATION_BOOKMARK_CANVAS_INSET_RIGHT} flex items-start`;

/**
 * Pane-anchored More details — same canvas top + right gutters as the identity
 * bar, but relative to the receiving right-pane outer host (Unbox + Ticket).
 * Use when Ticket push would otherwise move a column-scoped `right-2` slot.
 */
export const stationMoreDetailsPaneHostClass =
  `pointer-events-auto absolute ${STATION_BOOKMARK_CANVAS_INSET_TOP} ${STATION_BOOKMARK_CANVAS_INSET_RIGHT} z-raised flex items-start`;

/**
 * Scroll-body top clearance when {@link StationContextBar} floats absolute
 * over the canvas (canvas inset + identity shell ≈ `min-h-10` + pad + shadow).
 * Pair with `StationWorkbench` `reserveIdentityClearance`.
 */
export const STATION_IDENTITY_SCROLL_CLEARANCE = 'pt-16';
