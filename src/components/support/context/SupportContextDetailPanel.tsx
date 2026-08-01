'use client';

import { X } from '@/components/Icons';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { SupportContextHub } from '@/components/support/context';
import { IconButton } from '@/design-system/primitives';
import type { SupportContextAnchor } from '@/hooks/useSupportContext';

export interface SupportContextDetailPanelProps {
  ticketId: number;
  anchor: SupportContextAnchor;
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
}

/**
 * Ticket linkage / team / activity in the global detail-stack shell
 * ({@link DetailStackRailRegistrar} → floating inset card with 12px viewport gap).
 *
 * NON-MODAL (`modal={false}`): reference context read BESIDE the ticket thread —
 * a scrim would hide the very conversation the linkage is about. Close is the
 * header X or Escape on RightRailHost (there is no backdrop to click off).
 */
export function SupportContextDetailPanel({
  ticketId,
  anchor,
  open,
  onClose,
  embedded = false,
}: SupportContextDetailPanelProps) {
  return (
    <DetailStackRailRegistrar
      id={`detail:support-context:${ticketId}`}
      onClose={onClose}
      enabled={open}
      modal={false}
      ariaLabel={`Ticket #${ticketId} support context`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-hairline px-4 py-3">
          <div>
            <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">
              Ticket #{ticketId}
            </p>
            <h2 className="text-role-body font-semibold tracking-tight text-text-default">
              Support context
            </h2>
          </div>
          <IconButton
            size="md"
            icon={<X className="h-4 w-4" />}
            ariaLabel="Close support context"
            onClick={onClose}
            className="-my-1 rounded-lg text-text-muted hover:bg-surface-sunken"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <SupportContextHub
            anchor={anchor}
            variant={embedded ? 'station' : 'workbench'}
            defaultSegment="activity"
            hideCustomerSegment
            surface="flush"
            className="h-full"
          />
        </div>
      </div>
    </DetailStackRailRegistrar>
  );
}
