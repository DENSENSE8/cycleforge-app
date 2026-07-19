import {
  appChromeBandHairlineClass,
  appChromeClass,
  appChromeMutedClass,
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
 * 6px (px-1.5) is the house sidebar gutter. Recent-activity rail rows, mode
 * pills, and section eyebrows inset to this line. The **scan band** is the
 * exception: it is full-bleed (`receivingScanBandClass` / {@link ScanBandShell})
 * so the staff bottom-rule runs edge-to-edge; content inset lives inside the
 * scan input (icon + mode rail pads), not on the band.
 */
export const SIDEBAR_GUTTER = 'px-1.5';

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
 * Desktop app content host — soft top-left cutout where master sidebar × global
 * header meet the work column. Chrome ({@link appChromeClass}) shows through the
 * curve; **no border** here — station work canvases own the hairlined elevated
 * plane via `appWorkCanvasClass` (app-surface SoT). Pair with GlobalHeader (no
 * `border-b`). Chromeless / mobile routes skip it.
 */
export const appContentShellClass =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-2xl';

/**
 * Shared hit-box for GlobalHeader icon actions (sidebar, goal ring, WO, right rail).
 * Pair with IconButton `size="md"` (h-8) — wrappers stay `flex h-8 items-center`
 * so absolute badges don't shift the flex baseline.
 */
export const HEADER_ICON_WRAP = 'relative flex h-8 w-8 shrink-0 items-center justify-center';
