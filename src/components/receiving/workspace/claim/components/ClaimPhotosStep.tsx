import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimPhotoPicker } from './ClaimPhotoPicker';

/**
 * Step 1 — Photos. Acknowledge/select the evidence photos that will attach to
 * the ticket. Claim type lives on the Ticket step with the draft.
 * Flush column-edge shell — picker owns any row gutters.
 */
export function ClaimPhotosStep({ c }: { c: ReceivingClaimController }) {
  return <ClaimPhotoPicker photos={c.photos} receivingId={c.row.receiving_id} />;
}
