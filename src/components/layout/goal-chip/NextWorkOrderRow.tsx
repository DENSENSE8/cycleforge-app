'use client';

/**
 * "Your next work order" — the row, now the first band of the goal panel.
 *
 * ## Placement history, because it moved twice and the second move reverses part
 * of the first
 *
 * It began as `HeaderTopWorkOrderChip`, a permanent icon in the header's LEFT
 * nav cluster. Phase 5b deleted that chip and re-homed the row inside
 * `ActivityInboxPopover` on the reasoning that a queue depth belongs in the
 * "be told" channel and that a persistent top-right icon is earned by frequency.
 *
 * **That reasoning is unchanged and this is not a return to a permanent slot.**
 * The row is still not its own header occupant; it now shares ONE button with
 * the goal ring, so the header's slot count is the same as it was after 5b. What
 * changed is which panel it opens in — the pacing button, beside "how is my day
 * going", rather than the notification channel two clicks away.
 *
 * ## What did NOT happen: the ring did not absorb it
 *
 * The 2026-08-08 ring ruling stands. A ring encodes progress toward a target — a
 * bounded fraction — and a work order is a queue item with no denominator, so
 * merging it into the arc would have meant inventing one. It is a row in the
 * panel; the arc still means today's scans against today's goal, and nothing
 * else. Sharing a button is not sharing a metric.
 */

import Link from 'next/link';
import { ClipboardList, ChevronRight } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { formatDate } from '@/components/work-orders/types';
import { getDaysLateNullable } from '@/utils/date';
import type { NextWorkOrder } from './useNextWorkOrder';

function dueFace(deadlineAt: string | null): { label: string; overdue: boolean } {
  if (!deadlineAt) return { label: 'No deadline', overdue: false };
  const daysLate = getDaysLateNullable(deadlineAt);
  if (daysLate !== null && daysLate > 0) {
    return { label: daysLate === 1 ? '1d late' : `${daysLate}d late`, overdue: true };
  }
  return { label: `Due ${formatDate(deadlineAt, '—')}`, overdue: false };
}

export function NextWorkOrderRow({ top, onNavigate }: { top: NextWorkOrder; onNavigate?: () => void }) {
  const due = dueFace(top.deadlineAt);

  return (
    <div className="border-b border-border-hairline px-3.5 py-2.5">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">Your next work order</p>
      <Link
        href={top.sourcePath}
        onClick={onNavigate}
        className="group mt-1 flex items-center gap-2 rounded-none outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
      >
        <ClipboardList className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-role-caption font-semibold text-text-default">{top.title}</span>
          <span className="block truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
            {top.queueLabel} · {top.recordLabel}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 text-role-micro uppercase tracking-widest',
            due.overdue ? 'text-text-danger' : 'text-text-soft',
          )}
        >
          {due.label}
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint" />
      </Link>
    </div>
  );
}
