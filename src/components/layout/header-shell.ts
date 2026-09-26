import {
  appCanvasClass,
  appChromeBandHairlineClass,
  appChromeClass,
  appChromeMutedClass,
  appWashClass,
} from '@/design-system/tokens/app-surface';
import { NAV_ICON_STROKE_CLASS } from '@/components/icons/nav-weight';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** Inner bottom hairline shared by receiving sidebar + workspace chrome (not outer border-b). */
export const receivingHeaderHairlineClass = appChromeBandHairlineClass;

/** Canonical left gutter for sidebar sections. */
export const SIDEBAR_GUTTER = 'px-1.5';

/** Gap after the rail's leading track. */
const SIDEBAR_RAIL_LEADING_GAP = 'gap-1.5';

/** Recent-rail **leading track** (scan-dock column SoT). */
/** Leading pad before the dot track (`pl-2`) — internal to {@link SIDEBAR_SCAN_DOCK_LEADING_ROW}. */
const SIDEBAR_RAIL_LEADING_PAD = 'pl-2';
/** Dot / edit-checkbox flow-track width (centers the `h-2` dot / `h-3.5` box). */
export const SIDEBAR_RAIL_DOT_TRACK = 'w-4';

/** Shared scan-dock leading row — `pad → track → gap` flex shell. */
export const SIDEBAR_SCAN_DOCK_LEADING_ROW = cn(
  'flex min-w-0 items-center',
  SIDEBAR_RAIL_LEADING_PAD,
  SIDEBAR_RAIL_LEADING_GAP,
);

/** Left content gutter for scan-dock chrome (dense scan bar, row inner pad) — OUTER wrapper around {@link SIDEBAR_SCAN_DOCK_LEADING_ROW}. */
export const SIDEBAR_RAIL_INSET_LEFT = 'pl-0';

/**
 * Horizontal inset for scan-dock recent-rail **list hosts** — flush (`px-0`).
 * Selection rings paint edge-to-edge; content pad is on the row / scan bar
 * via {@link SIDEBAR_RAIL_INSET_LEFT} + {@link SIDEBAR_SCAN_DOCK_LEADING_ROW}.
 */
export const SIDEBAR_RAIL_INSET_X = 'px-0';

/** Trailing track for rail relative-age (`11h`) **and** filter-bar collapse / expand — one vertical column flush to the pane edge. */
export const SIDEBAR_RAIL_TRAILING_TRACK_CLASS =
  'flex w-8 shrink-0 items-center justify-center';

/** Height-only atom — ops chrome **under** the navigation header (28px / `h-7`). */
export const PRIMARY_CHROME_ROW_FACE = 'h-7 shrink-0';

/** Navigation header height atom — GlobalHeader (40px / `h-10`). */
const TOP_CHROME_ROW_FACE = 'h-10 shrink-0';

/** Pixel twin of the nav header height (assistant dock / detail-stack offset). */
export const TOP_CHROME_ROW_PX = 40;

/** Identity / mode-pill row — aligns sidebar mode slider with workspace PaneHeader. */
const receivingIdentityBandClass = `flex ${PRIMARY_CHROME_ROW_FACE} items-center ${appChromeClass} px-3 ${receivingHeaderHairlineClass}`;

/**
 * Scan band — same grid height as other header bands, **full-bleed**
 * flat chrome (depth 2). StationScanBar owns left/right content inset; no card
 * elevation — the work canvas owns depth 1.
 */
export const receivingScanBandClass = `flex ${PRIMARY_CHROME_ROW_FACE} items-center px-0 ${appChromeClass} ${receivingHeaderHairlineClass}`;

export const sidebarHeaderBandClass = `shrink-0 ${appChromeClass} ${receivingHeaderHairlineClass}`;
// Pill/tab row — matches the dashboard's HorizontalButtonSlider band height.
export const sidebarHeaderPillRowClass = cn(receivingIdentityBandClass, SIDEBAR_GUTTER, 'min-w-0');
/**
 * Sticky `nav` pill band inside a scrolling sidebar body — transparent (no bg
 * fill) so the active pill's drop shadow renders over rail rows beneath.
 * Pair with `HorizontalButtonSlider variant="nav" dense overlay`.
 */
export const sidebarNavOverlayBandClass = cn(
  'sticky top-0 z-10 flex items-center overflow-visible',
  PRIMARY_CHROME_ROW_FACE,
  SIDEBAR_GUTTER,
);
const sidebarHeaderControlClass =`h-full min-h-[44px] w-full appearance-none ${appChromeClass} px-3 py-1 pr-8 text-left text-role-micro uppercase tracking-wider text-text-muted outline-none transition-colors hover:bg-surface-hover`;

export const mainStickyHeaderClass = `shrink-0 sticky top-0 z-header border-b border-border-hairline ${appChromeMutedClass} backdrop-blur-sm`;
export const mainStickyHeaderRowClass = 'flex min-h-[44px] items-center justify-between gap-4 px-4 py-1';
export const mainStickyHeaderShellRowClass = 'flex h-[44px] items-center justify-between gap-4 px-4';
/** Queue banner — matches sidebar identity bands (receivingIdentityBandClass). */
export const mainStickyHeaderCompactRowClass = `flex ${PRIMARY_CHROME_ROW_FACE} items-center justify-between gap-4 px-4`;

/** Desktop app content host — **square** top-left corner, no edge stroke. */
export const appContentShellClass = cn(
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
  // THE single page background — canvas ground + Appearance wash, in ONE place.
  appCanvasClass,
  appWashClass,
);

/** Shared hit-box for GlobalHeader icon actions (find, goal ring, pins, inbox, account). */
export const HEADER_ICON_WRAP = 'relative flex h-full min-h-0 w-8 shrink-0 items-center justify-center';

/** Desktop navigation-header face — every 40px top-chrome band shares this box model. */
const TOP_CHROME_BAND_FACE = TOP_CHROME_ROW_FACE;

/** Flex row face for GlobalHeader (and any centered nav top-chrome band). */
export const TOP_CHROME_BAND_CLASS = `flex items-stretch ${TOP_CHROME_BAND_FACE}`;

/** Secondary station band under the scan-bar / chrome seam — left-rail eyebrow (Recent · N + pencil), carton identity commerce row 2, and… */
export const STATION_SECONDARY_BAND_FACE = 'h-6 shrink-0';

/** Top-edge seam for every station-column **footer** band — Context filter / recent receiving · utility `←|` · Displays `→|` · Unbox dock… */
const STATION_COLUMN_FOOTER_SEAM_CLASS = 'border-t border-border-hairline';

/** Shared station-column footer band — same 28px as {@link PRIMARY_CHROME_ROW_FACE} (To ship tabs · Band 1/3 · spine find) plus {@link… */
export const STATION_COLUMN_FOOTER_BAND_FACE = `flex ${PRIMARY_CHROME_ROW_FACE} w-full items-center ${STATION_COLUMN_FOOTER_SEAM_CLASS}`;

/**
 * Horizontal inset for GlobalHeader — flush to both edges (no left/right pad).
 * Icon cells own their geometry; edge alignment is not via header padding.
 */
export const HEADER_INSET_X = 'px-0';

/** Exact gap between every GlobalHeader icon hit-box (nav cluster · session pace · utilities rail). */
export const HEADER_ICON_GAP = 'gap-0';

/** Flex row for a GlobalHeader icon cluster — beam-height, square cells. */
export const HEADER_ICON_CLUSTER = `flex h-full shrink-0 items-stretch ${HEADER_ICON_GAP}`;

/*
 * `TOP_CHROME_NAV_LEAD` (`pl-2`) is DELETED (operator 2026-09-22:
 * `TOP_CHROME_NAV_LEAD` (`pl-2`) is DELETED (operator 2026-09-22: "you left
 */
/**
 * Gap between the beam's ZONES (nav cluster · scan dock · page context).
 * `gap-0.5` (2px) matches one cell's leftover air so zone boundaries share
 * the same rhythm as pill-to-pill.
 */
export const TOP_CHROME_ZONE_GAP = 'gap-0.5';

/**
 * Glyph BOX for top-chrome icons — 16px, and nothing else. Shared beyond the
 * header (condition pills, inline notices), so it must stay size-only.
 */
export const TOP_CHROME_ICON_GLYPH = 'h-4 w-4';

/** Glyph FACE for every icon on the 40px nav beam — GlobalHeader chrome (toggle · Pins · Recents · page face · search · goal · inbox ·… */
export const TOP_CHROME_ICON_FACE = cn(TOP_CHROME_ICON_GLYPH, NAV_ICON_STROKE_CLASS);

/**
 * Page-identity face and its child menu — one compact width. Find lives on
 * the right rail ({@link CommandBar}), not beside this chip.
 */
export const HEADER_PAGE_FACE_WIDTH = 'w-[11rem]';

/** Scan Stations (and any other long page menu) — cap height to the viewport under the header. */
export const HEADER_PAGE_MENU_SCROLL_CLASS =
  'max-h-[calc(100dvh-theme(spacing.20))] overflow-y-auto overscroll-contain scroll-pb-8';

/**
 * Shared IconButton chrome for GlobalHeader — the beam CELL itself, not a pill inside it:
 * **Operator 2026-09-22:** *"for all of the icons there should be no spacing
 */
export const HEADER_ICON_BTN_CLASS = cn(
  'h-full w-full min-h-0 text-text-default transition-colors hover:bg-surface-sunken active:scale-100',
  cornerClass('flush'),
);

/** Pressed / open fill for header icon toggles. */
export const HEADER_ICON_BTN_OPEN_CLASS = 'bg-surface-sunken';
