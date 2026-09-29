'use client';

import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import { useResolveClaimException } from '@/hooks/exceptions';
import type { CartonExceptionFacts } from '@/lib/exceptions/facts';
import type { ExceptionRow } from '@/lib/exceptions/types';
import { cn } from '@/utils/_cn';
import { CartonFactsGroup } from './CartonFactsGroup';
import { resolveWith } from './resolve-feedback';

/**
 * Claim — a received carton with an open carrier / supplier claim. Each open
 * ticket is settled in place; settling a ticket closes every claim reason
 * filed under it, on the carton or any of its lines.
 */
export function ClaimResolver({ row, facts }: { row: ExceptionRow; facts: CartonExceptionFacts }) {
  const resolve = useResolveClaimException();
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-claim">
      <CartonFactsGroup carton={facts.carton} />
      <RecordGroup title="Open claims">
        {facts.claims.length === 0 ? (
          <EvidenceNotice>No open claim ticket on this carton.</EvidenceNotice>
        ) : (
          <ul className="flex flex-col gap-3 px-4 pb-4 pt-1">
            {facts.claims.map((claim) => (
              <li key={claim.ticket} className="flex items-center gap-3 border-b border-mode-fact py-2 last:border-b-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-role-data font-semibold text-mode-ink">{claim.label}</span>
                  <span className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>Ticket {claim.ticket}</span>
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  loading={resolve.isPending && resolve.variables?.ticket === claim.ticket}
                  disabled={resolve.isPending}
                  onClick={() =>
                    // Settling the carton's last open claim clears it; with more open, it stays for the next.
                    resolveWith(resolve, { receivingId: facts.carton.receivingId, ticket: claim.ticket, clears: facts.claims.length === 1 ? row.key : undefined }, `Claim ${claim.ticket} settled`)
                  }
                  data-testid="exception-resolve-claim"
                >
                  Settle claim
                </Button>
              </li>
            ))}
          </ul>
        )}
      </RecordGroup>
    </div>
  );
}
