'use client';

/** Progressive disclosure for changing the staging location of checked packages. */

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
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

export function ReceivingBulkLocationDisplay({
  rows,
  done,
}: {
  rows: ReceivingLineRow[];
  done: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const locationsQuery = useQuery({
    ...locationsListQueryOptions(),
    select: selectScannableBins,
  });
  const locations = locationsQuery.data ?? [];
  const options = useMemo(
    () =>
      locations.map((location) => ({
        value: location.id,
        label: location.room ? `${location.room} · ${location.name}` : location.name,
        meta: location.barcode || undefined,
      })),
    [locations],
  );
  const packageIds = useMemo(() => receivingPackageIds(rows), [rows]);

  const setLocation = useCallback(
    async (locationId: string | number | null) => {
      if (locationId == null || saving) return;
      const parsed = Number(locationId);
      const location = locations.find((candidate) => candidate.id === parsed);
      if (!location) return;
      setSaving(true);
      try {
        await Promise.all(
          packageIds.map((receivingId) => patchReceivingPackage(receivingId, parsed)),
        );
        const locationLabel = location.room
          ? `${location.room} · ${location.name}`
          : location.name;
        for (const row of rows) {
          dispatchLineUpdated({
            id: row.id,
            staging_location_id: parsed,
            staging_location_label: locationLabel,
          });
        }
        invalidateReceivingFeeds(queryClient);
        toast.success(
          `${packageIds.length} package${packageIds.length === 1 ? '' : 's'} moved to ${location.name}`,
        );
        done();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not change package location');
      } finally {
        setSaving(false);
      }
    },
    [done, locations, packageIds, queryClient, rows, saving],
  );

  return (
    <SearchableSelectField
      value={null}
      onChange={setLocation}
      options={options}
      loading={locationsQuery.isLoading || saving}
      disabled={saving || packageIds.length === 0}
      placeholder={saving ? 'Saving location…' : 'Choose package location…'}
      searchPlaceholder="Bin code, name or room…"
      emptyMessage="No matching location"
      ariaLabel={`Change location for ${packageIds.length} selected package${packageIds.length === 1 ? '' : 's'}`}
      testId="incoming-bulk-location-picker"
      className="min-w-64 max-w-md flex-1"
    />
  );
}
