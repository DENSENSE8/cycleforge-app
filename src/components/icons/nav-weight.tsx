/**
 * Nav icon stroke weights — visual hierarchy between L1 pages and L2 modes.
 *
 * Primitives default to strokeWidth 2. Master-nav page rows use heavier strokes;
 * mode rails / dropdown mode rows use lighter strokes so operators can read
 * station vs mode at a glance.
 */

import { cn } from '@/utils/_cn';

type NavIconProps = { className?: string };
type NavIconComponent = (props: NavIconProps) => JSX.Element;

/** L1 master-nav page row + STATIONS sidebar entries. */
export const NAV_ICON_PAGE_STROKE_CLASS =
  '![stroke-width:2.25] [&_path]:![stroke-width:2.25] [&_circle]:![stroke-width:2.25] [&_rect]:![stroke-width:2.25] [&_line]:![stroke-width:2.25] [&_polyline]:![stroke-width:2.25]';

/** L2 mode glyphs (header mode cluster, mode dropdown rows, MRU jump chips). */
export const NAV_ICON_MODE_STROKE_CLASS =
  '![stroke-width:1.5] [&_path]:![stroke-width:1.5] [&_circle]:![stroke-width:1.5] [&_rect]:![stroke-width:1.5] [&_line]:![stroke-width:1.5] [&_polyline]:![stroke-width:1.5]';

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
