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
 * Mid-canvas right-edge jumps stay a sliced side bookmark (flush right) —
 * different job from the floating identity / more-details shells.
 */
import { HEADER_ICON_GAP } from '@/components/layout/header-shell';
import { elevationClass } from '@/design-system/tokens/shadows';

/** Soft raised — lighter than glass work-card `raised` default. */
const STATION_BOOKMARK_ELEVATION = elevationClass('raised', 'soft');

/**
 * Absolute float host for {@link StationContextBar} — overlays the panel top
 * with no reserved in-flow shelf (the gray “context bar band”). Click-through
 * outer; children re-enable with `pointer-events-auto`. Mirrors
 * `slicedActionDockWrapperClass({ docked: false })` for the bottom dock.
 */
export const stationContextBarHostClass =
  'pointer-events-none absolute inset-x-0 top-0 z-raised';

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
 * top + right of that host (panel edge). Pair with `pointer-events-auto`.
 */
export const stationMoreDetailsHostClass =
  'pointer-events-auto absolute top-0 right-0 flex items-start';

/**
 * Scroll-body top clearance when {@link StationContextBar} floats absolute
 * over the canvas (identity shell ≈ `min-h-10` + pad + shadow). Pair with
 * `StationWorkbench` `reserveIdentityClearance`.
 */
export const STATION_IDENTITY_SCROLL_CLEARANCE = 'pt-14';
