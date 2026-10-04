'use client';

/** The mobile SCAN control — one host-owned CTA, pinned top-right on every mobile page that shows {@link MobileTopBar}. */

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ScanBarcode } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';
import { MOBILE_BAR_CELL_CLASS } from './MobileV2ActionSlot';

/**
 * The scan surface's own route — the CTA's destination and its "here" test.
 * Module-local: nothing outside needs it, and a pass-through export nothing
 * imports is dead weight the knip gate counts.
 */
const MOBILE_SCAN_PATH = '/m/scan';

/**
 * The CTA itself.
 * top-right corner, no radius, no padding around it (operator 2026-09-24) —
 */
export function MobileV2ScanCta({
  fill = false,
  rounded = false,
  destination,
}: {
  /**
   * Stretch to the full height of a bar taller than the 44px cell (the 56px
   * `MobileDetailTopBar`), so the cell stays flush to its top and bottom edges.
   */
  fill?: boolean;
  /** V2 shell chrome uses a normal rounded control instead of a flush bar segment. */
  rounded?: boolean;
  /** Work-aware override owned by a record bar (QC, location placement, etc.). */
  destination?: string;
} = {}) {
  const router = useRouter();
  const pathname = usePathname();

  const onClick = useCallback(() => {
    const returnToAllocate = pathname === '/m/orders' || pathname === '/m/work';
    const defaultDestination = returnToAllocate
      ? `${MOBILE_SCAN_PATH}?returnTo=/m/orders`
      : pathname === '/m/stock'
        ? `${MOBILE_SCAN_PATH}?intent=location&returnTo=/m/stock`
        : MOBILE_SCAN_PATH;
    router.push(destination ?? defaultDestination);
  }, [destination, pathname, router]);

  return (
    <IconButton
      size="touch"
      onClick={onClick}
      // `ScanBarcode`, not `Barcode` (operator 2026-09-15). A bare barcode is
      // an identity mark, not an instruction to activate the camera.
      icon={<ScanBarcode className="h-5 w-5" />}
      ariaLabel="Go to scan"
      radius={rounded ? 'surface' : 'flush'}
      className={cn(
        MOBILE_BAR_CELL_CLASS,
        rounded
          ? 'm-1 border border-border-soft bg-surface-card text-text-default shadow-sm'
          : 'border-l text-text-default',
        fill && 'h-auto self-stretch',
      )}
    />
  );
}
