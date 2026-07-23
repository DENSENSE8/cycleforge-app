/**
 * Station bookmark chrome — flush under GlobalHeader / work-canvas top edge.
 *
 * Identity + more-details hang like header bookmarks: square top (no top
 * hairline), soft stroke on the free edges, rounded only where the tab lifts
 * off the canvas. Elevation uses DS {@link elevationClass}(`raised`, `soft`) —
 * softer than glass work cards (`raised` default). Inner pad + icon gap match
 * GlobalHeader via {@link HEADER_ICON_GAP} (header-shell SoT).
 */
import { HEADER_ICON_GAP } from '@/components/layout/header-shell';
import { elevationClass } from '@/design-system/tokens/shadows';

/** Soft raised — lighter than glass work-card `raised` default. */
const STATION_BOOKMARK_ELEVATION = elevationClass('raised', 'soft');

/**
 * Centered identity bookmark — flush top; hairline on left · right · bottom;
 * bottom corners `rounded-2xl` to match workbench cards below (PO accordion /
 * SectionTabs). Side radii override Panel `radius="2xl"`.
 */
export const stationBookmarkPanelClass =
  `rounded-t-none rounded-b-2xl border border-t-0 border-border-soft ${STATION_BOOKMARK_ELEVATION}`;

/**
 * Top-right utilities bookmark — flush top + right of the work canvas;
 * hairline on left · bottom only; bottom-left corner `rounded-2xl` (same
 * workbench card radius as the identity bookmark).
 */
export const stationMoreDetailsPanelClass =
  `rounded-tl-none rounded-tr-none rounded-br-none rounded-bl-2xl border-l border-b border-border-soft ${STATION_BOOKMARK_ELEVATION}`;

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
