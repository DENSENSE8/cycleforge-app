'use client';

/**
 * Spoken placement face — room · bin · `scan {barcode}` for the floor.
 *
 * Shared by Arrival carton staging and Unbox unit putaway (`stage`). Caller
 * supplies the eyebrow (“Place carton here” vs “Place unit here”).
 */

import type { ReactNode } from 'react';
import { Barcode } from '@/components/Icons';
import {
  WORKSPACE_NESTED_FIELD,
  WORKSPACE_NESTED_FIELD_PAD,
} from '@/design-system/components';

type PlacementLocationFace = {
  name: string;
  room?: string | null;
  barcode?: string | null;
  row_label?: string | null;
  col_label?: string | null;
  zone_letter?: string | null;
  bin_type?: string | null;
  description?: string | null;
  capacity?: number | null;
};

/**
 * Row-col face. Module-local: its one external consumer was the Arrival
 * staging `<select>`, deleted 2026-08-20 when shelf/lane became a Displays-only
 * job (`ArrivalLocationsLeaf`). Export it again when a second caller exists.
 */
function formatBinAddress(loc: {
  row_label?: string | null;
  col_label?: string | null;
}): string | null {
  if (loc.row_label == null || loc.col_label == null) return null;
  return `${loc.row_label}-${String(loc.col_label).padStart(2, '0')}`;
}

export function PlacementSummary({
  location,
  eyebrow = 'Place here',
  laneLabel = null,
  footer = null,
}: {
  location: PlacementLocationFace;
  eyebrow?: string;
  /** Optional priority-lane face (Arrival only). */
  laneLabel?: string | null;
  footer?: ReactNode;
}) {
  const bin = formatBinAddress(location);
  const room = location.room?.trim() || null;
  const zone = location.zone_letter?.trim() || null;
  const barcode = location.barcode?.trim() || null;
  const binType = location.bin_type?.trim() || null;
  const description = location.description?.trim() || null;

  const spokenPath = [room, bin, barcode ? `scan ${barcode}` : null].filter(Boolean).join(' · ');

  return (
    <div className={`${WORKSPACE_NESTED_FIELD} ${WORKSPACE_NESTED_FIELD_PAD}`} data-placement-summary>
      <p className="text-role-eyebrow text-text-soft">{eyebrow}</p>
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
            <dd className="font-medium text-text-muted">{binType}</dd>
          </div>
        ) : null}
        {laneLabel ? (
          <div>
            <dt className="text-text-faint">Priority lane</dt>
            <dd className="font-medium text-text-muted">{laneLabel}</dd>
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
            <dd className="font-medium text-text-muted">{description}</dd>
          </div>
        ) : null}
        <div className="col-span-2">
          <dt className="text-text-faint">Shelf name</dt>
          <dd className="font-medium text-text-muted">{location.name}</dd>
        </div>
      </dl>
      {footer}
    </div>
  );
}
