'use client';

/**
 * Inventory › Stock — the desk's live half: **one refresh per real commit,
 * gated on the operator.**
 *
 * The transport already existed. `adjustBinQty` publishes a `STOCK_DELTA_*`
 * onto the org's `station:changes` after every bin verb commits — the gun's
 * put/take, `/m`'s offline queue draining, `/api/transfers`, the swap, the cycle
 * count lines — and `LocationDetailView` has subscribed to that same event for
 * the single-bin view all along. This hook is that subscription for the
 * warehouse-wide list. Nothing here polls: `/inventory/stock` is RSC +
 * `force-dynamic`, so a refresh re-runs `getStockByLocation`, and a clock would
 * pay that price twelve times a minute per open tab whether or not anything
 * moved. It also would not help — the phone writes through the offline queue,
 * so a pairing tapped at 10:00 can commit at 10:07, and no interval bounds that.
 *
 * What it adds to the transport is the {@link stockLiveRefreshNext} rule: the
 * desk refreshes while it is IDLE, and holds while it is GATED (a selection is
 * armed, or the intake composer is open), because the verb strip writes the rows
 * it was handed. The held count comes back as {@link LocationStockRealtime.pending}
 * for the toolbar chip, and flushes the moment the gate lifts.
 *
 * `coalesce` is deliberately left at `none`: frame coalescing is last-wins, and
 * this handler COUNTS. One message per bin commit is not a firehose.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import {
  isStockDeltaActivity,
  stockLiveRefreshNext,
  STOCK_LIVE_REFRESH_IDLE,
  type StockLiveRefreshEvent,
} from '@/lib/inventory/stock-live-refresh';

/**
 * Collapse a burst — a transfer is two commits, a `/m` queue drain is however
 * many the phone was holding — into one server round trip. Matches the 750ms
 * `useOperationsJourney` already uses for its debounced invalidate.
 */
const REFRESH_DEBOUNCE_MS = 750;

export interface LocationStockRealtime {
  /** Deltas held back by the gate. `0` while idle — the chip is unmounted. */
  pending: number;
  /**
   * Refresh now and clear the announcement. The chip's click, and the write
   * strip's `onCommitted` — routing the desk's own commit through here means
   * its echo off the channel does not also announce itself.
   */
  refreshNow: () => void;
}

export function useLocationStockRealtime({ gated }: { gated: boolean }): LocationStockRealtime {
  const router = useRouter();
  const { user } = useAuth();
  const stationChannel = safeChannelName(() => getStationChannelName(user?.organizationId!));

  const [pending, setPending] = useState(0);
  const stateRef = useRef(STOCK_LIVE_REFRESH_IDLE);
  const timerRef = useRef<number | null>(null);

  // Read the gate at EVENT time. The subscription outlives any one selection,
  // so a gate captured at subscribe time would be the wrong answer by the time
  // a delta lands.
  const gatedRef = useRef(gated);
  gatedRef.current = gated;

  const apply = useCallback(
    (event: StockLiveRefreshEvent) => {
      const next = stockLiveRefreshNext(stateRef.current, event);
      stateRef.current = next.state;
      setPending(next.state.pending);
      if (!next.refresh) return;
      window.clearTimeout(timerRef.current ?? undefined);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    },
    [router],
  );

  useAblyChannel(
    stationChannel,
    'activity.logged',
    (message: { data?: { activityType?: string } }) => {
      if (!isStockDeltaActivity(message?.data?.activityType)) return;
      apply({ kind: 'delta', gated: gatedRef.current });
    },
    !!stationChannel,
  );

  // The gate lifting is what flushes — not a timer, and not the next delta.
  useEffect(() => {
    if (gated) return;
    apply({ kind: 'ungated' });
  }, [gated, apply]);

  useEffect(
    () => () => {
      window.clearTimeout(timerRef.current ?? undefined);
    },
    [],
  );

  const refreshNow = useCallback(() => {
    window.clearTimeout(timerRef.current ?? undefined);
    timerRef.current = null;
    apply({ kind: 'refreshed' });
    router.refresh();
  }, [apply, router]);

  return { pending, refreshNow };
}
