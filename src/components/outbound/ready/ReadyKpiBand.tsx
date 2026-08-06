'use client';

/**
 * Ready-stage KPI band — the disposition tiles pinned in the FBA sheet chrome
 * (Band 2) instead of scrolling in the body. Reads the same
 * `['outbound-ready-history', q]` query as {@link ReadyWorkspaceBody} (React
 * Query dedupes → one fetch) and the same `?rtab=` selection, so the tiles and
 * the table can never disagree. The tiles double as the disposition tab
 * selector (Recently tested · FBA · Pre-box · Hold).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ReadyKpiStrip } from '@/components/outbound/ready/ReadyKpiStrip';
import { fetchReadyHistory, readyHistoryQueryKey } from '@/components/outbound/ready/ready-history';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { useReadyWorkspaceTab } from '@/hooks/useReadyWorkspaceTab';
import { readyHistoryCounts } from '@/utils/ready-workspace-state';

export function ReadyKpiBand() {
  const { q } = useOutboundUrlState();
  const { readyTab, setReadyTab } = useReadyWorkspaceTab();
  const query = useQuery({
    queryKey: readyHistoryQueryKey(q),
    queryFn: () => fetchReadyHistory(q),
    staleTime: 15_000,
  });
  const counts = useMemo(() => readyHistoryCounts(query.data ?? []), [query.data]);

  return <ReadyKpiStrip counts={counts} activeTab={readyTab} onSelectTab={setReadyTab} />;
}
