import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimFiledBanner } from './ClaimFiledBanner';
import { ClaimNasBackupCard } from './ClaimNasBackupCard';

/**
 * Link step 5 — Linked. Mirrors the create "Filed" confirmation: the ticket
 * banner plus the shared local-backup card. Reached after Review posts the
 * comment (+ attached photos) to the linked ticket, which also auto-triggers
 * the local backup (`submitLinkUpdate` → `archiveToNas`) — this card shows
 * that result, with a manual retry if it was partial. The footer carries
 * "Continue to seller" (or "Done" when the claim type is 'return').
 */
export function ClaimLinkedStep({ c }: { c: ReceivingClaimController }) {
  return (
    <div className="divide-y divide-border-hairline [&>section]:py-3 [&>section:first-child]:pt-0">
      {c.filedTicket ? (
        <ClaimFiledBanner
          filedTicket={c.filedTicket}
          mode={c.mode}
          linkCommitted={c.linkCommitted}
          unlinking={c.unlinking}
          onUnlink={c.handleBannerUnlink}
        />
      ) : null}

      <ClaimNasBackupCard c={c} canArchive />
    </div>
  );
}
