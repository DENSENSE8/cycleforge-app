'use client';

/**
 * Unbox middle Placement panel — putaway confirmation when a location is staged.
 *
 * Mounted under the label preview. Print · Receive stays on the dogfood strip;
 * this face only paints after a location has been recorded (no grayed
 * "Scan location" empty tip / Band 1 CTA).
 */

import { MapPin } from '@/components/Icons';
import {
  PlacementSummary,
  type PlacementLocationFace,
} from '@/components/receiving/PlacementSummary';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

export function UnboxPlacementSection({ row }: { row: ReceivingLineRow }) {
  const printed = Boolean(row.label_printed_at);
  const staged = Boolean(row.staged_at && row.staged_location_id);

  // Hide until print + a staged location — never a grayed Scan-location empty tip.
  if (!printed || !staged || !row.staged_location_id) return null;

  const location: PlacementLocationFace = {
    name: row.staged_location_name?.trim() || `Location ${row.staged_location_id}`,
    room: row.staged_location_room ?? null,
    barcode: row.staged_location_barcode ?? null,
    row_label: row.staged_location_row_label ?? null,
    col_label: row.staged_location_col_label ?? null,
  };

  return (
    <div
      className="border-t border-border-hairline"
      data-unbox-placement-section
      data-unbox-placement-active="false"
    >
      <div className="flex items-center gap-2 inset-cozy py-2">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Putaway
        </p>
        <span className="text-role-micro font-semibold uppercase tracking-wide text-emerald-700">
          Staged
        </span>
      </div>
      <div className="inset-cozy pb-3">
        <PlacementSummary location={location} eyebrow="Place unit here" />
      </div>
    </div>
  );
}
