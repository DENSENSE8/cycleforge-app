'use client';

/** Manual “Sync to NAS” control for a filed claim ticket. */

import { Archive } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives';
import { useTicketNasArchive } from '@/hooks/useTicketNasArchive';
import { cn } from '@/utils/_cn';

export function TicketNasBackupButton({
  ticketNumber,
  receivingId = null,
  lineId = null,
  size = 'sm',
  variant = 'secondary',
  className,
  label = 'Sync to NAS',
  tooltip = 'Sync this ticket’s photos to the NAS claim folder',
  disabled = false,
}: {
  ticketNumber: string;
  receivingId?: number | null;
  lineId?: number | null;
  size?: 'sm' | 'md';
  variant?: 'secondary' | 'ghost';
  className?: string;
  /** Button face copy. */
  label?: string;
  tooltip?: string;
  disabled?: boolean;
}) {
  const archive = useTicketNasArchive();
  const ticket = ticketNumber.trim();
  const canRun = Boolean(ticket) && !disabled && !archive.isPending;

  return (
    <HoverTooltip label={tooltip} asChild>
      <Button
        type="button"
        variant={variant}
        size={size}
        icon={<Archive className="h-3.5 w-3.5" />}
        loading={archive.isPending}
        disabled={!canRun}
        onClick={() =>
          archive.mutate({
            ticketNumber: ticket,
            receivingId,
            lineId,
          })
        }
        aria-label={tooltip}
        className={cn(
          'shrink-0 border border-blue-200 bg-surface-card text-blue-700 ring-0 hover:bg-blue-50',
          className,
        )}
      >
        {archive.isPending ? 'Syncing…' : label}
      </Button>
    </HoverTooltip>
  );
}
