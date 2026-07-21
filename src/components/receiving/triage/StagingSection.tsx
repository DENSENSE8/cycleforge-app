'use client';

/**
 * StagingSection — shelf + priority-lane assignment for triage.
 * Auto-routes lane on shelf save; operator can override via lane select.
 * Placement summary is written for the unboxing person (room · bin · barcode).
 * SectionTabsSlider owns the "Staging" eyebrow — this card stays unlabeled.
 */

import { useMemo } from 'react';
import {
  WorkspaceCard,
  WORKSPACE_NESTED_FIELD,
  WORKSPACE_NESTED_FIELD_PAD,
} from '@/design-system/components';
import { Loader2, MapPin, Flag, Barcode } from '@/components/Icons';
import { SELECT_CLASS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { TRIAGE_LANE_OPTS, triageLaneLabel } from '@/lib/receiving/triage-lane-policy';
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

function formatBinAddress(loc: Location): string | null {
  if (loc.row_label == null || loc.col_label == null) return null;
  return `${loc.row_label}-${String(loc.col_label).padStart(2, '0')}`;
}

function PlacementSummary({
  location,
  lane,
}: {
  location: Location;
  lane: string | null;
}) {
  const bin = formatBinAddress(location);
  const room = location.room?.trim() || null;
  const zone = location.zone_letter?.trim() || null;
  const barcode = location.barcode?.trim() || null;
  const binType = location.bin_type?.trim() || null;
  const description = location.description?.trim() || null;

  // Spoken path for the floor — what an unboxer reads off the shelf label.
  const spokenPath = [room, bin, barcode ? `scan ${barcode}` : null].filter(Boolean).join(' · ');

  return (
    <div className={`${WORKSPACE_NESTED_FIELD} ${WORKSPACE_NESTED_FIELD_PAD}`}>
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
        Place carton here
      </p>
      <p className="mt-1.5 text-role-body font-semibold text-text-default">
        {spokenPath || location.name}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-role-caption">
        {room ? (
          <div>
            <dt className="text-text-faint">Room / zone</dt>
            <dd className="font-medium text-text-muted">
              {room}
              {zone ? ` · Zone ${zone}` : ''}
            </dd>
          </div>
        ) : null}
        {bin ? (
          <div>
            <dt className="text-text-faint">Bin address</dt>
            <dd className="font-mono tabular-nums font-medium text-text-muted">{bin}</dd>
          </div>
        ) : null}
        {barcode ? (
          <div className="col-span-2">
            <dt className="text-text-faint">Shelf barcode</dt>
            <dd className="flex items-center gap-1.5 font-mono tabular-nums font-medium text-text-muted">
              <Barcode className="h-3.5 w-3.5 shrink-0 text-text-faint" />
              {barcode}
            </dd>
          </div>
        ) : null}
        {binType ? (
          <div>
            <dt className="text-text-faint">Bin type</dt>
            <dd className="font-medium uppercase tracking-wide text-text-muted">{binType}</dd>
          </div>
        ) : null}
        {lane ? (
          <div>
            <dt className="text-text-faint">Priority lane</dt>
            <dd className="font-medium text-text-muted">{triageLaneLabel(lane)}</dd>
          </div>
        ) : null}
        {location.capacity != null ? (
          <div>
            <dt className="text-text-faint">Capacity</dt>
            <dd className="font-medium tabular-nums text-text-muted">{location.capacity}</dd>
          </div>
        ) : null}
        {description ? (
          <div className="col-span-2">
            <dt className="text-text-faint">Notes</dt>
            <dd className="text-text-muted">{description}</dd>
          </div>
        ) : null}
        <div className="col-span-2">
          <dt className="text-text-faint">Shelf name</dt>
          <dd className="font-medium text-text-muted">{location.name}</dd>
        </div>
      </dl>
      <p className="mt-3 text-role-caption text-text-faint">
        Unboxers find this carton by the shelf barcode or bin address above —
        stage it before Save for unbox.
      </p>
    </div>
  );
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
    <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested" actions={savingIndicator ?? undefined}>
      <div className="space-y-4">
        <TriageStagingStatusChips
          complete={isStaged}
          locationLabel={locationLabel}
          lane={priorityLane}
        />

        {selectedLocation ? (
          <PlacementSummary location={selectedLocation} lane={priorityLane} />
        ) : (
          <p className={`${WORKSPACE_NESTED_FIELD} ${WORKSPACE_NESTED_FIELD_PAD} text-role-caption text-text-muted`}>
            Pick a shelf so inventory and unboxers know exactly where this carton
            sits (room · bin · barcode).
          </p>
        )}

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
