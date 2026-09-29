import { appWorkCanvasClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/**
 * Empty station stage shown until the operator scans or chooses a recent item.
 * Queue data belongs in the contextual rail; Unbox is the only Scan Station
 * that keeps a central browse table.
 */
export function ScanStationIdleCanvas() {
  return (
    <div
      className={cn(appWorkCanvasClass, 'h-full w-full bg-surface-card')}
      data-testid="scan-station-idle-canvas"
      aria-hidden
    />
  );
}
