import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimTicketPicker } from './ClaimTicketPicker';

/**
 * Link — Find. Search and select an existing Zendesk ticket. Link & send CTA
 * lives in the sticky footer (posts the shared template body). TicketPicker
 * owns sheet-band gutters; helper copy is a flush hairline row (no nested card).
 *
 * When the carton has tracking, {@link useReceivingClaimController} seeds the
 * picker so results open as "Suggested from tracking" without typing.
 * Photos · Subject · Claim type · Body · Recipients mount below this step.
 */
export function ClaimLinkFindStep({ c }: { c: ReceivingClaimController }) {
  return (
    <div className="space-y-0">
      <ClaimTicketPicker search={c.search} onSelect={c.selectLinkTicket} />

      <p className="border-t border-border-hairline px-3 py-3 text-role-caption font-medium leading-5 text-text-soft">
        Pick the existing ticket, then review the template body below and Link & send.
        Photos and claim type stay on this same surface.
      </p>
    </div>
  );
}
