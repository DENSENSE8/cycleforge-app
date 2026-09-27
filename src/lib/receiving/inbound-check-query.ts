'use client';

/**
 * The ONE client read of the Check for a pasted Inbound list — the sidebar's
 * popout and the ledger's status chips / filter share this query key, so a
 * paste costs one Check, never two. The `view=reconcile` rows ride the
 * table's own key (`receivingReconcileRowsQuery`) for the warehouse-only
 * fallback in `reconcileCheck` — still one fetch.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CheckZohoReceivedRow } from '@/lib/receiving/check-zoho-received';
import { receivingReconcileRowsQuery } from '@/lib/queries/receiving-queries';
import { reconcileCheck, type ReconEntry, type RefSelection } from '@/lib/receiving/reconcile';

const CHECK_ENDPOINT = '/api/receiving-lines/incoming/check-zoho-received';

interface CheckResponse {
  success?: boolean;
  error?: string;
  received_in_zoho?: CheckZohoReceivedRow[];
  not_received_in_zoho?: CheckZohoReceivedRow[];
  undetermined?: CheckZohoReceivedRow[];
}

async function fetchCheckRows(refs: readonly string[], signal: AbortSignal): Promise<CheckZohoReceivedRow[]> {
  const res = await fetch(CHECK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackings: refs }),
    signal,
  });
  const data = (await res.json().catch(() => null)) as CheckResponse | null;
  if (!res.ok || !data?.success) throw new Error(data?.error || `Check failed (${res.status})`);
  return [...(data.received_in_zoho ?? []), ...(data.not_received_in_zoho ?? []), ...(data.undetermined ?? [])];
}

export interface InboundCheck {
  /** One per pasted number, in paste order. Empty while there is no list. */
  entries: ReconEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useInboundCheck(selection: RefSelection): InboundCheck {
  const refsKey = selection.refs.join(',');
  const query = useQuery({
    queryKey: ['inbound-check', refsKey],
    queryFn: ({ signal }) => fetchCheckRows(selection.refs, signal),
    enabled: selection.refs.length > 0,
    // The Check may ask Zoho live; a re-render must never ask again.
    staleTime: 5 * 60_000,
  });
  const rows = useQuery({
    ...receivingReconcileRowsQuery(selection.refs),
    enabled: selection.refs.length > 0,
  });
  const entries = useMemo(
    () =>
      selection.refs.length > 0
        ? reconcileCheck(selection, query.data ?? [], rows.data?.receiving_lines ?? [])
        : [],
    // `selection` is rebuilt from the URL each render; its refs are the identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refsKey, query.data, rows.data],
  );
  return {
    entries,
    // The verdict needs both reads: before the rows land, a warehouse-only
    // number would flash "No match anywhere".
    loading: (query.isPending || rows.isPending) && selection.refs.length > 0,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: () => void query.refetch(),
  };
}
