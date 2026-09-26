'use client';

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { ReceivingAuditPanel } from './ReceivingAuditPanel';

/** Carton audit log for non-Unbox hosts (Testing, Triage, carton read) — a NON-MODAL `RightRailHost` occupant (`detail:receiving-audit`). */
export function ReceivingAuditRail({
  open,
  onClose,
  receivingId,
}: {
  open: boolean;
  onClose: () => void;
  receivingId: number;
}) {
  if (!open) return null;

  return (
    <DetailStackRailRegistrar
      id="detail:receiving-audit"
      // Station edge:
      push={false}
      onClose={onClose}
      modal={false}
      ariaLabel="Carton audit log"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <ReceivingAuditPanel open onClose={onClose} receivingId={receivingId} />
      </div>
    </DetailStackRailRegistrar>
  );
}
