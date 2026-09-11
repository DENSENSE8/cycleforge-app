'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { SearchDossierFrame } from '@/components/search/dossier/SearchDossierFrame';
import {
  searchReceivingLinkedOrderQuery,
  searchReceivingQuery,
} from '@/lib/search/search-receiving-resolve-query';
import {
  clearGlobalSearchPending,
  setGlobalSearchPending,
} from '@/lib/global-search-pending';
import { presentFindDossier } from '@/lib/search/find-dossier-model';
import { presentCartonFindEvents } from '@/lib/search/find-events-from-sources';
import {
  cartonDossierFindings,
  cartonDossierLines,
  presentFact,
} from '@/lib/search/search-dossier-model';
import { cartonHeaderIdentity } from '@/components/receiving/inspector/carton-inspector-model';

export function SearchReceivingDossier({
  receivingId,
  onBack,
}: {
  receivingId: number;
  onBack?: () => void;
}) {
  const receivingQuery = useQuery(searchReceivingQuery(receivingId));
  const payload = receivingQuery.data;
  const receiving = payload?.receiving;
  const lines = payload?.lines ?? [];
  const totals = payload?.totals ?? null;

  const linkedOrderQuery = useQuery(searchReceivingLinkedOrderQuery(receivingId, payload));
  const linkedOrder = linkedOrderQuery.data?.status === 'ok' ? linkedOrderQuery.data.order : null;

  const resolveStatus =
    (receivingQuery.isPending || receivingQuery.isLoading) && !payload
      ? 'loading'
      : receivingQuery.isError || !receiving
        ? 'notfound'
        : (linkedOrderQuery.isPending || linkedOrderQuery.isLoading) &&
            linkedOrderQuery.data === undefined
          ? 'loading'
          : 'ok';

  const primaryPaint = useSearchPrimaryPaintOptional();
  useEffect(() => {
    if (resolveStatus === 'loading') return;
    primaryPaint?.onPrimaryPainted();
  }, [resolveStatus, primaryPaint]);

  useEffect(() => {
    const pending = resolveStatus === 'loading';
    setGlobalSearchPending(pending);
    return () => {
      clearGlobalSearchPending();
    };
  }, [resolveStatus]);

  if (resolveStatus === 'loading') {
    return <div className="min-h-0 flex-1" aria-busy />;
  }

  if (resolveStatus === 'notfound' || !receiving) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-card">
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Carton not found"
          description="No receiving carton matched this selection."
        />
      </div>
    );
  }

  const header = cartonHeaderIdentity(receiving, lines);
  const findings = cartonDossierFindings(receiving, totals, lines);
  const unmatched = findings.some((f) => f.key === 'unfound');
  const po = presentFact(header.poNumber) || presentFact(receiving.zoho_purchaseorder_number);
  const tracking = presentFact(header.tracking) || presentFact(receiving.tracking);
  const title =
    presentFact(header.productTitle) ||
    po ||
    tracking ||
    `Carton ${receiving.id}`;
  const status =
    presentFact(receiving.pairing_state) ||
    presentFact(receiving.qa_status) ||
    'open';
  const linkedOrderId = presentFact(linkedOrder?.order_id);
  const facts = [
    { id: 'status', label: 'Status', value: status },
    ...(po ? [{ id: 'po', label: 'PO', value: po }] : []),
    ...(linkedOrderId ? [{ id: 'order', label: 'Order', value: linkedOrderId }] : []),
    ...(tracking ? [{ id: 'tracking', label: 'Tracking', value: tracking }] : []),
  ];
  const handoffs = [
    {
      href: '/unbox',
      label: 'Open Unbox',
      primary: findings.length > 0,
    },
  ];
  const dossier = presentFindDossier({
    entityType: 'receiving',
    id: receiving.id,
    title,
    status,
    facts,
    findings,
    handoffs,
    events: presentCartonFindEvents({
      events: payload?.events ?? [],
      totals,
      createdAt: receiving.created_at,
      tracking,
      linkedOrderId,
    }),
  });

  return (
    <SearchDossierFrame
      entity="Carton"
      title={title}
      onBack={onBack}
      outline={dossier.outline}
      findings={findings}
      facts={facts}
      events={dossier.events}
      lines={cartonDossierLines(lines, unmatched)}
      emptyLines="No chronology on this carton yet."
      handoffs={handoffs}
    />
  );
}
