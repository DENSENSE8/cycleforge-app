'use client';

/**
 * Repair workbench-chrome CTAs — Add (green), twin of
 * {@link OutboundOrderChromeActions} / {@link IncomingChromeActions} without Import.
 */

import { Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { WORKBENCH_CHROME_PILL_CLASS } from '@/components/dashboard/workbench-shell';
import { cn } from '@/utils/_cn';

export function RepairChromeActions({
  onAdd,
  disabled = false,
}: {
  onAdd: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      size="sm"
      onClick={onAdd}
      disabled={disabled}
      ariaLabel="New repair order"
      icon={<Plus />}
      className={cn(
        WORKBENCH_CHROME_PILL_CLASS,
        'font-semibold uppercase tracking-widest bg-emerald-600 shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 active:bg-emerald-700',
      )}
    >
      Add
    </Button>
  );
}
