'use client';

/**
 * Claim — a received carton with an OPEN carrier / supplier claim. Each open
 * ticket settles on its own (`POST /api/receiving/[id]/claims/resolve`
 * `{ ticket }` clears every open claim reason that ticket recorded). One
 * ticket → the dock's `Resolve claim`; several → a verb on each ticket row,
 * and the record closes when the last one settles.
 */

import { useState } from 'react';
import { Check } from '@/components/Icons';
import { DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { DetailDock } from '@/design-system/components/DetailDock';
import { Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { useResolveClaimException } from '@/hooks/exceptions';
import type { CartonExceptionFacts } from '@/lib/exceptions/facts';
import { toast } from '@/lib/toast';
import { CartonFacts } from './CartonFacts';
import type { PhoneResolverProps } from './resolver-props';

export function ClaimResolver({ facts, onResolved }: PhoneResolverProps<CartonExceptionFacts>) {
  const { has } = useAuth();
  const resolve = useResolveClaimException();
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set());
  const canResolve = has('receiving.mark_received');
  const open = facts.claims.filter((claim) => !settled.has(claim.ticket));
  const single = open.length === 1;
  const pendingTicket = resolve.isPending ? resolve.variables?.ticket : undefined;

  const settle = (ticket: string) =>
    resolve
      .mutateAsync({ receivingId: facts.carton.receivingId, ticket })
      .then(() => {
        const left = open.filter((claim) => claim.ticket !== ticket).length;
        if (left === 0) {
          onResolved(facts.claims.length > 1 ? 'All claims resolved.' : `Claim ${ticket} resolved.`);
          return;
        }
        setSettled((prev) => new Set(prev).add(ticket));
        toast.success(`Claim ${ticket} resolved — ${left} still open.`);
      })
      .catch((error: Error) => toast.error(error.message || 'Could not resolve the claim.'));

  return (
    <>
      <CartonFacts carton={facts.carton} />
      <section aria-labelledby="claim-open-heading" className="bg-mode-panel">
        <DetailSectionHeading id="claim-open-heading">
          {open.length === 1 ? 'Open claim' : `Open claims · ${open.length}`}
        </DetailSectionHeading>
        {open.length === 0 ? (
          <p className="px-mode-page py-3 text-role-caption text-mode-muted">No open claim on this carton.</p>
        ) : (
          <ul className="divide-y divide-mode-rule">
            {open.map((claim) => (
              <li key={claim.ticket} className="flex min-h-mode-hit-cta items-center gap-3 px-mode-page py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-mode-body font-semibold text-mode-ink">{claim.label}</span>
                  <span className="block font-mono text-role-caption text-mode-muted">Ticket {claim.ticket}</span>
                </span>
                {single ? null : (
                  <Button
                    variant="secondary"
                    radius="mode"
                    size="md"
                    icon={<Check />}
                    loading={pendingTicket === claim.ticket}
                    disabled={!canResolve || resolve.isPending}
                    onClick={() => void settle(claim.ticket)}
                  >
                    Resolve
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {!canResolve && open.length > 0 ? (
        <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-text-muted">
          Resolving a claim needs receiving access (Mark received).
        </p>
      ) : null}
      {single ? (
        <DetailDock
          label="Claim exception actions"
          verbs={[
            {
              id: 'resolve',
              label: 'Resolve claim',
              icon: <Check />,
              primary: true,
              disabled: !canResolve,
              loading: resolve.isPending,
            },
          ]}
          onVerb={() => settle(open[0].ticket)}
        />
      ) : null}
    </>
  );
}
