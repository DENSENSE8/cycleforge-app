import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimTicketPicker } from './ClaimTicketPicker';

/**
 * Link step 1 — Find. Search and select an existing Zendesk ticket to attach to
 * this carton/line. Selecting highlights the row and arms the footer "Link
 * ticket" action; committing advances to Photos, then Ticket → Review, where
 * the operator attaches evidence and posts an update comment to that ticket.
 */
export function ClaimLinkFindStep({ c }: { c: ReceivingClaimController }) {
  return (
    <>
      <ClaimTicketPicker search={c.search} onSelect={c.selectLinkTicket} />

      <p className="text-role-caption font-semibold leading-5 text-text-soft">
        Pick the existing ticket this carton belongs to, then link it. You&apos;ll pick photos and
        post an update to that ticket next.
      </p>
    </>
  );
}
