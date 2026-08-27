'use client';

/**
 * Support · Tickets workbench-chrome CTA — Add (green), twin of
 * {@link RepairChromeActions} / {@link OutboundOrderChromeActions} without Import.
 */

import { Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { WORKBENCH_CHROME_PILL_CLASS, WorkbenchChromeActionRow } from '@/components/dashboard/workbench-shell';
import { cn } from '@/utils/_cn';

export function SupportTicketChromeActions({
  onAdd,
  disabled = false,
}: {
  onAdd: () => void;
  disabled?: boolean;
}) {
  return (
    <WorkbenchChromeActionRow>
    <Button
      size="sm"
      variant="success"
      onClick={onAdd}
      disabled={disabled}
      ariaLabel="New ticket"
      icon={<Plus />}
      className={cn(WORKBENCH_CHROME_PILL_CLASS, 'h-full font-semibold uppercase tracking-widest')}
    >
      Add
    </Button>
    </WorkbenchChromeActionRow>
  );
}
