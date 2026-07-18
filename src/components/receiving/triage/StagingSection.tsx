'use client';

/**
 * StagingSection — shelf + priority-lane assignment for triage.
 * Auto-routes lane on shelf save; operator can override via lane select.
 */

import { useMemo } from 'react';
import { WorkspaceCard } from '@/design-system/components';
import { Loader2, MapPin, Flag } from '@/components/Icons';
import { SELECT_CLASS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { TRIAGE_LANE_OPTS } from '@/lib/receiving/triage-lane-policy';
import { TriageStagingStatusChips } from './TriageStagingStatusChips';
import type { TriageStagingController } from './useTriageStaging';
import type { Location } from '@/lib/neon/location-queries';

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

export function StagingSection({ staging }: { staging: TriageStagingController }) {
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
  const savingIndicator = saving ? (
    <Loader2 className="h-3.5 w-3.5 animate-spin text-text-faint" />
  ) : null;

  return (
    <WorkspaceCard
      label="Staging"
      variant="glass"
      overflow="visible"
      actions={savingIndicator ?? undefined}
    >
      <div className="space-y-4">
        <TriageStagingStatusChips
          complete={isStaged}
          locationLabel={locationLabel}
          lane={priorityLane}
        />

        <div className="space-y-1">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Shelf</p>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-text-faint" />
            <select
              className={SELECT_CLASS}
              value={stagingLocationId ?? ''}
              disabled={locationsLoading || savingLocation}
              onChange={(e) => {
                const v = e.target.value;
                void selectShelf(v ? Number(v) : null);
              }}
            >
              <option value="">{locationsLoading ? 'Loading…' : 'Select a shelf…'}</option>
              {grouped.map(({ room, items }) => (
                <optgroup key={room} label={room}>
                  {items.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                      {loc.barcode ? ` · ${loc.barcode}` : ''}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          {selectedLocation ? (
            <dl className="mt-2 grid gap-1 text-role-caption text-text-muted">
              {selectedLocation.room ? (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-text-faint">Room</dt>
                  <dd>{selectedLocation.room}</dd>
                </div>
              ) : null}
              {selectedLocation.barcode ? (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-text-faint">Barcode</dt>
                  <dd className="font-mono tabular-nums">{selectedLocation.barcode}</dd>
                </div>
              ) : null}
              {selectedLocation.row_label != null && selectedLocation.col_label != null ? (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-text-faint">Bin</dt>
                  <dd className="font-mono tabular-nums">
                    {selectedLocation.row_label}-{selectedLocation.col_label}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>

        <div className="space-y-1">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Priority lane</p>
          <div className="flex items-center gap-1.5">
            <Flag className="h-3.5 w-3.5 shrink-0 text-text-faint" />
            <select
              className={SELECT_CLASS}
              value={priorityLane ?? ''}
              disabled={savingLane}
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
          <p className="text-role-caption text-text-faint">
            Auto-fills when you pick a shelf; change anytime to override.
          </p>
        </div>
      </div>
    </WorkspaceCard>
  );
}
