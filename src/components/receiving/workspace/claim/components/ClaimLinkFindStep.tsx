import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimTicketPicker } from './ClaimTicketPicker';

/**
 * Link — Find. Search and select an existing Zendesk ticket. Link CTA lives in
 * the sticky footer. TicketPicker owns sheet-band gutters; helper copy is a
 * flush hairline row (no nested card).
 */
export function ClaimLinkFindStep({ c }: { c: ReceivingClaimController }) {
  return (
    <div className="space-y-0">
      <ClaimTicketPicker search={c.search} onSelect={c.selectLinkTicket} />

      <p className="border-t border-border-hairline px-3 py-3 text-role-caption font-medium leading-5 text-text-soft">
        Pick the existing ticket this carton belongs to, then link it. You&apos;ll pick photos and
        post an update to that ticket next.
      </p>
    </div>
  );
}
