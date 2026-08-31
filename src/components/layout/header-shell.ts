import {
  appCanvasClass,
  appChromeBandHairlineClass,
  appChromeClass,
  appChromeMutedClass,
  appWashClass,
} from '@/design-system/tokens/app-surface';
import { NAV_ICON_STROKE_CLASS } from '@/components/icons/nav-weight';
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
 * Scan-dock recent rails are **flush** ({@link SIDEBAR_RAIL_INSET_X} = `px-0`)
 * so selection washes edge-to-edge; content column padding lives inside each
 * row (gutter + {@link SIDEBAR_SCAN_DOCK_LEADING_ROW}), not around the ring.
 */
export const SIDEBAR_GUTTER = 'px-1.5';

/**
 * Gap after the rail's leading track. Was `SIDEBAR_MASTER_NAV_MODE_GAP`, an
 * EXPORTED pair with `…_PAD_X` serving the spine org band. That band was
 * deleted 2026-08-03, which left the pad dead and this one named for a surface
 * it no longer touches — so the pad is gone and this is module-private under a
 * name that says what it actually does: the scan-dock leading gap.
 */
const SIDEBAR_RAIL_LEADING_GAP = 'gap-1.5';

/**
 * Recent-rail **leading track** (scan-dock column SoT). The status dot / edit
 * checkbox ride a compact FLOW track at the row's left; the row title sits one
 * tight {@link SIDEBAR_RAIL_LEADING_GAP} (`gap-1.5`) after it. This replaced
 * an absolute dot near the edge + a deep MasterNav-label title inset — a combo
 * that opened a ~50px canyon between the dot and the title. Composed as
 * Tailwind tokens (density-aware) — never a magic rem — so the column tracks
 * `--cf-density`.
 *
 * Column math: `pl-2` (8) + `w-4` track (16) + `gap-1.5` (6) ⇒ title at 30px.
 * The eyebrow ({@link SidebarRailShell}), rail rows, and dense scan bar
 * (`leadingColumn="rail"`) all compose {@link SIDEBAR_SCAN_DOCK_LEADING_ROW}
 * so icon/dot track + typed text share one clean column — never a magic rem twin.
 *
 * **The `pl-2` (8px) is not a free choice — it is the one gutter token
 * shared with {@link GlobalHeader}'s nav icon (2026-08-24).** GlobalHeader's
 * `SidebarCollapseControl` centers a `h-4 w-4` (16px) glyph in an
 * {@link HEADER_ICON_WRAP} (`w-8`, 32px) box, which lands the glyph's left
 * edge exactly 8px off the header's flush (`px-0`) left edge. The scan
 * station and recent rail sit in the same left-edge column as the header
 * (siblings under one un-padded content shell — see `ContextPanelLayout` /
 * `appContentShellClass`), so their leading dot/checkbox track has to start
 * at the same 8px or the sidebar reads as indented under its own header.
 * {@link SIDEBAR_RAIL_INSET_LEFT} used to add another `pl-1.5` (6px) in
 * front of this pad — a second, undocumented gutter stacking to 14px that
 * nothing upstream asked for. It is zeroed now: this `pl-2` is the ONLY
 * left pad between the sidebar's flush host edge and its content.
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
  SIDEBAR_RAIL_LEADING_GAP,
);

/**
 * Left content gutter for scan-dock chrome (dense scan bar, row inner pad) —
 * OUTER wrapper around {@link SIDEBAR_SCAN_DOCK_LEADING_ROW}. Nested *inside*
 * the full-bleed selection host so titles / scan text share one column
 * without insetting the blue wash from the pane edge.
 *
 * **Zero (2026-08-24), deliberately.** This used to carry its own `pl-1.5`
 * (6px) on top of the leading row's `pl-2` (8px), stacking to a 14px gutter
 * that read as indented under the flush 8px {@link GlobalHeader} nav icon
 * sitting directly above it in the same left-edge column. The leading row's
 * `pl-2` is now the ONE gutter token for this whole column (see the
 * `SIDEBAR_RAIL_LEADING_PAD` doc) — this constant stays as the named seam
 * `RailRow` / `StationScanBar` compose so a future second pad has one place
 * to land, but it must not itself carry width again.
 */
export const SIDEBAR_RAIL_INSET_LEFT = 'pl-0';

/**
 * Horizontal inset for scan-dock recent-rail **list hosts** — flush (`px-0`).
 * Selection rings paint edge-to-edge; content pad is on the row / scan bar
 * via {@link SIDEBAR_RAIL_INSET_LEFT} + {@link SIDEBAR_SCAN_DOCK_LEADING_ROW}.
 */
export const SIDEBAR_RAIL_INSET_X = 'px-0';

/**
 * Trailing track for rail relative-age (`11h`) **and** filter-bar collapse /
 * expand — one vertical column flush to the pane edge. Width matches
 * `CONTEXT_PANEL_COLLAPSE.stripWidthPx` / `w-8` so the parked expand strip is
 * the same column, not a different gutter.
 */
export const SIDEBAR_RAIL_TRAILING_TRACK_CLASS =
  'flex w-8 shrink-0 items-center justify-center';

/**
 * Height-only atom — ops chrome **under** the navigation header (28px / `h-7`).
 *
 * Scan-station first seam for **ops** chrome (scan bar · MasterNav L1 /
 * workbench tab/triage bands · grid column headers · PaneHeader). Station
 * carton identity + Displays top + desk inspector chrome use
 * `STATION_CHROME_ROW_FACE` (same 28px, with `max-h-7 min-h-0` so the row
 * cannot grow). Secondary station eyebrow stays
 * {@link STATION_SECONDARY_BAND_FACE} (`h-6`). Prefer this over raw
 * `h-7` / `h-[28px]` on those shells.
 *
 * **Not** the GlobalHeader / MasterNav spine top band — that is
 * {@link TOP_CHROME_ROW_FACE} (40px). Do not collapse the two.
 */
export const PRIMARY_CHROME_ROW_FACE = 'h-7 shrink-0';

/**
 * Navigation header height atom — GlobalHeader + MasterNav spine top band
 * (40px / `h-10`). Shares one band height via {@link TOP_CHROME_BAND_FACE}.
 * Never alias this to {@link PRIMARY_CHROME_ROW_FACE} — densifying the nav
 * header to match scan-station row 1 is a regression.
 * Kept file-local so knip does not flag an unused export; guards assert the
 * literal via {@link TOP_CHROME_BAND_FACE}.
 */
const TOP_CHROME_ROW_FACE = 'h-10 shrink-0';

/** Pixel twin of the nav header height (assistant dock / detail-stack offset). */
export const TOP_CHROME_ROW_PX = 40;

/** Identity / mode-pill row — aligns sidebar mode slider with workspace PaneHeader. */
export const receivingIdentityBandClass = `flex ${PRIMARY_CHROME_ROW_FACE} items-center ${appChromeClass} px-3 ${receivingHeaderHairlineClass}`;

/**
 * Scan band — same grid height as other header bands, **full-bleed**
 * flat chrome (depth 2). StationScanBar owns left/right content inset; no card
 * elevation — the work canvas owns depth 1.
 */
export const receivingScanBandClass = `flex ${PRIMARY_CHROME_ROW_FACE} items-center px-0 ${appChromeClass} ${receivingHeaderHairlineClass}`;

export const sidebarHeaderBandClass = `shrink-0 ${appChromeClass} ${receivingHeaderHairlineClass}`;
// Pill/tab row — matches the dashboard's HorizontalButtonSlider band height.
// Sidebar variant of receivingIdentityBandClass: same primary grid + hairline, but
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
  'sticky top-0 z-10 flex items-center overflow-visible',
  PRIMARY_CHROME_ROW_FACE,
  SIDEBAR_GUTTER,
);
export const sidebarHeaderControlClass =`h-full min-h-[44px] w-full appearance-none ${appChromeClass} px-3 py-1 pr-8 text-left text-role-micro uppercase tracking-wider text-text-muted outline-none transition-colors hover:bg-surface-hover`;

export const mainStickyHeaderClass = `shrink-0 sticky top-0 z-header border-b border-border-hairline ${appChromeMutedClass} backdrop-blur-sm`;
export const mainStickyHeaderRowClass = 'flex min-h-[44px] items-center justify-between gap-4 px-4 py-1';
export const mainStickyHeaderShellRowClass = 'flex h-[44px] items-center justify-between gap-4 px-4';
/** Queue banner — matches sidebar identity bands (receivingIdentityBandClass). */
export const mainStickyHeaderCompactRowClass = `flex ${PRIMARY_CHROME_ROW_FACE} items-center justify-between gap-4 px-4`;

/**
 * Desktop app content host — **square** top-left corner, no edge stroke.
 *
 * This used to be a `rounded-tl-2xl` cutout plus an `appWorkCanvasEdgeClass`
 * hairline all the way around, so chrome showed through the curve at the
 * sidebar × header join. That curve cut a notch out of the top-left of every
 * page. Do not put a border under {@link GlobalHeader} either — the inverted
 * desktop frame is a raised card on recessed chrome, and a header hairline
 * splits that card. Keep this host square and stroke-less.
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
 * Pair with IconButton `size="md"` — wrappers stretch to the full {@link TOP_CHROME_BAND_FACE}
 * height so hover / open washes meet the band edges (never a floated
 * h-8 island inside the nav beam).
 */
export const HEADER_ICON_WRAP = 'relative flex h-full min-h-0 w-8 shrink-0 items-stretch justify-center';

/**
 * Equal-fill hit-box formerly used by the MasterNav spine top pin band.
 * Kept for Displays parked-rail commentary; no live spine consumer.
 */
export const SPINE_TOP_PIN_WRAP =
  'relative flex h-full min-h-0 min-w-0 flex-1 items-stretch justify-center';

/**
 * Desktop navigation-header face — GlobalHeader and the MasterNav spine top
 * band must share this box model so the 40px band is one height across the
 * spine × header join. No bottom hairline: the inverted frame is a raised
 * card, and a stroke under the nav splits it.
 *
 * Height comes from {@link TOP_CHROME_ROW_FACE} (40px), **not**
 * {@link PRIMARY_CHROME_ROW_FACE} (28px station/ops chrome under the header).
 *
 * Put {@link TOP_CHROME_BAND_FACE} on the **same** element as the band height.
 * Wrapping a height child in an outer `border-b` yields 41px (border outside
 * the height) and creates a 1px step at the spine × header T-junction.
 */
export const TOP_CHROME_BAND_FACE = TOP_CHROME_ROW_FACE;

/** Flex row face for GlobalHeader (and any centered nav top-chrome band). */
export const TOP_CHROME_BAND_CLASS = `flex items-stretch ${TOP_CHROME_BAND_FACE}`;

/**
 * Secondary station band under the scan-bar / chrome seam — left-rail eyebrow
 * (Recent · N + pencil), carton identity commerce row 2, and Displays group
 * eyebrows (VERIFICATION · …) share this `h-6` (24px) face so one hairline
 * runs left → center → right.
 */
export const STATION_SECONDARY_BAND_FACE = 'h-6 shrink-0';

/**
 * Top-edge seam for every station-column **footer** band — Context filter /
 * recent receiving · utility `←|` · Displays `→|` · Unbox dock Band 2 · spine
 * sign-in. One `border-t` + `border-border-hairline` so the floor hairline
 * reads as a continuous Y across columns (twin of {@link TOP_CHROME_BAND_FACE}
 * for the nav top). Distinct from {@link receivingHeaderHairlineClass} (top
 * inset chrome under GlobalHeader).
 */
const STATION_COLUMN_FOOTER_SEAM_CLASS = 'border-t border-border-hairline';

/**
 * Shared station-column footer band — same 28px as {@link PRIMARY_CHROME_ROW_FACE}
 * (To ship tabs · Band 1/3 · spine find) plus {@link STATION_COLUMN_FOOTER_SEAM_CLASS}.
 * Pad / justify are consumer-local (`mt-auto`, `justify-center`, `px-2`, …).
 * Never alias to the 40px nav beam ({@link TOP_CHROME_BAND_FACE}).
 */
export const STATION_COLUMN_FOOTER_BAND_FACE = `flex ${PRIMARY_CHROME_ROW_FACE} w-full items-center ${STATION_COLUMN_FOOTER_SEAM_CLASS}`;

/**
 * Horizontal inset for GlobalHeader — flush to both edges (no left/right pad).
 * Icon cells own their geometry; edge alignment is not via header padding.
 */
export const HEADER_INSET_X = 'px-0';

/**
 * Exact gap between every GlobalHeader icon hit-box (nav cluster · session
 * pace · utilities rail).
 * One knob — left toggle / WO / goal / search / AI / clipboard / phone / inbox /
 * avatar all share this rhythm. Reuse for station more-details icon clusters.
 */
export const HEADER_ICON_GAP = 'gap-0';

/** Flex row for a GlobalHeader icon cluster — beam-height, square cells. */
export const HEADER_ICON_CLUSTER = `flex h-full shrink-0 items-stretch ${HEADER_ICON_GAP}`;

/**
 * Glyph BOX for top-chrome icons — 16px, and nothing else. Shared beyond the
 * header (condition pills, inline notices), so it must stay size-only.
 */
export const TOP_CHROME_ICON_GLYPH = 'h-4 w-4';

/**
 * Glyph FACE for every icon on the 40px nav beam — GlobalHeader chrome
 * (toggle · Pins · Recents · page face · search · goal · inbox · assistant) **and**
 * the MasterNav spine's own top pin band ({@link SPINE_TOP_PIN_WRAP}).
 *
 * **Size and stroke resolve in ONE place (2026-08-19).** The two halves of that
 * beam sit on one Y and read as one row, so a header glyph drawing at native
 * stroke 2 beside a spine pin at 1.5 made the header half look heavier than the
 * nav half at identical 16px — the seam was legible as a weight change, which
 * is the one thing a shared beam must not show. The header now takes the spine's
 * page stroke; the earlier "native stroke only, never layer `navIconStrokeClass`"
 * note is superseded by this token rather than by per-call-site classes.
 *
 * There is no override tier any more, and no need for one: glyphs ship bare
 * since 2026-08-19, so nothing on the beam brings a competing weight for this
 * to outrank. (The page face's Unbox glyph used to carry 2.25 inside itself and
 * beat the beam on emission order — that is what the unwrap removed.)
 */
export const TOP_CHROME_ICON_FACE = cn(TOP_CHROME_ICON_GLYPH, NAV_ICON_STROKE_CLASS);

/**
 * Shared IconButton chrome for GlobalHeader — square hit wash filling the beam
 * cell (never a circle, never a floated h-8 island), sunken hover.
 * `h-full w-full` overrides IconButton `size="md"` box so the wash meets the
 * header hairlines. Page identity uses this wash inside a fixed
 * {@link HEADER_PAGE_FACE_WIDTH} chip, not a beam-filling flex child.
 *
 * **Ink is `text-text-default` (2026-08-16), not the previous mute tone.**
 * `HeaderPageSwitcher`'s `PAGE_FACE_CLASS` had already overridden this same
 * base to `text-text-default` so the page name (icon + label) matched the
 * rail's bold title treatment — which left every OTHER header icon
 * (sidebar toggle, Pins, Recents, WO, clipboard, inbox) visibly lighter than
 * the page face sitting right beside them in the same cluster. One base
 * token for the whole GlobalHeader icon row now, matching the spine
 * (`spine-section-accent.ts` — ink constant, no dimming) on the other side
 * of the toggle: header and sidebar read as one ink system, not two.
 */
/**
 * Page-identity face and its child menu — one compact width. Find lives on
 * the right rail ({@link CommandBar}), not beside this chip.
 */
export const HEADER_PAGE_FACE_WIDTH = 'w-[11rem]';

/**
 * Scan Stations (and any other long page menu) — cap height to the viewport
 * under the header. End clearance is scroll-padding, not layout padding:
 * `pb-8` painted an empty row under short menus (Ready to Pack · Packing ·
 * Scan out). `scroll-pb-8` still lets a tall list scroll the last row fully
 * into view.
 */
export const HEADER_PAGE_MENU_SCROLL_CLASS =
  'max-h-[calc(100dvh-theme(spacing.20))] overflow-y-auto overscroll-contain scroll-pb-8';

export const HEADER_ICON_BTN_CLASS =
  'h-full min-h-8 w-full rounded-none text-text-default hover:bg-surface-sunken';

/** Pressed / open fill for header icon toggles. */
export const HEADER_ICON_BTN_OPEN_CLASS = 'bg-surface-sunken';
