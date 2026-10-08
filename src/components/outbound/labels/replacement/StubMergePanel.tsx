'use client';

/**
 * When the same buyer carries the same SKU nearby, the duplicate rows offer a
 * one-click absorb into THIS order (`/api/orders/merge-stub`) — the
 * split-brain stub an unmatched tracking created stops being a second card on
 * the board.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives';
import type { PossibleDuplicateMatch } from '@/lib/orders/possible-duplicates';
import { formatDatePST } from '@/utils/date';

/** `GET /api/orders/[id]/possible-duplicates` cache key — the host refreshes it after a buy or void too. */
export const orderDuplicatesKey = (orderId: number) => ['order-duplicates', orderId] as const;

/** One absorbed candidate: the same buyer, the same SKU, a different order row. */
function StubMergeRow({
  match,
  targetOrderId,
  onMerged,
}: {
  match: PossibleDuplicateMatch;
  targetOrderId: number;
  onMerged: () => void;
}) {
  const queryClient = useQueryClient();
  const merge = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/orders/merge-stub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ stubOrderId: match.orderRowId, targetOrderId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || 'Could not merge the stub order.');
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderDuplicatesKey(targetOrderId) });
      onMerged();
    },
  });
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-2" data-testid="send-replacement-merge-row">
      <span className="shrink-0 font-mono text-sm font-semibold">{match.orderNumber}</span>
      <span className="min-w-0 flex-1 truncate text-role-caption">
        {match.sku || 'same SKU'}
        {match.orderDate ? ` · ${formatDatePST(match.orderDate, { shortYear: true })}` : ''}
      </span>
      <Button
        variant="ghost"
        size="sm"
        loading={merge.isPending}
        onClick={() => merge.mutate()}
        data-testid="send-replacement-merge-button"
      >
        Absorb into this order
      </Button>
      {merge.isError ? (
        <p className="w-full text-role-caption text-text-danger" role="alert">
          {merge.error instanceof Error ? merge.error.message : 'Could not merge the stub order.'}
        </p>
      ) : null}
    </li>
  );
}

export function StubMergePanel({
  orderId,
  enabled,
  onMerged,
}: {
  orderId: number;
  /** The host is open — only then is the duplicate check worth a request. */
  enabled: boolean;
  onMerged: () => void;
}) {
  const duplicates = useQuery({
    queryKey: orderDuplicatesKey(orderId),
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/possible-duplicates`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Could not check for duplicate orders.');
      return (await res.json()) as { ok: boolean; matches: PossibleDuplicateMatch[] };
    },
    enabled: enabled && orderId > 0,
    staleTime: 30_000,
  });
  const matches = (duplicates.data?.matches ?? []).filter((m) => m.orderRowId !== orderId);
  if (duplicates.isError || matches.length === 0) return null;
  return (
    <div className="rounded-mode-control border border-border-hairline p-2" data-testid="send-replacement-merge-panel">
      <p className="px-1 pb-1 text-role-caption text-text-muted">
        Same buyer, same SKU nearby — a split-brain stub absorbs into this order in one click.
      </p>
      <ul className="flex flex-col gap-1">
        {matches.map((match) => (
          <StubMergeRow key={match.orderRowId} match={match} targetOrderId={orderId} onMerged={onMerged} />
        ))}
      </ul>
    </div>
  );
}
