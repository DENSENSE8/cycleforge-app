'use client';

/**
 * Arrival Band 1 ACTION — shelf + priority-lane assignment for triage.
 *
 * Replaces the retired centre StagingSection card. Same write path
 * (`useTriageStaging` → PATCH `/api/receiving/[id]`); flush dock geometry
 * matches Unbox Band 1 (`expandBand`, abutting segments — never a raised
 * Omnichannel / centre card). Save-for-unbox still requires both fields
 * (`completeTriage`).
 */

import { useMemo, type ReactNode } from 'react';
import { Flag, Loader2, MapPin } from '@/components/Icons';
import {
  formatBinAddress,
  PlacementSummary,
} from '@/components/receiving/PlacementSummary';
import { SELECT_CLASS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { TRIAGE_LANE_OPTS, triageLaneLabel } from '@/lib/receiving/triage-lane-policy';
import type { Location } from '@/lib/neon/location-queries';
import { cn } from '@/utils/_cn';
import { TriageStagingStatusChips } from './TriageStagingStatusChips';
import type { TriageStagingController } from './useTriageStaging';

function groupLocationsByRoom(locations: Location[]): { room: string; items: Location[] }[] {
  const map = new Map<string, Location[]>();
  for (const loc of locations) {
    const room = loc.room?.trim() || 'Other';
    const list = map.get(room);
    if (list) list.push(loc);
    else map.set(room, [loc]);
  }
  return Array.from(map.entries()).map(([room, items]) => ({ room, items }));
}

export function ArrivalStagingDockControl({
  staging,
  scanCell,
}: {
  staging: TriageStagingController;
  /**
   * Procedure waist ({@link ArrivalDockScanEntry}) — leads the shelf row as a
   * full-height abutting segment so scanning the shelf and picking it from the
   * catalog are the same control at the same address. The `<select>` STAYS:
   * it is the fallback for a damaged shelf label and the only path on a bench
   * with no scanner. Scan-first, mouse-still-works.
   */
  scanCell?: ReactNode;
}) {
  const {
    locations,
    locationsLoading,
    stagingLocationId,
    selectShelf,
    savingLocation,
    priorityLane,
    selectLane,
    savingLane,
    selectedLocation,
    locationLabel,
    isStaged,
  } = staging;

  const grouped = useMemo(() => groupLocationsByRoom(locations), [locations]);
  const saving = savingLocation || savingLane;

  return (
    <div
      className="flex w-full min-w-0 flex-col gap-0 border-0 bg-surface-card"
      data-arrival-staging-dock
    >
      <div className="flex items-center justify-between gap-2 inset-cozy py-1.5">
        <TriageStagingStatusChips
          complete={isStaged}
          locationLabel={locationLabel}
          lane={priorityLane}
        />
        {saving ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-text-faint" />
        ) : null}
      </div>

      {selectedLocation ? (
        <div className="border-t border-border-hairline inset-cozy py-2">
          <PlacementSummary
            location={selectedLocation}
            eyebrow="Place carton here"
            laneLabel={priorityLane ? triageLaneLabel(priorityLane) : null}
          />
        </div>
      ) : (
        <p className="border-t border-border-hairline inset-cozy py-2 text-role-caption text-text-muted">
          Pick a shelf so inventory and unboxers know where this carton sits.
        </p>
      )}

      <div className="flex h-11 w-full min-w-0 items-stretch gap-0 border-t border-border-hairline">
        {scanCell}
        <div
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 inset-cozy',
            scanCell ? 'border-l border-border-hairline' : undefined,
          )}
        >
          <MapPin className="h-3.5 w-3.5 shrink-0 text-text-faint" />
          <select
            className={SELECT_CLASS}
            value={stagingLocationId ?? ''}
            disabled={locationsLoading || savingLocation}
            aria-label="Staging shelf"
            onChange={(e) => {
              const v = e.target.value;
              void selectShelf(v ? Number(v) : null);
            }}
          >
            <option value="">{locationsLoading ? 'Loading…' : 'Select a shelf…'}</option>
            {grouped.map(({ room, items }) => (
              <optgroup key={room} label={room}>
                {items.map((loc) => {
                  const bin = formatBinAddress(loc);
                  return (
                    <option key={loc.id} value={loc.id}>
                      {[loc.name, bin, loc.barcode].filter(Boolean).join(' · ')}
                    </option>
                  );
                })}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 border-l border-border-hairline inset-cozy">
          <Flag className="h-3.5 w-3.5 shrink-0 text-text-faint" />
          <select
            className={SELECT_CLASS}
            value={priorityLane ?? ''}
            disabled={savingLane}
            aria-label="Priority lane"
            onChange={(e) => {
              const v = e.target.value;
              void selectLane(v || null);
            }}
          >
            <option value="">Unassigned</option>
            {TRIAGE_LANE_OPTS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
