'use client';

/**
 * Cross-viewer realtime bridge for a carton's classify facts (platform · type ·
 * priority).
 *
 * The editor hooks (useSourcePlatform / useReceivingType /
 * useReceivingLineCore.handlePrioritySelect) PATCH the carton and broadcast a
 * `receiving-package-updated` WINDOW event — which only reaches surfaces in the
 * SAME tab. The server also publishes `receiving-log.changed` on the org's Ably
 * station channel (every viewer, every machine), but until now that event
 * carried no fields, so another operator with the same carton open kept stale
 * pills until a refetch.
 *
 * This hook closes that loop for the workspace panel family: when the Ably
 * event for THIS carton carries the changed classification fields (`row`), it
 * re-dispatches the same `receiving-package-updated` event locally — every
 * existing listener (pill mirrors, claim-composer identity seed, pane row
 * merge) updates exactly as it does for a same-tab edit — and refetches the
 * carton's sibling-lines query so the feed row agrees with the pills.
 *
 * Echo-safe: the publishing client receives its own Ably echo a beat after its
 * optimistic local event; the values are identical, so the mirror setStates and
 * the refetch are no-ops. It never fires a PATCH, so there is no loop.
 */

import { useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { emitAppEvent } from '@/hooks';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useAuth } from '@/contexts/AuthContext';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import type { ReceivingPackageUpdatedDetail } from '@/components/station/receiving-lines-table-helpers';

/** Carton-level fields the bridge forwards. Only these ride the event. */
type CartonClassifyPatch = Pick<
  ReceivingPackageUpdatedDetail,
  'source_platform' | 'intake_type' | 'is_return' | 'return_platform' | 'priority_tier' | 'is_priority'
>;

const CARTON_FIELDS = [
  'source_platform',
  'intake_type',
  'is_return',
  'return_platform',
  'priority_tier',
  'is_priority',
] as const satisfies ReadonlyArray<keyof CartonClassifyPatch>;

function readCartonClassifyPatch(row: Record<string, unknown>): Partial<CartonClassifyPatch> | null {
  const detail: Partial<CartonClassifyPatch> = {};
  let touched = false;
  for (const field of CARTON_FIELDS) {
    if (!(field in row)) continue;
    const value = row[field];
    if (field === 'is_return' || field === 'is_priority') {
      if (value == null) continue; // optional boolean: absent stays absent
      detail[field] = !!value;
    } else if (field === 'priority_tier') {
      const tier = value == null || value === '' ? null : Number(value);
      detail[field] = tier != null && Number.isFinite(tier) ? tier : null;
    } else {
      const text = value == null || value === '' ? null : String(value);
      detail[field] = text;
    }
    touched = true;
  }
  return touched ? detail : null;
}

export function useReceivingCartonRealtimeBridge(receivingId: number | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const orgId = user?.organizationId ?? null;
  const stationChannel = safeChannelName(() => getStationChannelName(orgId!));
  // Stable across renders — the Ably subscription must not rebind per render.
  const receivingIdRef = useRef(receivingId);
  receivingIdRef.current = receivingId;

  useAblyChannel(
    stationChannel,
    'receiving-log.changed',
    (msg: { data?: { rowId?: unknown; row?: Record<string, unknown> | null } }) => {
      const rid = receivingIdRef.current;
      const data = msg?.data;
      if (rid == null || !data?.row) return;
      if (String(data.rowId ?? '') !== String(rid)) return;

      const patch = readCartonClassifyPatch(data.row);
      if (!patch) return;

      emitAppEvent<ReceivingPackageUpdatedDetail>('receiving-package-updated', {
        receiving_id: rid,
        ...patch,
      });
      // The pills above are optimistic; the feed row behind them is a cached
      // query. Refetch just this carton's lines so reopening never shows the
      // pre-edit values.
      void queryClient.invalidateQueries({ queryKey: ['receiving-siblings', rid] });
    },
    !!stationChannel && receivingId != null,
  );
}
