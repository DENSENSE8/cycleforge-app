import {
  appCanvasClass,
  appChromeBandHairlineClass,
  appChromeClass,
  appChromeMutedClass,
  appWashClass,
} from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/** Inner bottom hairline shared by receiving sidebar + workspace chrome (not outer border-b). */
export const receivingHeaderHairlineClass = appChromeBandHairlineClass;

/**
 * Canonical left gutter for sidebar sections. Every band, eyebrow, and rail row
 * in a sidebar panel should align to THIS value — pass it through `cn()` so it
 * wins over any baked-in `px-*` on the shared band constants below. Single knob:
 * change it here and every section that references it re-aligns together.
 *
 * 6px (px-1.5) is the house sidebar gutter. Mode pills inset to this line.
 * Scan-dock rails inset the list to {@link SIDEBAR_RAIL_INSET_X} (left =
 * {@link SIDEBAR_GUTTER}); the status
 * dot rides a compact FLOW track at the row's left and the title sits one tight
 * {@link SIDEBAR_MASTER_NAV_MODE_GAP} after it (see {@link SIDEBAR_SCAN_DOCK_LEADING_ROW}).
 */
export const SIDEBAR_GUTTER = 'px-1.5';

// ── MasterNav geometry (identity band) — pad / glyph / gap SoT ────────────────
/** Mode glyph box (pairs with `h-4 w-4`). */
export const SIDEBAR_MASTER_NAV_GLYPH = 'h-4 w-4';
/** Horizontal pad on the mode-identity control. */
export const SIDEBAR_MASTER_NAV_MODE_PAD_X = 'px-2.5';
/** Gap between mode glyph and label. */
export const SIDEBAR_MASTER_NAV_MODE_GAP = 'gap-1.5';

/**
 * Recent-rail **leading track** (scan-dock column SoT). The status dot / edit
 * checkbox ride a compact FLOW track at the row's left; the row title sits one
 * tight {@link SIDEBAR_MASTER_NAV_MODE_GAP} (`gap-1.5`) after it. This replaced
 * an absolute dot near the edge + a deep MasterNav-label title inset — a combo
 * that opened a ~50px canyon between the dot and the title. Composed as
 * Tailwind tokens (density-aware) — never a magic rem — so the column tracks
 * `--cf-density`.
 *
 * Column math: `pl-2` (8) + `w-4` track (16) + `gap-1.5` (6) ⇒ title at 30px.
 * The eyebrow ({@link SidebarRailShell}), rail rows, and dense scan bar
 * (`leadingColumn="rail"`) all compose {@link SIDEBAR_SCAN_DOCK_LEADING_ROW}
 * so icon/dot track + typed text share one clean column — never a magic rem twin.
 * The MasterNav "now" label keeps its own pad ({@link SIDEBAR_MASTER_NAV_MODE_PAD_X})
 * so identity sits beside the mode glyph above the dock — not the rail's leading track.
 */
/** Leading pad before the dot track (`pl-2`) — internal to {@link SIDEBAR_SCAN_DOCK_LEADING_ROW}. */
const SIDEBAR_RAIL_LEADING_PAD = 'pl-2';
/** Dot / edit-checkbox flow-track width (centers the `h-2` dot / `h-3.5` box). */
export const SIDEBAR_RAIL_DOT_TRACK = 'w-4';

/**
 * Shared scan-dock leading row — `pad → track → gap` flex shell. Compose with
 * a {@link SIDEBAR_RAIL_DOT_TRACK} cell (status dot / scan icon / empty spacer)
 * then the title or scan input. Single knob for Unbox / Triage / Testing /
 * Shipping / Labels scan-dock alignment.
 */
export const SIDEBAR_SCAN_DOCK_LEADING_ROW = cn(
  'flex min-w-0 items-center',
  SIDEBAR_RAIL_LEADING_PAD,
  SIDEBAR_MASTER_NAV_MODE_GAP,
);

/**
 * Left inset for scan-dock chrome (list host, eyebrow, dense scan bar).
 * Same value as {@link SIDEBAR_GUTTER}'s horizontal pad — selection rings sit on
 * this gutter; {@link SIDEBAR_SCAN_DOCK_LEADING_ROW} measures from here so scan
 * text / eyebrow / row titles stay one column.
 */
export const SIDEBAR_RAIL_INSET_LEFT = 'pl-1.5';

/**
 * Horizontal inset for scan-dock recent-rail **list hosts**. Left =
 * {@link SIDEBAR_RAIL_INSET_LEFT} (sidebar gutter); right flush so rows own
 * {@link SIDEBAR_RAIL_ROW_PAD_RIGHT} alone (avoids doubling the right edge).
 */
export const SIDEBAR_RAIL_INSET_X = cn(SIDEBAR_RAIL_INSET_LEFT, 'pr-0');

/**
 * Right pad on scan-dock rail rows (and the matching eyebrow). Narrows the
 * selection ring + age so they clear `rounded-tl-2xl` and share one right edge
 * with the eyebrow pencil / optical `#` mode glyph.
 */
export const SIDEBAR_RAIL_ROW_PAD_RIGHT = 'pr-1.5';

/** 40px identity / mode-pill row — aligns sidebar mode slider with workspace PaneHeader. */
export const receivingIdentityBandClass = `flex h-[40px] shrink-0 items-center ${appChromeClass} px-3 ${receivingHeaderHairlineClass}`;

/**
 * 40px scan band — same grid height as other header bands, **full-bleed**
 * flat chrome (depth 2). StationScanBar owns left/right content inset; no card
 * elevation — the work canvas owns depth 1.
 */
export const receivingScanBandClass = `flex h-[40px] shrink-0 items-center px-0 ${appChromeClass} ${receivingHeaderHairlineClass}`;

export const sidebarHeaderBandClass = `shrink-0 ${appChromeClass} ${receivingHeaderHairlineClass}`;
// 40px pill/tab row — matches the dashboard's HorizontalButtonSlider band height.
// Sidebar variant of receivingIdentityBandClass: same 40px grid + hairline, but
// re-gutters to SIDEBAR_GUTTER so every sidebar panel aligns on one left column.
// The workspace keeps receivingIdentityBandClass directly (12px), so this only
// moves sidebar chrome — the two panes stay decoupled.
export const sidebarHeaderPillRowClass = cn(receivingIdentityBandClass, SIDEBAR_GUTTER, 'min-w-0');
/**
 * Sticky `nav` pill band inside a scrolling sidebar body — transparent (no bg
 * fill) so the active pill's drop shadow renders over rail rows beneath.
 * Pair with `HorizontalButtonSlider variant="nav" dense overlay`.
 */
export const sidebarNavOverlayBandClass = cn(
  'sticky top-0 z-10 flex min-h-[40px] shrink-0 items-center overflow-visible',
  SIDEBAR_GUTTER,
);
export const sidebarHeaderRowClass = `flex min-h-[44px] items-center ${SIDEBAR_GUTTER} py-1`;
export const sidebarHeaderControlClass =`h-full min-h-[44px] w-full appearance-none ${appChromeClass} px-3 py-1 pr-8 text-left text-role-micro uppercase tracking-wider text-text-muted outline-none transition-colors hover:bg-surface-hover`;

export const mainStickyHeaderClass = `shrink-0 sticky top-0 z-header border-b border-border-hairline ${appChromeMutedClass} backdrop-blur-sm`;
export const mainStickyHeaderRowClass = 'flex min-h-[44px] items-center justify-between gap-4 px-4 py-1';
export const mainStickyHeaderShellRowClass = 'flex h-[44px] items-center justify-between gap-4 px-4';
/** 40px queue banner — matches sidebar identity bands (receivingIdentityBandClass). */
export const mainStickyHeaderCompactRowClass = 'flex h-[40px] items-center justify-between gap-4 px-4';

/**
 * Desktop app content host — **square** top-left corner, no edge stroke.
 *
 * This used to be a `rounded-tl-2xl` cutout plus an `appWorkCanvasEdgeClass`
 * hairline all the way around, so chrome showed through the curve at the
 * sidebar × header join. That curve cut a notch out of the top-left of every
 * page; the canvas background now runs flat into that corner instead, and the
 * ONLY separator in the desktop frame is the flat hairline under
 * {@link GlobalHeader}. Keep it that way — re-adding a border here puts a
 * second line right beneath the header's.
 *
 * Chromeless / mobile routes skip this entirely.
 */
export const appContentShellClass = cn(
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
  // THE single page background — canvas ground + Appearance wash, in ONE place.
  // `<body>` is `appChromeClass` (card WHITE), so without a canvas step here
  // every page body had to paint its own: `DashboardScrollShell` did it twice,
  // `ContextPanelLayout` had a whole second host class
  // (`CONTEXT_PANEL_HOST_RECEIVING_CLASS`) that existed only to add the wash,
  // and five admin tabs added it again. Those stacked OPAQUE fills covered the
  // wash gradient everywhere except the rail's outset gutter, which is exactly
  // the tone seam at the rail edge. Every one of those is deleted; this is the
  // only background component. Page bodies stay transparent and inherit it.
  appCanvasClass,
  appWashClass,
);

/**
 * Shared hit-box for GlobalHeader icon actions (sidebar, goal ring, WO, right rail).
 * Pair with IconButton `size="md"` (h-8) — wrappers stay `flex h-8 items-center`
 * so absolute badges don't shift the flex baseline.
 */
export const HEADER_ICON_WRAP = 'relative flex h-8 w-8 shrink-0 items-center justify-center';

/**
 * Desktop top-chrome seam — GlobalHeader and the MasterNav spine identity band
 * must share this box model so their bottom hairlines meet at one Y.
 *
 * Put {@link TOP_CHROME_BAND_FACE} on the **same** element as the band height.
 * Wrapping a `h-[40px]` child in an outer `border-b` yields 41px (border outside
 * the height) and creates the 1px step at the spine × header T-junction.
 */
export const TOP_CHROME_BAND_FACE = 'h-[40px] shrink-0 border-b border-border-soft';

/** Flex row face for GlobalHeader (and any centered top-chrome band). */
export const TOP_CHROME_BAND_CLASS = `flex items-center ${TOP_CHROME_BAND_FACE}`;

/**
 * Horizontal inset for GlobalHeader and any chrome that must column-align with it
 * (station context bookmarks, sticky main headers). One knob — left + right.
 */
export const HEADER_INSET_X = 'px-3 sm:px-4';

/**
 * Exact gap between every GlobalHeader icon hit-box (left cluster + right rail).
 * One knob — left toggle / WO / goal / search / AI / clipboard / phone / inbox /
 * avatar all share this rhythm. Reuse for station more-details icon clusters.
 */
export const HEADER_ICON_GAP = 'gap-0.5';

/** Flex row for a GlobalHeader icon cluster. */
export const HEADER_ICON_CLUSTER = `flex h-8 shrink-0 items-center ${HEADER_ICON_GAP}`;

/**
 * Glyph box for GlobalHeader icon actions (sidebar, Mode, Recents, WO, clipboard,
 * inbox, search/AI). Native SVG `strokeWidth={2}` only — do **not** layer
 * `navIconStrokeClass` here; CSS `![stroke-width:…]` on dense glyphs reads
 * muddy/blurry at this size.
 */
export const TOP_CHROME_ICON_GLYPH = 'h-4 w-4';

/**
 * Shared IconButton chrome for GlobalHeader — same radius, mute tone, and hover
 * fill across the entire top bar (stroke glyphs sit on this face).
 */
export const HEADER_ICON_BTN_CLASS =
  'rounded-full text-text-muted hover:bg-surface-sunken';

/** Pressed / open fill for header icon toggles. */
export const HEADER_ICON_BTN_OPEN_CLASS = 'bg-surface-sunken';
