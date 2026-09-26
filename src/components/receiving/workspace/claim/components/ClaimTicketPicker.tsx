import { TicketPicker } from '@/components/support/link/TicketPicker';
import type { LinkCandidate } from '../claim-types';
import type { UseClaimTicketSearch } from '../hooks/useClaimTicketSearch';

interface Props {
  search: UseClaimTicketSearch;
  onSelect: (t: LinkCandidate | null) => void;
}

/** Receiving claim-flow adapter over the shared {@link TicketPicker}. */
export function ClaimTicketPicker({ search, onSelect }: Props) {
  return (
    <TicketPicker search={search} onSelect={onSelect} inputId="claim-ticket-search" mode="anchor" />
  );
}
