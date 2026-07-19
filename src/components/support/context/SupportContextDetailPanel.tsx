'use client';

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { SupportContextHub } from '@/components/support/context';
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
 * Close via backdrop / Esc (RightRailHost) — no header X.
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
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-hairline px-4 py-3">
          <div>
            <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">
              Ticket #{ticketId}
            </p>
            <h2 className="text-role-body font-bold tracking-tight text-text-default">
              Support context
            </h2>
          </div>
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
