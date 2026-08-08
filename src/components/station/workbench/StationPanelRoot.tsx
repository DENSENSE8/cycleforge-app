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
  className,
}: {
  children: ReactNode;
  wash?: boolean;
  density?: 'floor';
  className?: string;
}) {
  return (
    <div
      data-density={density}
      className={cn(
        'relative flex h-full min-h-0 flex-col bg-surface-sunken',
        className,
      )}
    >
      {wash ? <StationAmbientWash /> : null}
      {children}
    </div>
  );
}
