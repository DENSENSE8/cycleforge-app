'use client';

/**
 * Unbox middle Placement panel — commit `stage` confirmation face.
 *
 * Mounted under the label preview. When the pointer enters `stage` (after print),
 * scrolls into view (`nearest`) — never sticky-locks or collapses the capture
 * centre. Spatial predictability: stays mounted once print has happened.
 *
 * Empty tip = flush InlineNotice (advisory SoT). Staged confirmation =
 * PlacementSummary on WORKSPACE_NESTED_FIELD (fact face).
 */

import { useEffect, useRef } from 'react';
import { MapPin } from '@/components/Icons';
import {
  PlacementSummary,
  type PlacementLocationFace,
} from '@/components/receiving/PlacementSummary';
import { InlineNotice } from '@/design-system/components';
import { useUnboxProcedureSteps } from './useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

export function UnboxPlacementSection({ row }: { row: ReceivingLineRow }) {
  const { activeKey } = useUnboxProcedureSteps(row);
  const ref = useRef<HTMLDivElement>(null);
  const printed = Boolean(row.label_printed_at);
  const staged = Boolean(row.staged_at && row.staged_location_id);
  const stageArmed = activeKey === 'stage';

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
      data-unbox-placement-active={stageArmed ? 'true' : 'false'}
    >
      {location ? (
        <>
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
        </>
      ) : (
        // Edge-flush white band on the centre plane — no outer inset island.
        // Mount is gated on label_printed_at above.
        <InlineNotice
          tone="neutral"
          size="sm"
          icon={<MapPin />}
          title="Putaway"
          className="border-x-0 border-t-0 bg-surface-card"
        >
          Scan location
        </InlineNotice>
      )}
    </div>
  );
}
