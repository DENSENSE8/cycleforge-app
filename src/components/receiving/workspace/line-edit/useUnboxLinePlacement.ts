'use client';

/** Unbox line putaway writer — `POST /api/receiving/lines/:id/stage`. */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { postLineStage } from '@/lib/receiving/line-stage-client';
import { formatStagedLocationFace } from '@/lib/receiving/recent-staged-location';
import { toast } from '@/lib/toast';

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
        const data = await postLineStage(lineId!, body);
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
