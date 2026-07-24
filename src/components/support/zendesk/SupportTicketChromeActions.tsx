'use client';

/**
 * Support · Tickets workbench-chrome CTA — Add (green), twin of
 * {@link RepairChromeActions} / {@link OutboundOrderChromeActions} without Import.
 */

import { Plus } from '@/components/Icons';
import { Button } from '@/design-system/primitives';

export function SupportTicketChromeActions({
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
      ariaLabel="New ticket"
      icon={<Plus />}
      className="rounded-full font-bold uppercase tracking-widest bg-emerald-600 shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 active:bg-emerald-700"
    >
      Add
    </Button>
  );
}
