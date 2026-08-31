import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { StationAmbientWash } from './StationAmbientWash';

/**
 * Station panel root — **SoT for the Unbox-family outer shell**: the
 * `relative flex h-full min-h-0 flex-col` column that every station right-pane
 * (Unbox / Triage / Testing / Pack / Review / `/search`) composes instead of
 * hand-rolling the recipe.
 *
 * ## The plane is FLAT WHITE — no grey anywhere (operator ruling, 2026-08-30)
 *
 * `bg-surface-card`, edge to edge, and separation inside it is **padding plus a
 * hairline** — never a tone change.
 *
 * This shell went three ways in one day and the ruling is the last one, so the
 * reasoning is worth keeping: it started `bg-surface-sunken` under a gradient
 * while every child painted `bg-transparent`, which meant the grey was not a
 * ground plane at all — it was a tint leaking through wherever content ran out.
 * It was then tried as a proper sunken WELL (canvas ground, white band cards,
 * an 8px gutter as the separator), which is the textbook pattern and did read
 * as depth. The operator's call, looking at it on the floor: no grey. A station
 * is one continuous work surface, and a gutter that shows ground is one more
 * thing on screen that is not the job.
 *
 * So bands separate the flat way — a flush header bar, `px-3` on the names,
 * and a `border-subtle` seam. `border-subtle` (`#e2e8f0`), never `border-hairline`
 * (`#f1f5f9`): the hairline token is the same hex as `surface-sunken`, a line
 * the colour of a fill, and it disappears at bench distance.
 *
 * `surface="well"` survives for a surface that genuinely wants a recessed
 * ground. Nothing uses it. Read the paragraph above before you do.
 *
 * Overlays (photo peek, modals) compose as children (or around the root), not
 * inside `StationWorkbench`.
 */
export function StationPanelRoot({
  children,
  /**
   * Ambient gradient over the well. OFF by default — the plane is one exact
   * token, and a gradient across it is a second, drifting one.
   */
  wash = false,
  /**
   * Opt into scan-station **floor** density (`globals.css` →
   * `[data-density='floor']`): type holds at ~3ft, control hit-boxes lift to the
   * 44px tap floor. Opt-in per surface rather than baked in, because this root is
   * shared by six panels across Tiers A–C and they should port deliberately.
   *
   * The left context rail is a SIBLING of this root, so it stays `ops` — do not
   * hoist the stamp to an ancestor that contains it (custom properties inherit).
   */
  density,
  /**
   * The column plane.
   *
   * - `card` (default) — flat white, edge to edge. Every station.
   * - `well` — a recessed ground (`--ds-color-background-canvas`) for white
   *   cards to float on. No callers; see the docblock before adding one.
   *
   * `card` also forces the wash off — a gradient on a flat white plane is
   * exactly the off-white cast it is supposed to remove.
   */
  surface = 'card',
  className,
}: {
  children: ReactNode;
  wash?: boolean;
  density?: 'floor';
  surface?: 'well' | 'card';
  className?: string;
}) {
  const flat = surface === 'card';
  return (
    <div
      data-density={density}
      data-station-surface={surface}
      className={cn(
        'relative flex h-full min-h-0 flex-col',
        flat ? 'bg-surface-card' : 'bg-surface-canvas',
        className,
      )}
    >
      {wash && !flat ? <StationAmbientWash /> : null}
      {children}
    </div>
  );
}
