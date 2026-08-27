import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimFiledBanner } from './ClaimFiledBanner';
import { ClaimSellerMessagePanel } from './ClaimSellerMessagePanel';
import { ClaimTicketReply } from './ClaimTicketReply';

/**
 * Seller message — filed/linked ticket banner, AI-drafted seller message, and
 * in-Zendesk reply. Copy + Finish live in the sticky footer.
 * No outer px-3 — sunken compose bands go column-edge; rows own gutters.
 */
export function ClaimSellerStep({ c }: { c: ReceivingClaimController }) {
  return (
    <div className="divide-y divide-border-hairline [&>section]:py-3 [&>section:first-child]:pt-0">
      {c.filedTicket ? (
        <div className="px-3">
          <ClaimFiledBanner
            filedTicket={c.filedTicket}
            mode={c.mode}
            linkCommitted={c.linkCommitStatus === 'committed'}
            unlinking={c.unlinking}
            onUnlink={c.handleBannerUnlink}
          />
        </div>
      ) : null}

      <ClaimSellerMessagePanel seller={c.seller} filedTicket={c.filedTicket} />

      <div className="px-3">
        <ClaimTicketReply reply={c.reply} filedTicket={c.filedTicket} prefill={c.seller.sellerMessage} />
      </div>
    </div>
  );
}
