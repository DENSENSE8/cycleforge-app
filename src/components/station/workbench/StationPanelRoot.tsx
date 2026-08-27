import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { StationAmbientWash } from './StationAmbientWash';

/**
 * Station panel root — **SoT for the Unbox-family outer shell**: the
 * `relative flex h-full min-h-0 flex-col bg-surface-sunken` column (sunken
 * center plane on the shared canvas host) plus the
 * {@link StationAmbientWash} depth backdrop. Compose this instead of
 * hand-rolling that recipe on every station right-pane (Unbox / Triage /
 * Testing …).
 *
 * The panel root hosts the ambient wash so the gradient covers identity + body;
 * the child {@link StationWorkbench} then passes `ambientWash={false}` + a
 * transparent background. Overlays (photo peek, modals) compose as children
 * (or around the root), not inside `StationWorkbench`.
 *
 * Guard: `station-workbench-chrome.guard.test.ts` (Guard C ratchets hand-rolled
 * panel-root strings in station paths down to this SoT).
 */
export function StationPanelRoot({
  children,
  /** Set false for a panel that supplies its own backdrop (rare). */
  wash = true,
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
   * - `sunken` (default) — the scan-station recipe: a sunken centre reading as
   *   a recessed plane on the shared canvas, with the ambient wash over it.
   * - `card` — a flat white column (`--ds-color-surface-card`, `#ffffff` in the
   *   light theme). Read surfaces that are ALL work-surface and carry no rails
   *   of their own use this: on `/search` the three columns are meant to read as
   *   one continuous sheet, and a sunken centre between two white rails paints
   *   two seams that mean nothing there.
   *
   * Selecting `card` also drops the ambient wash — a gradient backdrop on a flat
   * white plane is exactly the off-white cast it is supposed to remove.
   */
  surface = 'sunken',
  className,
}: {
  children: ReactNode;
  wash?: boolean;
  density?: 'floor';
  surface?: 'sunken' | 'card';
  className?: string;
}) {
  const flat = surface === 'card';
  return (
    <div
      data-density={density}
      data-station-surface={surface}
      className={cn(
        'relative flex h-full min-h-0 flex-col',
        flat ? 'bg-surface-card' : 'bg-surface-sunken',
        className,
      )}
    >
      {wash && !flat ? <StationAmbientWash /> : null}
      {children}
    </div>
  );
}
