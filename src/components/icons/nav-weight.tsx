/**
 * Nav icon stroke weights — visual hierarchy for Kinetic Ledger chrome.
 *
 * **Page glyphs draw at 1.5** (2026-08-02, down from 2). These render at 14px
 * in the MasterNav spine and the header Recents rows, and at that size a
 * 2-weight stroke on a 24-unit viewBox is a heavy graphic sitting beside
 * 12–14px text — the loudest single reason a dense nav column reads as
 * clip-art. 1.5 is the weight Lucide, Linear and VS Code all draw nav chrome at.
 *
 * Mode glyphs keep the heavier 2.25 — they no longer appear in the spine (child
 * rows there render no icon at all), but they still carry L2 switches in the
 * GlobalHeader Mode switcher and `HorizontalButtonSlider`, where a glyph is the
 * whole control rather than a label's companion. Keep mode ≤ 2.25: heavier CSS
 * overrides (e.g. 2.75) muddy dense glyphs at h-4.
 *
 * GlobalHeader *chrome* icon actions are a separate contract and are NOT this —
 * they use native SVG stroke via `TOP_CHROME_ICON_GLYPH` (`header-shell.ts`).
 */

import { cn } from '@/utils/_cn';

type NavIconProps = { className?: string };
type NavIconComponent = (props: NavIconProps) => JSX.Element;

/** L1 destination glyphs (MasterNav spine rows, header Recents rows). */
export const NAV_ICON_PAGE_STROKE_CLASS =
  '![stroke-width:1.5] [&_path]:![stroke-width:1.5] [&_circle]:![stroke-width:1.5] [&_rect]:![stroke-width:1.5] [&_line]:![stroke-width:1.5] [&_polyline]:![stroke-width:1.5]';

/**
 * L2 mode glyphs (rails, dropdown modes, hover modes, header “now”).
 * 2.25 — previous crisp weight before the 2.75 bump that blurred mode icons.
 */
export const NAV_ICON_MODE_STROKE_CLASS =
  '![stroke-width:2.25] [&_path]:![stroke-width:2.25] [&_circle]:![stroke-width:2.25] [&_rect]:![stroke-width:2.25] [&_line]:![stroke-width:2.25] [&_polyline]:![stroke-width:2.25]';

export function navIconStrokeClass(layer: 'page' | 'mode', className?: string): string {
  return cn(layer === 'page' ? NAV_ICON_PAGE_STROKE_CLASS : NAV_ICON_MODE_STROKE_CLASS, className);
}

export function withNavIconPageStroke(Icon: NavIconComponent): NavIconComponent {
  return function NavIconPage({ className }) {
    return <Icon className={navIconStrokeClass('page', className)} />;
  };
}

export function withNavIconModeStroke(Icon: NavIconComponent): NavIconComponent {
  return function NavIconMode({ className }) {
    return <Icon className={navIconStrokeClass('mode', className)} />;
  };
}
