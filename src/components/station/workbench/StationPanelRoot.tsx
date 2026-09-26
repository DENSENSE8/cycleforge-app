import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { StationAmbientWash } from './StationAmbientWash';

/**
 * Station panel root — **SoT for the Unbox-family outer shell**:
 * ## The plane is FLAT WHITE — no grey anywhere (operator ruling, 2026-08-30)
 */
export function StationPanelRoot({
  children,
  /**
   * Ambient gradient over the well. OFF by default — the plane is one exact
   * token, and a gradient across it is a second, drifting one.
   */
  wash = false,
  /** Opt into scan-station **floor** density (`globals.css` → `[data-density='floor']`): */
  density,
  /** The column plane. */
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
