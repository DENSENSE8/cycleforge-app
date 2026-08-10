'use client';

/**
 * Unbox middle Placement panel — commit `stage` confirmation face.
 *
 * Mounted under the label preview. When the pointer enters `stage` (after print),
 * scrolls into view (`nearest`) — never sticky-locks or collapses the capture
 * centre. Spatial predictability: stays mounted once print has happened.
 */

import { useEffect, useRef } from 'react';
import { MapPin } from '@/components/Icons';
import {
  PlacementSummary,
  type PlacementLocationFace,
} from '@/components/receiving/PlacementSummary';
import {
  WORKSPACE_NESTED_FIELD,
  WORKSPACE_NESTED_FIELD_PAD,
} from '@/design-system/components';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

export function UnboxPlacementSection({ row }: { row: ReceivingLineRow }) {
  const { activeKey } = useUnboxProcedureSteps(row);
  const ref = useRef<HTMLDivElement>(null);
  const printed = Boolean(row.label_printed_at);
  const staged = Boolean(row.staged_at && row.staged_location_id);

  useEffect(() => {
    if (activeKey !== 'stage') return;
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeKey, row.id]);

  // Hide until print — stage only arms after label_printed_at.
  if (!printed) return null;

  const location: PlacementLocationFace | null =
    staged && row.staged_location_id
      ? {
          name: row.staged_location_name?.trim() || `Location ${row.staged_location_id}`,
          room: row.staged_location_room ?? null,
          barcode: row.staged_location_barcode ?? null,
          row_label: row.staged_location_row_label ?? null,
          col_label: row.staged_location_col_label ?? null,
        }
      : null;

  return (
    <div
      ref={ref}
      className="border-t border-border-hairline"
      data-unbox-placement-section
      data-unbox-placement-active={activeKey === 'stage' ? 'true' : 'false'}
    >
      <div className="flex items-center gap-2 inset-cozy py-2">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-text-faint" />
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
          Location staging
        </p>
        {staged ? (
          <span className="text-role-micro font-semibold uppercase tracking-wide text-emerald-700">
            Staged
          </span>
        ) : activeKey === 'stage' ? (
          <span className="text-role-micro font-semibold uppercase tracking-wide text-amber-700">
            Scan bin
          </span>
        ) : null}
      </div>
      <div className="inset-cozy pb-3">
        {location ? (
          <PlacementSummary location={location} eyebrow="Place unit here" />
        ) : (
          <p
            className={`${WORKSPACE_NESTED_FIELD} ${WORKSPACE_NESTED_FIELD_PAD} text-role-caption text-text-muted`}
          >
            Scan a shelf or bin barcode in the dock — the unit will receive into
            that location.
          </p>
        )}
      </div>
    </div>
  );
}
