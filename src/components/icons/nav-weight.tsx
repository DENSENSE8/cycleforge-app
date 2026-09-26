/** Nav icon stroke — **ONE token, and the surface owns it.** */

import { cn } from '@/utils/_cn';

/** The one nav-glyph stroke. Compose it; never re-type a `stroke-width` literal. */
export const NAV_ICON_STROKE_CLASS =
  '![stroke-width:1.5] [&_svg]:![stroke-width:1.5] [&_path]:![stroke-width:1.5] [&_circle]:![stroke-width:1.5] [&_rect]:![stroke-width:1.5] [&_line]:![stroke-width:1.5] [&_polyline]:![stroke-width:1.5] [&_polygon]:![stroke-width:1.5] [&_ellipse]:![stroke-width:1.5]';

/** {@link NAV_ICON_STROKE_CLASS} plus the caller's own classes. */
export function navIconStrokeClass(className?: string): string {
  return cn(NAV_ICON_STROKE_CLASS, className);
}
