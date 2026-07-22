import {
  appChromeBandHairlineClass,
  appChromeClass,
  appChromeMutedClass,
  appWorkCanvasEdgeClass,
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
 * Scan-dock rails keep the list flush ({@link SIDEBAR_RAIL_INSET_X}); the status
 * dot rides a compact FLOW track at the row's left and the title sits one tight
 * {@link SIDEBAR_MASTER_NAV_MODE_GAP} after it (see {@link SIDEBAR_RAIL_LEADING_PAD}).
 */
export const SIDEBAR_GUTTER = 'px-1.5';

// ── MasterNav geometry (closed header) — pad / glyph / gap SoT ────────────────
/** Horizontal pad on the full-nav chevron hit box. */
export const SIDEBAR_MASTER_NAV_CHEVRON_PAD_X = 'px-2.5';
/** Chevron + mode glyph box (pairs with `h-4 w-4`). */
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
 * The eyebrow ({@link SidebarRailShell}) mirrors the same `pad → track → gap`
 * so its title shares the row-title x; the dense scan bar
 * (`STATION_SCAN_BAR_*_DENSE` in `station/scan-bar/tokens.ts`) centers its icon
 * on the dot track and lands its typed text on the title — one clean column.
 * The MasterNav "now" label deliberately stays deeper (its chevron + hairline +
 * mode glyph own the 0→47px chrome column above the dock).
 */
export const SIDEBAR_RAIL_LEADING_PAD = 'pl-2';
/** Dot / edit-checkbox flow-track width (centers the `h-2` dot / `h-3.5` box). */
export const SIDEBAR_RAIL_DOT_TRACK = 'w-4';

/**
 * Horizontal inset for scan-dock recent-rail **list hosts**. Flush left so the
 * row button's {@link SIDEBAR_RAIL_LEADING_PAD} leading track is measured from
 * the sidebar edge — the status dot hugs the left with no dead gutter, and the
 * title lands on the dense rail column. Right flush for
 * {@link SIDEBAR_RAIL_ROW_PAD_RIGHT}.
 */
export const SIDEBAR_RAIL_INSET_X = 'pl-0 pr-0';

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
 * Desktop app content host — soft top-left cutout + depth-edge hairline where
 * master sidebar × global header meet the work column. Chrome
 * ({@link appChromeClass}) shows through the curve; the stroke is
 * {@link appWorkCanvasEdgeClass} so every desktop page gets the same radius
 * hairline (not only Unbox/Triage/Pack). Pair with GlobalHeader (no
 * `border-b`). Chromeless / mobile routes skip it.
 */
export const appContentShellClass =
  `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-2xl ${appWorkCanvasEdgeClass}`;

/**
 * Shared hit-box for GlobalHeader icon actions (sidebar, goal ring, WO, right rail).
 * Pair with IconButton `size="md"` (h-8) — wrappers stay `flex h-8 items-center`
 * so absolute badges don't shift the flex baseline.
 */
export const HEADER_ICON_WRAP = 'relative flex h-8 w-8 shrink-0 items-center justify-center';

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

/** Canonical glyph box — pairs with IconButton `size="md"`. */
export const HEADER_ICON_GLYPH = 'h-4 w-4';

/**
 * Shared IconButton chrome for GlobalHeader — same radius, mute tone, and hover
 * fill across the entire top bar (stroke glyphs sit on this face).
 */
export const HEADER_ICON_BTN_CLASS =
  'rounded-full text-text-muted hover:bg-surface-sunken';

/** Pressed / open fill for header icon toggles. */
export const HEADER_ICON_BTN_OPEN_CLASS = 'bg-surface-sunken';

/**
 * Master-nav MRU jump chips — same cell width as scan-bar compact mode segments
 * (`w-8`) so the closed-header icon column stacks flush with Ticket / Pin / Hash
 * on the band below. Gap-0 + no nested px wrappers.
 */
export const SIDEBAR_MRU_CLUSTER = 'ml-auto flex h-full shrink-0 items-stretch gap-0 pr-0';

/** One MRU hit cell — centers IconButton xs inside a compact mode-width column. */
export const SIDEBAR_MRU_CELL = 'flex h-full w-8 shrink-0 items-center justify-center';

/** Glyph for MRU jump chips (pairs with IconButton `size="xs"`). */
export const SIDEBAR_MRU_GLYPH = 'h-3.5 w-3.5';
