'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { HorizontalButtonSlider, type HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { Loader2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { usePackReviewQueue } from '@/features/review/usePackReviewQueue';
import { OutcomeChip } from '@/features/review/OutcomeChip';
import { isPackReviewBucket, type PackReviewBucket, type PackReviewQueueRow } from '@/lib/packing/pack-review-queue-types';

/** The four Review tabs = latest-outcome buckets (plan §4c). */
const QUEUE_TABS: HorizontalSliderItem[] = [
  { id: 'needs_review', label: 'Needs review' },
  { id: 'exceptions', label: 'Exceptions' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'approved', label: 'Approved today' },
];

const EMPTY_COPY: Record<PackReviewBucket, string> = {
  needs_review: 'No packed orders waiting on review.',
  exceptions: 'No capture exceptions right now.',
  flagged: 'Nothing flagged.',
  approved: 'Nothing approved yet today.',
};

/**
 * Review station sidebar — the queue navigator for `/review?mode=packer`
 * (Workbench recipe). No search band (the global header pill owns search); the
 * four bucket tabs + the latest-outcome list ARE the navigation. Selection is
 * URL-addressable (`?packerLogId=`) and clears on tab switch; the right pane
 * (ReviewWorkspace) reads the same params. Plan §4c.
 */
export function ReviewSidebarPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawBucket = searchParams.get('rtab');
  const bucket: PackReviewBucket = isPackReviewBucket(rawBucket) ? rawBucket : 'needs_review';
  const selectedId = Number(searchParams.get('packerLogId')) || null;

  const { data: rows = [], isLoading, isError } = usePackReviewQueue(bucket);

  const setBucket = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'needs_review') params.delete('rtab');
    else params.set('rtab', next);
    // Mode-scoped: a selection from one tab must not bleed into another.
    params.delete('packerLogId');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const selectRow = (packerLogId: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('packerLogId', String(packerLogId));
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <SidebarShell
      headerRows={[
        <HorizontalButtonSlider
          key="review-tabs"
          items={QUEUE_TABS}
          value={bucket}
          onChange={setBucket}
          variant="nav"
          dense
          aria-label="Review queue"
        />,
      ]}
      bodyClassName="pb-6"
    >
      {isLoading ? (
        <div className="flex items-center gap-2 px-1 py-3 text-role-caption font-semibold text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption font-semibold text-text-muted">
          Could not load the review queue.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-soft bg-surface-sunken px-4 py-6 text-center text-role-caption font-semibold text-text-muted">
          {EMPTY_COPY[bucket]}
        </div>
      ) : (
        <ul className="divide-y divide-border-hairline">
          {rows.map((row) => (
            <li key={row.packerLogId}>
              <ReviewQueueRow
                row={row}
                active={row.packerLogId === selectedId}
                onSelect={() => selectRow(row.packerLogId)}
              />
            </li>
          ))}
        </ul>
      )}
    </SidebarShell>
  );
}

function ReviewQueueRow({
  row,
  active,
  onSelect,
}: {
  row: PackReviewQueueRow;
  active: boolean;
  onSelect: () => void;
}) {
  const title = row.orderId || `PL-${row.packerLogId}`;
  const trackingLast4 = (row.tracking || row.detectedTracking || '').slice(-4);
  return (
    // A full-width list-row selector — the Button primitive is for actions, not
    // navigable rows; house queue-row selection is background + ring only.
    <button
      type="button" /* ds-raw-button */
      onClick={onSelect}
      className={cn(
        'w-full rounded-md px-1.5 py-1.5 text-left transition-colors',
        active ? 'bg-blue-50 ring-1 ring-inset ring-blue-400' : 'hover:bg-surface-hover',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-role-caption font-bold text-text-default">{title}</p>
        <OutcomeChip outcome={row.outcome} />
      </div>
      <p className="mt-0.5 truncate text-role-micro font-semibold uppercase tracking-widest text-text-muted">
        {row.productTitle || 'Packed order'}
        {trackingLast4 ? ` · ····${trackingLast4}` : ''}
      </p>
    </button>
  );
}
