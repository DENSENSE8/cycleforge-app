'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { RecordFlowFacts, RecordFlowSection, recordFlowLabels } from '@/design-system/components/RecordFlowFacts';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RECORD_ID_CLASS } from '@/design-system/tokens/industrial-record';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { SearchEntityRecord } from '@/components/search/dossier/SearchEntityRecord';
import {
  searchReceivingLinkedOrderQuery,
  searchReceivingQuery,
} from '@/lib/search/search-receiving-resolve-query';
import {
  clearGlobalSearchPending,
  setGlobalSearchPending,
} from '@/lib/global-search-pending';
import { presentCartonFindEvents } from '@/lib/search/find-events-from-sources';
import { useReceivingPhotos } from '@/hooks/useReceivingPhotos';
import {
  cartonDossierFindings,
  cartonDossierLines,
  presentFact,
  type SearchDossierFact,
  type SearchDossierLink,
} from '@/lib/search/search-dossier-model';
import { cartonHeaderIdentity } from '@/components/receiving/inspector/carton-inspector-model';
import { InboundEvidencePhotosButton } from '@/components/receiving/record/InboundEvidencePhotosButton';

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
  // The house carton-photo read, read-only (no poll, no realtime).
  const cartonPhotos = useReceivingPhotos(receivingId, { readOnly: true });
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
  const title = presentFact(header.productTitle) || po || tracking || `Carton ${receiving.id}`;
  const status =
    presentFact(receiving.pairing_state) ||
    presentFact(receiving.qa_status) ||
    'open';
  const linkedOrderNumber = presentFact(linkedOrder?.order_id);
  const carrier = presentFact(receiving.carrier);
  const platform = presentFact(receiving.source_platform) || presentFact(receiving.source);
  const vendor = lines.map((line) => presentFact(line.vendor_name)).find(Boolean) || null;
  const flowLabels = recordFlowLabels('inbound');
  const staging = presentFact(receiving.staging_location_label);
  const receivedBy = presentFact(receiving.received_by_name);

  const facts: SearchDossierFact[] = [
    ...(tracking ? [{ id: 'tracking', label: 'Tracking #', value: tracking, copy: true }] : []),
    ...(carrier ? [{ id: 'carrier', label: 'Carrier', value: carrier }] : []),
    ...(staging ? [{ id: 'staging', label: 'Staged at', value: staging }] : []),
    ...(receivedBy ? [{ id: 'received-by', label: 'Received by', value: receivedBy }] : []),
    ...(totals ? [{ id: 'qty', label: 'Received', value: `${totals.received} of ${totals.expected}` }] : []),
  ];

  // The other cartons on this PO come back through a PO query; the linked
  // order (a return or local pickup) opens its own record.
  const related: SearchDossierLink[] = [
    ...(linkedOrder && linkedOrderNumber
      ? [
          {
            id: `order:${linkedOrder.id}`,
            label: 'Order',
            value: linkedOrderNumber,
            target: { sel: { entityType: 'order' as const, id: Number(linkedOrder.id) } },
          },
        ]
      : []),
    ...(po ? [{ id: `po:${po}`, label: 'PO', value: po, target: { query: po } }] : []),
    // The outbound orders this PO was bought for (receiving_order_link).
    ...(payload?.order_links ?? [])
      .filter((o) => !(linkedOrder && Number(linkedOrder.id) === o.orderId))
      .map((o) => ({
        id: `for-order:${o.orderNumber}`,
        label: 'For order',
        value: o.channel ? `${o.orderNumber} · ${o.channel}` : o.orderNumber,
        target: o.orderId != null ? { sel: { entityType: 'order' as const, id: o.orderId } } : { query: o.orderNumber },
      })),
  ];

  const photos = [...cartonPhotos.photos].sort(
    (a, b) => (b.createdAt ? Date.parse(b.createdAt) : 0) - (a.createdAt ? Date.parse(a.createdAt) : 0),
  );

  return (
    <SearchEntityRecord
      entity="Carton"
      reference={String(receiving.id)}
      title={title}
      status={status}
      onBack={onBack}
      findings={findings}
      lines={cartonDossierLines(lines, unmatched)}
      linesLabel="line"
      emptyLines="No lines on this carton yet."
      events={presentCartonFindEvents({
        events: payload?.events ?? [],
        totals,
        photos: cartonPhotos.photos,
        createdAt: receiving.created_at,
        tracking,
        linkedOrderId: linkedOrderNumber,
      })}
      emptyEvents="No history on this carton yet."
      facts={facts}
      // The inbound record's evidence door, same place (top of the aside,
      // above the facts): linked photos open full-res in the shared viewer.
      evidence={<InboundEvidencePhotosButton key={`photos:${receivingId}`} receivingId={receivingId} poRef={po || null} />}
      relationship={(
        <RecordFlowFacts
          direction="inbound"
          testId="search-receiving-relationship"
          party={(
            <RecordFlowSection title={flowLabels.party}>
              <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
                <EvidenceFactRow label="Name">
                  <span className={vendor ? undefined : 'text-mode-muted'}>{vendor || 'Unknown'}</span>
                </EvidenceFactRow>
              </div>
            </RecordFlowSection>
          )}
          movement={(
            <RecordFlowSection title={flowLabels.movement}>
              <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
                <EvidenceFactRow label="Source">
                  <span className={platform ? RECORD_ID_CLASS : 'text-mode-muted'}>{platform || 'Unknown'}</span>
                </EvidenceFactRow>
                {po ? (
                  <EvidenceFactRow label="PO">
                    <span className={RECORD_ID_CLASS}>{po}</span>
                  </EvidenceFactRow>
                ) : null}
              </div>
            </RecordFlowSection>
          )}
        />
      )}
      related={related}
      handoffs={[{ href: '/unbox', label: 'Open Unbox', primary: findings.length > 0 }]}
      photos={photos.map((photo) => ({
        id: String(photo.id),
        imgUrl: photo.photoUrl,
        fullUrl: photo.photoUrl,
        alt: `${(photo.photoType ?? 'carton').replace(/_/g, ' ')} photo`,
      }))}
    />
  );
}
