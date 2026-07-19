'use client';

/**
 * Unbox-family station chrome — recessed identity trough under GlobalHeader:
 *
 *   1. Identity — CartonContextCard density=bar (classify left · chips/actions)
 *   2. Utilities — refresh · more · info, right-aligned inside the same trough
 *
 * Trough is inset into the work canvas (not a second elevated card) so depth 1
 * stays on `appWorkCanvasClass`. Soft radius meshes with the header soft join.
 */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { STATION_WORKBENCH_COLUMN } from '@/components/station/workbench/workbench-layout';
import { appStationContextTroughClass } from '@/design-system/tokens/app-surface';

export function ReceivingStationContextBar({
  identity,
  utilities,
  className,
}: {
  /** CartonContextCard density=bar. */
  identity: ReactNode;
  /** LineEditToolbar flat cluster. */
  utilities: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('relative z-10 shrink-0 overflow-visible px-3 pt-1.5 pb-1 sm:px-4', className)}
      data-testid="receiving-station-context-bar"
    >
      <div
        className={cn(
          STATION_WORKBENCH_COLUMN,
          appStationContextTroughClass,
          'flex min-h-10 min-w-0 items-center gap-2 overflow-visible px-2 sm:px-3',
        )}
      >
        <div
          className="flex min-h-10 min-w-0 flex-1 items-center overflow-visible"
          data-testid="receiving-station-identity"
        >
          {identity}
        </div>
        <div
          className="flex shrink-0 items-center"
          data-testid="receiving-station-utilities"
        >
          {utilities}
        </div>
      </div>
    </div>
  );
}
