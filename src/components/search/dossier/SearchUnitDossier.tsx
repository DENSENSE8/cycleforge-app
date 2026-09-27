'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { SearchEntityRecord } from '@/components/search/dossier/SearchEntityRecord';
import type { SerialUnitDetailPayload } from '@/components/inventory/types';
import {
  findEventsFromInventory,
  findEventsFromTimelineRows,
  findEventsFromUnitPhotos,
} from '@/lib/search/find-events-from-sources';
import {
  presentFact,
  type SearchDossierFact,
  type SearchDossierFinding,
  type SearchDossierLink,
} from '@/lib/search/search-dossier-model';
import { searchHitHref } from '@/lib/search/search-hit';

export function SearchUnitDossier({
  unitRef,
  onBack,
}: {
  unitRef: string | number;
  onBack?: () => void;
}) {
  const token = String(unitRef ?? '').trim();
  const query = useQuery({
    queryKey: ['serial-unit-detail', token],
    queryFn: async (): Promise<SerialUnitDetailPayload> => {
      const res = await fetch(`/api/serial-units/${encodeURIComponent(token)}?include=full`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`unit ${res.status}`);
      return res.json();
    },
    enabled: token.length > 0,
    staleTime: 30_000,
  });

  const unit = query.data?.serial_unit ?? null;
  const settled = !query.isLoading;
  const primaryPaint = useSearchPrimaryPaintOptional();
  useEffect(() => {
    if (!settled) return;
    primaryPaint?.onPrimaryPainted();
  }, [settled, primaryPaint]);

  if (!settled) {
    return <div className="min-h-0 flex-1" aria-busy />;
  }

  if (query.isError || !unit) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-surface-card">
        <EmptyState
          icon={<Search className="h-6 w-6 text-text-faint" />}
          title="Unit not found"
          description="No serial unit matched this selection."
        />
      </div>
    );
  }

  const serial = presentFact(unit.serial_number);
  const title = presentFact(unit.product_title) || serial || `Unit ${unit.id}`;
  const location = presentFact(unit.current_location);
  const status = presentFact(unit.current_status)?.replace(/_/g, ' ') ?? 'unknown';
  const grade = presentFact(unit.condition_grade);
  const sku = presentFact(unit.sku);
  const tracking = presentFact(unit.shipping_tracking_number);
  const receivedBy = presentFact(unit.received_by_name);
  const inventoryHref = searchHitHref('SERIAL_UNIT', unit.id);

  const findings: SearchDossierFinding[] = location
    ? []
    : [
        {
          key: 'no_location',
          label: 'No location',
          hint: 'This unit is not sitting in a bin. Open inventory to place it.',
          href: inventoryHref,
          hrefLabel: 'Open inventory',
        },
      ];

  const photos = [...(query.data?.photos ?? [])].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  );

  const facts: SearchDossierFact[] = [
    ...(serial ? [{ id: 'serial', label: 'Serial', value: serial, copy: true }] : []),
    ...(sku ? [{ id: 'sku', label: 'SKU', value: sku, copy: true }] : []),
    { id: 'location', label: 'Bin', value: location || '—' },
    ...(grade ? [{ id: 'grade', label: 'Condition', value: grade.replace(/_/g, ' ') }] : []),
    ...(tracking ? [{ id: 'tracking', label: 'Tracking #', value: tracking, copy: true }] : []),
    ...(receivedBy ? [{ id: 'received-by', label: 'Received by', value: receivedBy }] : []),
  ];

  // The orders this unit was allocated to (live first) and its catalog item.
  const related: SearchDossierLink[] = [
    ...(query.data?.allocations ?? []).map((allocation) => ({
      id: `order:${allocation.order_id}`,
      label: allocation.released_at ? 'Was on order' : 'Order',
      value: presentFact(allocation.order_number) || `#${allocation.order_id}`,
      target: { sel: { entityType: 'order' as const, id: allocation.order_id } },
    })),
    ...(unit.sku_catalog_id != null && sku
      ? [
          {
            id: `sku:${unit.sku_catalog_id}`,
            label: 'Product',
            value: sku,
            target: { sel: { entityType: 'sku' as const, id: unit.sku_catalog_id } },
          },
        ]
      : []),
  ];

  const scanEvents =
    (query.data?.events_full?.length ?? 0) > 0
      ? findEventsFromTimelineRows(query.data?.events_full ?? [])
      : findEventsFromInventory(
          (query.data?.events ?? []).map((row) => ({
            id: row.id,
            occurred_at: row.occurred_at,
            event_type: row.event_type,
            notes: row.notes,
            serial_number: row.serial_number,
            sku: row.sku,
            prev_status: row.prev_status,
            next_status: row.next_status,
            bin_name: row.bin_name,
            bin_barcode: null,
            station: row.station,
            actor_name: row.actor_name,
          })),
        );

  return (
    <SearchEntityRecord
      entity="Unit"
      reference={serial || String(unit.id)}
      title={title}
      status={status}
      onBack={onBack}
      findings={findings}
      lines={[
        {
          id: unit.id,
          title,
          imageUrl: photos[0]?.url ?? null,
          facts: [
            ...(sku ? [{ label: 'SKU', value: sku }] : []),
            ...(grade ? [{ label: 'Condition', value: grade.replace(/_/g, ' ') }] : []),
            { label: 'Bin', value: location || 'Unassigned' },
          ],
        },
      ]}
      linesLabel="unit"
      emptyLines="No unit."
      events={[...scanEvents, ...findEventsFromUnitPhotos(photos)]}
      emptyEvents="No history on this unit yet."
      facts={facts}
      related={related}
      handoffs={[{ href: inventoryHref, label: 'Open inventory', primary: true }]}
      photos={photos.map((photo) => ({
        id: String(photo.id),
        imgUrl: photo.url,
        fullUrl: photo.url,
        alt: `${(photo.photo_type ?? 'unit').replace(/_/g, ' ')} photo`,
      }))}
    />
  );
}
