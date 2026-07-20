import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import type { ClaimType } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimTemplateEditor } from './ClaimTemplateEditor';
import { ClaimRecipientsField } from './ClaimRecipientsField';

/**
 * Step 2 — Ticket. Pick the claim type, then edit the Zendesk subject and body
 * (seeded from the server template) and choose recipients — a private internal
 * note by default, or a public reply that CCs a vendor / teammate. Nothing is
 * filed here — Review (step 3) is where the operator commits.
 */
export function ClaimComposeStep({ c }: { c: ReceivingClaimController }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-role-micro uppercase tracking-[0.14em] text-text-soft">
          Claim type
        </p>
        <HorizontalButtonSlider
          items={c.claimTypeItems}
          value={c.claimType}
          onChange={(id) => c.setClaimType(id as ClaimType)}
          variant="nav"
          size="md"
          aria-label="Claim type"
        />
      </div>
      <ClaimTemplateEditor template={c.template} filedTicket={c.filedTicket} row={c.row} />
      <ClaimRecipientsField c={c} />
    </div>
  );
}
