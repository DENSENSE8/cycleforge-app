'use client';

/**
 * Local Pickup workbench-chrome CTA — New Local Pickup (solid primary).
 * Twin of {@link RepairChromeActions}; create orchestration stays in the
 * workspace (shared {@link createLocalPickupOrder} API helper).
 */

import { ReceivingModePickup } from '@/components/icons/stations';
import { Button } from '@/design-system/primitives';
import { WORKBENCH_CHROME_PILL_CLASS, WorkbenchChromeActionRow } from '@/components/dashboard/workbench-shell';
import { cn } from '@/utils/_cn';

export function PickupChromeActions({
  onNew,
  disabled = false,
  busy = false,
}: {
  onNew: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <WorkbenchChromeActionRow>
    <Button
      size="sm"
      variant="primary"
      onClick={onNew}
      disabled={disabled || busy}
      ariaLabel="New local pickup"
      icon={<ReceivingModePickup />}
      className={cn(
        WORKBENCH_CHROME_PILL_CLASS,
        'h-full font-semibold uppercase tracking-widest',
      )}
    >
      {busy ? 'Creating…' : 'New Pickup'}
    </Button>
    </WorkbenchChromeActionRow>
  );
}
