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
 * bottom corners rounded (side radii override Panel `radius="xl"`).
 */
export const stationBookmarkPanelClass =
  `rounded-t-none rounded-b-xl border border-t-0 border-border-soft ${STATION_BOOKMARK_ELEVATION}`;

/**
 * Top-right utilities bookmark — flush top + right of the work canvas;
 * hairline on left · bottom only; bottom-left corner rounded.
 */
export const stationMoreDetailsPanelClass =
  `rounded-tl-none rounded-tr-none rounded-br-none rounded-bl-xl border-l border-b border-border-soft ${STATION_BOOKMARK_ELEVATION}`;

/** Inner pad for identity + more-details bookmark faces (matches icon-gap unit). */
export const stationBookmarkPadClass = 'p-0.5';

/** Gap between icons / chips inside a bookmark — same integer as GlobalHeader. */
export const stationBookmarkGapClass = HEADER_ICON_GAP;
