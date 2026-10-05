'use client';

/** Operations → Reconciliation Monitor. */

import { useQuery } from '@tanstack/react-query';
import {
  KpiStrip,
  MonitorListBlock,
  MonitorListRow,
  MonitorPageShell,
  SectionCard,
} from '@/design-system/components/monitor';
import { LedgerValue } from '@/design-system/components/LedgerValue';
import type {
  SmearCandidateRow,
} from '@/lib/orders/reconciliation-queries';

type ReconciliationResponse = {
  ok: boolean;
  smearCandidates: SmearCandidateRow[];
  generatedAt: string;
};

async function fetchReconciliation(): Promise<ReconciliationResponse> {
  const res = await fetch('/api/operations/reconciliation');
  if (!res.ok) throw new Error(`reconciliation ${res.status}`);
  return res.json();
}

export function OperationsReconciliationView() {
  const q = useQuery({
    queryKey: ['operations', 'reconciliation'],
    queryFn: fetchReconciliation,
    staleTime: 30_000,
  });

  const smear = q.data?.smearCandidates ?? [];
  return (
    <MonitorPageShell stagger contentClassName="mx-auto w-full max-w-[1400px] space-y-6 px-6 pt-6 pb-10">
      <div className="space-y-1">
        <h1 className="text-role-title font-semibold text-text-default">Reconciliation</h1>
        <p className="text-role-caption text-text-muted">
          Serial↔order binding risks — Monitor only, not a Station queue.
        </p>
      </div>

      <KpiStrip
        items={[
          {
            label: 'Smear candidates',
            value: q.isLoading ? '…' : String(smear.length),
            valueClassName: smear.length > 0 ? 'text-text-warning' : 'text-text-success',
          },
        ]}
      />

      <SectionCard stagger eyebrow="CF-03" title="Suspected shipment-grain smear">
        <p className="mb-3 text-role-caption text-text-muted">
          Multi-order cartons with unbound tech serials (order_id still null).
        </p>
        {q.isError ? (
          <p className="text-role-caption text-text-danger">Could not load smear candidates.</p>
        ) : smear.length === 0 && !q.isLoading ? (
          <p className="text-role-caption text-text-muted">No unbound multi-order carton serials.</p>
        ) : (
          <MonitorListBlock>
            {smear.map((row) => (
              <MonitorListRow
                key={row.orderRowId}
                title={row.orderId || `row #${row.orderRowId}`}
                meta={
                  <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                    <LedgerValue value={row.productTitle} truncate tier="meta" />
                    <span>
                      {row.siblingCount} sibling{row.siblingCount === 1 ? '' : 's'} ·{' '}
                      {row.unboundSerialCount} unbound serial
                      {row.unboundSerialCount === 1 ? '' : 's'}
                    </span>
                  </span>
                }
                trailing={<LedgerValue value={row.shipmentId} variant="number" tier="meta" />}
              />
            ))}
          </MonitorListBlock>
        )}
      </SectionCard>
    </MonitorPageShell>
  );
}
