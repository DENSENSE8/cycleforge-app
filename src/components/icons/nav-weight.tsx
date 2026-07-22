/**
 * Nav icon stroke weights — visual hierarchy for Kinetic Ledger chrome.
 *
 * MasterNav L1 page rows render SoT page icons at the lighter page stroke.
 * Mode glyphs use the heavier stroke so L2 switches still read at a glance.
 */

import { cn } from '@/utils/_cn';

type NavIconProps = { className?: string };
type NavIconComponent = (props: NavIconProps) => JSX.Element;

/**
 * L1 page glyphs (MasterNav dropdown rows). Lighter than mode so page marks
 * never outrank L2 mode switches.
 */
export const NAV_ICON_PAGE_STROKE_CLASS =
  '![stroke-width:2] [&_path]:![stroke-width:2] [&_circle]:![stroke-width:2] [&_rect]:![stroke-width:2] [&_line]:![stroke-width:2] [&_polyline]:![stroke-width:2]';

/** L2 mode glyphs (rails, dropdown modes, hover modes, mode MRU chips, header now). */
export const NAV_ICON_MODE_STROKE_CLASS =
  '![stroke-width:2.75] [&_path]:![stroke-width:2.75] [&_circle]:![stroke-width:2.75] [&_rect]:![stroke-width:2.75] [&_line]:![stroke-width:2.75] [&_polyline]:![stroke-width:2.75]';

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
