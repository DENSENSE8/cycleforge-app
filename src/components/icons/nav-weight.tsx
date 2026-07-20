/**
 * Nav icon stroke weights — visual hierarchy for Kinetic Ledger chrome.
 *
 * Law: **modes own icons; pages are text.** Mode glyphs use the heavier
 * stroke so L2 switches read at a glance. Page-layer stroke exists only for
 * rare non-chrome callers (data still carries `page.icon`); master-nav L1
 * rows and page lists do not render page icons.
 */

import { cn } from '@/utils/_cn';

type NavIconProps = { className?: string };
type NavIconComponent = (props: NavIconProps) => JSX.Element;

/**
 * Reserved for non-chrome / fallback page glyphs (not rendered in MasterNav L1).
 * Lighter than mode so a stray page icon never outranks a mode mark.
 */
export const NAV_ICON_PAGE_STROKE_CLASS =
  '![stroke-width:1.5] [&_path]:![stroke-width:1.5] [&_circle]:![stroke-width:1.5] [&_rect]:![stroke-width:1.5] [&_line]:![stroke-width:1.5] [&_polyline]:![stroke-width:1.5]';

/** L2 mode glyphs (rails, dropdown modes, hover modes, MRU jump chips, header now). */
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
