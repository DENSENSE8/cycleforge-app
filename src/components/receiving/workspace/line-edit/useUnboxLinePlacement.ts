'use client';

/**
 * Unbox line putaway writer — `POST /api/receiving/lines/:id/stage`.
 *
 * ONE writer for the two surfaces that place an open Unbox line: the notes
 * footer location pill and the Displays → Locations leaf. Both must dispatch
 * the same optimistic row update and invalidate the same Last-entry read, or
 * placing from the leaf leaves the pill reading the stale bin.
 *
 * Unbox storage only (`receiving_line_putaway`); never triage
 * `staging_location_id`, never the packing-desk ledger.
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { formatStagedLocationFace } from '@/lib/receiving/recent-staged-location';
import { toast } from '@/lib/toast';

type StageResponse = {
  success?: boolean;
  error?: string;
  line?: {
    staged_at?: string | null;
    staged_location_id?: number | null;
  };
  location?: {
    id?: number;
    name?: string | null;
    barcode?: string | null;
    room?: string | null;
  } | null;
};

async function postStage(
  lineId: number,
  body: { location_id?: number; barcode?: string },
): Promise<StageResponse> {
  const res = await fetch(`/api/receiving/lines/${lineId}/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as StageResponse | null;
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Could not update location');
  }
  return data;
}

export function useUnboxLinePlacement(lineId: number | null | undefined) {
  const enabled = lineId != null && Number.isFinite(lineId) && lineId > 0;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  /**
   * Returns whether the write LANDED — the Locations leaf must not toast a
   * placement that rolled back, and the pill must not repaint a bin the line
   * is not in.
   */
  const applyStage = useCallback(
    async (
      body: { location_id?: number; barcode?: string },
      faceHint?: string,
      /**
       * Bin the line is leaving, when it had one. Makes a MOVE readable as
       * `from → to`: a mis-scan off a correct shelf must not look identical to
       * a first placement, which is all a bare `→ to` can say.
       */
      fromFace?: string | null,
    ): Promise<boolean> => {
      if (!enabled || busy) return false;
      setBusy(true);
      try {
        const data = await postStage(lineId!, body);
        const loc = data.location;
        const face =
          faceHint ||
          formatStagedLocationFace({
            name: loc?.name,
            barcode: loc?.barcode,
            room: loc?.room,
          }) ||
          'location';
        dispatchLineUpdated({
          id: lineId!,
          staged_at: data.line?.staged_at ?? new Date().toISOString(),
          staged_location_id: loc?.id ?? data.line?.staged_location_id ?? null,
          staged_location_name: loc?.name ?? null,
          staged_location_barcode: loc?.barcode ?? null,
          staged_location_room: loc?.room ?? null,
        });
        void queryClient.invalidateQueries({
          queryKey: ['receiving', 'recent-staged-location'],
        });
        const from = (fromFace || '').trim();
        toast.success(
          from && from !== face ? `Location ${from} → ${face}` : `Location → ${face}`,
        );
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not update location');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, enabled, lineId, queryClient],
  );

  return { enabled, busy, applyStage };
}
