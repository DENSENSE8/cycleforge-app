'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from '@/components/Icons';
import { EmptyState } from '@/design-system/primitives';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { SearchDossierFrame } from '@/components/search/dossier/SearchDossierFrame';
import type { SerialUnitDetailPayload } from '@/components/inventory/types';
import { presentFindDossier } from '@/lib/search/find-dossier-model';
import {
  findEventsFromInventory,
  findEventsFromTimelineRows,
  findEventsFromUnitPhotos,
} from '@/lib/search/find-events-from-sources';
import { presentFact } from '@/lib/search/search-dossier-model';
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

  const serial = presentFact(unit?.serial_number);
  const title = presentFact(unit?.product_title) || serial || `Unit ${token}`;
  const location = presentFact(unit?.current_location);
  const status = presentFact(unit?.current_status)?.replace(/_/g, ' ') ?? null;
  const grade = presentFact(unit?.condition_grade);
  const sku = presentFact(unit?.sku);

  const findings = useMemo(() => {
    if (!unit) return [];
    if (location) return [];
    return [
      {
        key: 'no_location',
        label: 'No location',
        hint: 'This unit is not sitting in a bin. Open inventory to place it.',
        href: searchHitHref('SERIAL_UNIT', unit.id),
        hrefLabel: 'Open inventory',
      },
    ];
  }, [unit, location]);

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
  const photoEvents = findEventsFromUnitPhotos(query.data?.photos ?? []);
  const dossier = presentFindDossier({
    entityType: 'unit',
    id: unit.id,
    title,
    status: status || 'unknown',
    facts: [
      { id: 'status', label: 'Status', value: status || '—' },
      { id: 'location', label: 'Location', value: location || '—' },
      ...(sku ? [{ id: 'sku', label: 'SKU', value: sku }] : []),
      ...(serial ? [{ id: 'serial', label: 'Serial', value: serial }] : []),
      ...(grade ? [{ id: 'grade', label: 'Grade', value: grade }] : []),
    ],
    findings,
    handoffs: [
      {
        href: searchHitHref('SERIAL_UNIT', unit.id),
        label: 'Open inventory',
        primary: true,
      },
    ],
    events: [...scanEvents, ...photoEvents],
  });

  return (
    <SearchDossierFrame
      entity="Unit"
      title={title}
      onBack={onBack}
      outline={dossier.outline}
      findings={findings}
      facts={dossier.facts}
      events={dossier.events}
      emptyLines="No chronology on this unit yet."
      handoffs={dossier.handoffs}
    />
  );
}
