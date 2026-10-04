'use client';

/**
 * Where a rack stands — the desk's wedge/keyboard entry of a ROOM or STAGING
 * label, with the manual pick beneath it (the phone's scan + manual fallback).
 * A typed or scanned code resolves against the org's placements here; a code
 * that matches none still goes to the server, which validates it the same way
 * as a scan (`destination_not_found` / `destination_kind`).
 */

import { useMemo, useState } from 'react';
import { EVIDENCE_CONTROL_CLASS } from '@/design-system/components/record-ledger/RecordEvidence';
import { TextField } from '@/design-system/primitives';
import { useLocations } from '@/hooks/useLocations';
import type { LocationRecord } from '@/hooks/locations-cache';
import { unwrapScannedLocation } from '@/lib/barcode-routing';
import type { RackCreatePlacement } from '@/lib/locations/rack-create-model';
import type { RackPlacementKind } from '@/lib/locations/rack-types';
import { cn } from '@/utils/_cn';

/** A ROOM / STAGING location row as the rack flows hold it. */
function toPlacement(l: LocationRecord): RackCreatePlacement {
  return { id: l.id, code: l.barcode, name: l.display_name || l.name, kind: l.location_kind as RackPlacementKind };
}

export function RackPlacementField({
  value,
  onChange,
  onSubmit,
  excludeId = null,
  testId,
}: {
  value: RackCreatePlacement | null;
  onChange: (next: RackCreatePlacement | null) => void;
  /** Enter on a resolved scan — the step's primary verb. */
  onSubmit?: (placement: RackCreatePlacement) => void;
  /** The rack's current placement (Move): not offered. */
  excludeId?: number | null;
  testId: string;
}) {
  const { locations, loading } = useLocations();
  const [scan, setScan] = useState('');
  const placements = useMemo(
    () =>
      locations
        .filter((l) => (l.location_kind === 'ROOM' || l.location_kind === 'STAGING') && l.id !== excludeId)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [locations, excludeId],
  );

  const resolveScan = (): RackCreatePlacement | null => {
    const code = unwrapScannedLocation(scan);
    if (!code) return null;
    const hit = placements.find((l) => l.barcode?.toUpperCase() === code.toUpperCase());
    return hit ? toPlacement(hit) : { id: null, code, name: code, kind: 'ROOM' };
  };

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid={testId}>
      <TextField
        label="Scan or type the room or floor label"
        autoFocus
        mono
        value={scan}
        onChange={setScan}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const next = resolveScan();
          if (!next) return;
          onChange(next);
          setScan('');
          onSubmit?.(next);
        }}
        data-testid={`${testId}-scan`}
      />
      <label className="flex flex-col gap-1">
        <span className="mode-label text-mode-muted">Or pick it</span>
        <select
          value={value?.id != null ? String(value.id) : ''}
          onChange={(event) => {
            const hit = placements.find((l) => String(l.id) === event.target.value);
            onChange(hit ? toPlacement(hit) : null);
          }}
          disabled={loading}
          aria-label="Pick a room or floor spot"
          className={cn(EVIDENCE_CONTROL_CLASS, 'w-full')}
          data-testid={`${testId}-pick`}
        >
          <option value="">{loading ? 'Loading rooms…' : 'Choose a room or floor spot'}</option>
          {placements.map((l) => (
            <option key={l.id} value={String(l.id)}>
              {(l.display_name || l.name) + (l.location_kind === 'STAGING' ? ' · floor spot' : '')}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
