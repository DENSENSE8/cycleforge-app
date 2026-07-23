/**
 * Nav icon stroke weights — visual hierarchy for Kinetic Ledger chrome.
 *
 * MasterNav L1 page rows render SoT page icons at the lighter page stroke.
 * Mode glyphs use a slightly heavier stroke so L2 switches still read — keep
 * mode ≤ 2.25. Heavier CSS overrides (e.g. 2.75) muddy dense glyphs at h-4.
 */

import { cn } from '@/utils/_cn';

type NavIconProps = { className?: string };
type NavIconComponent = (props: NavIconProps) => JSX.Element;

/**
 * L1 page glyphs (MasterNav dropdown rows). Matches GlobalHeader / native SVG
 * strokeWidth={2}.
 */
export const NAV_ICON_PAGE_STROKE_CLASS =
  '![stroke-width:2] [&_path]:![stroke-width:2] [&_circle]:![stroke-width:2] [&_rect]:![stroke-width:2] [&_line]:![stroke-width:2] [&_polyline]:![stroke-width:2]';

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
