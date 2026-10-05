'use client';

/**
 * A pasted list's STATUS row on a page body (operator 2026-10-04): left-aligned
 * directly above the list's header row, never in the contextual sidebar. All ·
 * each bucket that holds a number (bare status words, counts) · Not found —
 * the list's own `BulkStatusChips` over the same `useBulkList` query the list
 * reads — and, with `facetParam`, the pressed bucket's reasons beside it
 * (`?recon_reason=` on Incoming). A press writes the list's status param; the
 * pressed chip is one gliding pill. The bar's small panel keeps its own
 * compact chips + sort (`NavBulkPanel`).
 */

import { useId } from 'react';
import { LayoutGroup } from '@/design-system/motion';
import type { BulkList } from '@/lib/nav/locate/use-bulk-list';
import { cn } from '@/utils/_cn';
import { BulkStatusChips, PillChip } from './NavBulkChips';
import { useReplaceSearchParams } from './useReplaceSearchParams';

export function PastedListStatusRow({
  list,
  facetParam = null,
  className,
}: {
  list: BulkList;
  /** The reason param inside a pressed bucket (each entry's `facet`); null = no reasons. */
  facetParam?: string | null;
  className?: string;
}) {
  const pillScope = useId();
  const replace = useReplaceSearchParams();
  if (list.selection.refs.length === 0) return null;
  const nowhere = list.entries.filter((entry) => !entry.pending && entry.buckets.length === 0).length;
  const reasons = facetParam ? bucketReasons(list) : [];
  const toggleReason = (id: string) =>
    replace((params) => {
      params.delete('page');
      if (list.facet === id) params.delete(facetParam!);
      else params.set(facetParam!, id);
    });
  return (
    <div data-pasted-list-status role="group" aria-label="Status" className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      <LayoutGroup id={pillScope}>
        <BulkStatusChips list={list} nowhere={nowhere} />
        {reasons.length > 0 ? (
          <span data-pasted-list-reasons role="group" aria-label="Reasons" className="flex flex-wrap items-center gap-1 border-l border-border-hairline pl-1">
            {reasons.map((reason) => (
              <PillChip
                key={reason.id}
                pill="reason"
                active={list.facet === reason.id}
                onClick={() => toggleReason(reason.id)}
                label={reason.label}
                count={reason.count}
              />
            ))}
          </span>
        ) : null}
      </LayoutGroup>
    </div>
  );
}

/** Why the pressed bucket's numbers sit there — each entry's `facet`, counted, in answer order. */
function bucketReasons(list: BulkList): { id: string; label: string; count: number }[] {
  const status = list.status;
  if (!status) return [];
  const byId = new Map<string, { id: string; label: string; count: number }>();
  for (const entry of list.entries) {
    if (!entry.facet || !entry.buckets.includes(status)) continue;
    const seen = byId.get(entry.facet.id);
    if (seen) seen.count += 1;
    else byId.set(entry.facet.id, { id: entry.facet.id, label: entry.facet.label, count: 1 });
  }
  return [...byId.values()];
}
