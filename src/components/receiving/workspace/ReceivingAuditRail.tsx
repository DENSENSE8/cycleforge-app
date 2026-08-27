'use client';

import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { ReceivingAuditPanel } from './ReceivingAuditPanel';

/**
 * Carton audit log for non-Unbox hosts (Testing, Triage, carton read) — a
 * NON-MODAL `RightRailHost` occupant (`detail:receiving-audit`).
 *
 * Was a centered `RightPaneOverlay`, which parked a read-only history in the
 * middle of the screen and dimmed the carton it describes. Reading an audit
 * trail is a look-beside job, so it takes the same right-edge float as every
 * other queue / station inspector. Unbox keeps its station-scoped **push**
 * (Unbox Displays Timeline) — that column squeezes the workbench in-flow
 * and stays mutually exclusive with Displays / Ticket / Claim.
 *
 * Close is the panel's own header X or Escape on the host.
 */
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
      // Station edge: /unbox, /triage and /testing already push this edge with
      // `StationDisplaysPushColumn`, and two push mechanisms on one edge is exactly what
      // the right-rail store exists to prevent. Stays a float pending the
      // right-edge ownership ruling.
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
