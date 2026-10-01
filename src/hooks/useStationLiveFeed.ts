'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useRealtimeLink } from '@/hooks/useConnectionHealth';
import { getStationChannelName } from '@/lib/realtime/channels';
import {
  fetchStationLiveFeed,
  stationLiveFeedInfiniteQuery,
  stationLiveFeedQueryKey,
} from '@/lib/queries/station-live-feed';
import {
  stationFeedSourceRank,
  STATION_FEED_MAX_LIMIT,
  type StationFeedFilters,
  type StationFeedItem,
  type StationFeedResponse,
} from '@/lib/station-feed/types';

function sourceWatermarks(items: readonly StationFeedItem[], sal: number, ops: number, mobile: number) {
  let stationActivityId = sal;
  let opsEventId = ops;
  let mobileScanEventId = mobile;
  for (const item of items) {
    if (item.source === 'station_activity_log') stationActivityId = Math.max(stationActivityId, item.sourceId);
    else if (item.source === 'ops_event') opsEventId = Math.max(opsEventId, item.sourceId);
    else mobileScanEventId = Math.max(mobileScanEventId, item.sourceId);
  }
  return { stationActivityId, opsEventId, mobileScanEventId };
}

function compareItems(a: StationFeedItem, b: StationFeedItem, newest: boolean): number {
  const byTime = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
  if (byTime !== 0) return newest ? -byTime : byTime;
  const sourceA = stationFeedSourceRank(a.source);
  const sourceB = stationFeedSourceRank(b.source);
  if (sourceA !== sourceB) return sourceA - sourceB;
  return newest ? b.sourceId - a.sourceId : a.sourceId - b.sourceId;
}

function mergeNewestCatchup(
  current: InfiniteData<StationFeedResponse, string | null> | undefined,
  incoming: readonly StationFeedItem[],
  watermark: StationFeedResponse['watermark'],
): InfiniteData<StationFeedResponse, string | null> | undefined {
  if (!current?.pages.length) return current;
  const first = current.pages[0];
  const existing = new Set(current.pages.flatMap((page) => page.items.map((item) => item.id)));
  const additions = incoming.filter((item) => !existing.has(item.id)).sort((a, b) => compareItems(a, b, true));
  const firstItems = [...additions, ...first.items].slice(0, STATION_FEED_MAX_LIMIT);
  return {
    ...current,
    pages: [
      {
        ...first,
        items: firstItems,
        watermark: {
          stationActivityId: Math.max(first.watermark.stationActivityId, watermark.stationActivityId),
          opsEventId: Math.max(first.watermark.opsEventId, watermark.opsEventId),
          mobileScanEventId: Math.max(first.watermark.mobileScanEventId, watermark.mobileScanEventId),
        },
      },
      ...current.pages.slice(1),
    ],
  };
}

export function useStationLiveFeed(filters: StationFeedFilters) {
  const query = useInfiniteQuery(stationLiveFeedInfiniteQuery(filters));
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const realtime = useRealtimeLink();
  const key = stationLiveFeedQueryKey(filters);
  const channel = user?.organizationId ? getStationChannelName(user.organizationId) : '';
  const runningRef = useRef(false);
  const queuedRef = useRef(false);
  const lastRecoveryAtRef = useRef(Date.now());
  const priorHealthRef = useRef(realtime.health);

  const recover = useCallback(async () => {
    if (runningRef.current) {
      queuedRef.current = true;
      return;
    }
    runningRef.current = true;
    try {
      if (filters.sort === 'oldest') {
        await query.refetch({ cancelRefetch: false });
        lastRecoveryAtRef.current = Date.now();
        return;
      }
      const cached = queryClient.getQueryData<InfiniteData<StationFeedResponse, string | null>>(key);
      const first = cached?.pages[0];
      if (!first) {
        await query.refetch({ cancelRefetch: false });
        lastRecoveryAtRef.current = Date.now();
        return;
      }
      let after = { ...first.watermark };
      const incoming: StationFeedItem[] = [];
      let finalWatermark = first.watermark;
      for (let page = 0; page < 50; page += 1) {
        const delta = await fetchStationLiveFeed(filters, {
          afterSalId: after.stationActivityId,
          afterOpsEventId: after.opsEventId,
          afterMobileScanId: after.mobileScanEventId,
          limit: STATION_FEED_MAX_LIMIT,
          sortOverride: 'oldest',
        });
        incoming.push(...delta.items);
        finalWatermark = delta.watermark;
        const next = sourceWatermarks(delta.items, after.stationActivityId, after.opsEventId, after.mobileScanEventId);
        if (delta.items.length < STATION_FEED_MAX_LIMIT || (
          next.stationActivityId === after.stationActivityId
          && next.opsEventId === after.opsEventId
          && next.mobileScanEventId === after.mobileScanEventId
        )) break;
        after = next;
      }
      queryClient.setQueryData<InfiniteData<StationFeedResponse, string | null>>(key, (current) =>
        mergeNewestCatchup(current, incoming, finalWatermark));
      lastRecoveryAtRef.current = Date.now();
    } finally {
      runningRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void recover();
      }
    }
  }, [filters, key, query, queryClient]);

  useAblyChannel(channel, 'activity.logged', () => { void recover(); }, Boolean(channel), { coalesce: 'frame' });
  useAblyChannel(channel, 'ops.event.logged', () => { void recover(); }, Boolean(channel), { coalesce: 'frame' });
  useAblyChannel(channel, 'mobile.scan.logged', () => { void recover(); }, Boolean(channel), { coalesce: 'frame' });

  useEffect(() => {
    const prior = priorHealthRef.current;
    priorHealthRef.current = realtime.health;
    if (realtime.health === 'healthy' && prior !== 'healthy') void recover();
  }, [realtime.health, recover]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRecoveryAtRef.current >= 30_000) {
        void recover();
      }
    };
    const interval = window.setInterval(onFocus, 30_000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [recover]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages ?? []).flatMap((page) => page.items).filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [query.data?.pages]);

  return { ...query, items, realtime, recover };
}
