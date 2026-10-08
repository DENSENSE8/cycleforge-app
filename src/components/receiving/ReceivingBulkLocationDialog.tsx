'use client';

/**
 * Change location — the receiving check-set's centered picker dialog
 * (operator 2026-10-08), the same shape as Pair SKU to location: the search is
 * open and focused over every stock place; type or scan a bin, Enter sets it as
 * the staging location of every checked package (`PATCH /api/receiving/:id`
 * `staging_location_id`), and the done face says where they went.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { VerbDoneState } from '@/design-system/components/record-action-strip/VerbDoneState';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { locationsListQueryOptions, selectScannableBins } from '@/hooks/useLocations';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { receivingPackageIds } from '@/lib/receiving/receiving-selection';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { toast } from '@/lib/toast';

async function patchReceivingPackage(id: number, locationId: number): Promise<void> {
  const res = await fetch(`/api/receiving/${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staging_location_id: locationId }),
  });
  const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (!res.ok || !data?.success) throw new Error(data?.error || `Package update failed (${res.status})`);
}

const packagesNoun = (n: number) => `${n} package${n === 1 ? '' : 's'}`;

export function ReceivingBulkLocationDialog({ rows, done }: { rows: ReceivingLineRow[]; done: () => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  // The done face: where the packages now sit, until the operator taps Done (or Enter).
  const [moved, setMoved] = useState<string | null>(null);
  // The write takes the location's id, so the picker reads the id-keyed stock places.
  const locationsQuery = useQuery({ ...locationsListQueryOptions(), select: selectScannableBins });
  const locations = useMemo(() => locationsQuery.data ?? [], [locationsQuery.data]);
  const options = useMemo(
    () =>
      locations.map((location) => ({
        value: String(location.id),
        label: location.room ? `${location.room} · ${location.name}` : location.name,
        meta: location.barcode || undefined,
      })),
    [locations],
  );
  const packageIds = useMemo(() => receivingPackageIds(rows), [rows]);
  const loading = locationsQuery.isLoading;

  const setLocation = async (value: string) => {
    if (saving) return;
    const locationId = Number(value);
    const location = locations.find((candidate) => candidate.id === locationId);
    if (!location) return;
    setSaving(true);
    try {
      await Promise.all(packageIds.map((receivingId) => patchReceivingPackage(receivingId, locationId)));
      const locationLabel = location.room ? `${location.room} · ${location.name}` : location.name;
      for (const row of rows) {
        dispatchLineUpdated({ id: row.id, staging_location_id: locationId, staging_location_label: locationLabel });
      }
      invalidateReceivingFeeds(queryClient);
      setMoved(locationLabel);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change package location');
    } finally {
      setSaving(false);
    }
  };

  if (moved) {
    return (
      <VerbDoneState
        title="Location set"
        detail={`${packagesNoun(packageIds.length)} → ${moved}`}
        onDone={done}
        testId="incoming-bulk-location-done"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2" data-testid="incoming-bulk-location">
      <p className="text-role-caption text-text-soft">{packagesNoun(packageIds.length)} checked</p>
      <IntakeCombobox
        surface="open"
        value={null}
        onChange={(value) => void setLocation(value)}
        options={options}
        placeholder="Location"
        searchPlaceholder={loading ? 'Loading locations…' : saving ? 'Saving location…' : 'Scan or type a bin code, name or room…'}
        emptyMessage={loading ? 'Loading locations…' : 'No matching location'}
        disabled={saving || packageIds.length === 0}
        ariaLabel={`Change location for ${packagesNoun(packageIds.length)}`}
        testId="incoming-bulk-location-picker"
        className="flex-1"
      />
    </div>
  );
}
