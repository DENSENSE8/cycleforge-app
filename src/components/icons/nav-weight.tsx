/**
 * Nav icon stroke — **ONE token, and the surface owns it.**
 *
 * ## Why there is only one
 *
 * The weight used to live in three places at once: a `page` tier (1.5), a
 * `mode` tier (2.25), and — the expensive part — *inside the glyph components
 * themselves*, via `withNavIconPageStroke` / `withNavIconModeStroke` wrappers
 * that baked a weight into ~23 exports in `icons/stations.tsx` and
 * `lib/photos/scope-icons.ts`.
 *
 * A glyph that carries its own weight cannot be reused at another altitude, and
 * it does not lose quietly — it wins. Both wrapper and surface emit the same
 * shape of rule (`.a path` vs `.b path`), so they tie on specificity and the
 * winner is decided by Tailwind's emission order (`1.5` before `2.25`). The
 * GlobalHeader's Unbox face read heavier than the Panel · Pin · History glyphs
 * beside it for exactly that reason, and it survived three separate fixes: the
 * dropdown rows had no class at all, then `Button`'s `icon` prop overrode the
 * size box, then the glyph's own baked 2.25 outranked the beam. Three passes,
 * three layers, one root cause — weight had more than one home.
 *
 * So: glyphs ship BARE, this is the only stroke token, and a surface that draws
 * nav chrome applies it. Nothing to lose a specificity race against.
 *
 * ## The single weight is 1.5
 *
 * The `mode` tier is gone with the wrappers. It existed for surfaces where a
 * glyph is the whole control rather than a label's companion (`TabSwitch` /
 * `HorizontalButtonSlider`, the header "now" identity) — but those glyphs draw
 * at 14–18px beside 12–14px text just like every other one, and a second weight
 * bought a distinction nobody could name while costing the drift above. If a
 * heavier control glyph is ever wanted again, it is a NEW token with a stated
 * job — never a wrapper baked back into an icon.
 *
 * ## Applying it
 *
 * The selectors cover the glyph itself AND a wrapper one or two levels up
 * (`Button`'s icon box, a chrome-menu row cell), because a Lucide-shaped glyph
 * carries its weight as a `stroke-width` ATTRIBUTE on its own `<svg>` that its
 * shapes inherit — so a wrapper needs to reach the `<svg>`, not just `path`.
 */

import { cn } from '@/utils/_cn';

/** The one nav-glyph stroke. Compose it; never re-type a `stroke-width` literal. */
export const NAV_ICON_STROKE_CLASS =
  '![stroke-width:1.5] [&_svg]:![stroke-width:1.5] [&_path]:![stroke-width:1.5] [&_circle]:![stroke-width:1.5] [&_rect]:![stroke-width:1.5] [&_line]:![stroke-width:1.5] [&_polyline]:![stroke-width:1.5] [&_polygon]:![stroke-width:1.5] [&_ellipse]:![stroke-width:1.5]';

/** {@link NAV_ICON_STROKE_CLASS} plus the caller's own classes. */
export function navIconStrokeClass(className?: string): string {
  return cn(NAV_ICON_STROKE_CLASS, className);
}
