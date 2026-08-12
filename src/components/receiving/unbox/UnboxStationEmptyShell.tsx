'use client';

/**
 * Settled empty Unbox centre when the Unboxed rail has no cartons.
 * Scan bar (left rail) stays armed — no Browse-lists CTA (desk is Back to list /
 * resume only). Centre stays blank canvas so cold land never advertises tables.
 */

import { useEffect } from 'react';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { appSurfaceFillClass } from '@/design-system/components/AppSurfaceFill';
import { cn } from '@/utils/_cn';

export function UnboxStationEmptyShell({ className }: { className?: string }) {
  useEffect(() => {
    const t = setTimeout(() => {
      emitReceiving('receiving-focus-scan');
    }, 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className={cn(
        'flex h-full min-h-0 w-full flex-col',
        appSurfaceFillClass('canvas'),
        className,
      )}
      data-paint-surface="unbox:primary"
      data-testid="unbox-station-empty"
      aria-label="Unbox station"
    />
  );
}
