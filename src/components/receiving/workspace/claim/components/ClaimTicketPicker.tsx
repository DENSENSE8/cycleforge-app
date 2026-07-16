import { TicketPicker } from '@/components/support/link/TicketPicker';
import type { LinkCandidate } from '../claim-types';
import type { UseClaimTicketSearch } from '../hooks/useClaimTicketSearch';

interface Props {
  search: UseClaimTicketSearch;
  onSelect: (t: LinkCandidate | null) => void;
}

/**
 * Receiving claim-flow adapter over the shared {@link TicketPicker}.
 *
 * The markup used to live here; it now lives in `@/components/support/link` so
 * the shipment-link surface composes the SAME picker rather than forking a third
 * copy (a second, incompatible `ClaimTicketPicker` already exists under
 * support/zendesk/claim — see that file). This wrapper survives only to keep the
 * claim flow's local `LinkCandidate` / `UseClaimTicketSearch` names at the call
 * sites; both are structurally identical to the shared types.
 */
export function ClaimTicketPicker({ search, onSelect }: Props) {
  return (
    <TicketPicker search={search} onSelect={onSelect} inputId="claim-ticket-search" mode="anchor" />
  );
}
