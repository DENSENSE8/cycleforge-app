'use client';

/** Earlier tracking numbers of the order, folded behind "n earlier". */

import { useId, useState } from 'react';
import { ChevronDown, History } from '@/components/Icons';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { useOrderTrackingHistory } from './tracking-history-client';

const REASON_FACE = { replaced: 'Replaced', voided: 'Voided', unlinked: 'Removed' } as const;

export function TrackingHistory({ orderId, current }: { orderId: number; current: string | null }) {
  const { data: entries = [] } = useOrderTrackingHistory(orderId, current);
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col" data-testid="tracking-history">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          RECORD_LABEL_CLASS,
          'ds-raw-button inline-flex w-fit items-center gap-1 rounded-mode-control px-1 py-0.5 text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
          focusRing('control'),
        )}
      >
        <History className="h-3.5 w-3.5" aria-hidden />
        {entries.length} earlier
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <ol id={listId} className="flex flex-col divide-y divide-mode-divide">
          {entries.map((e) => (
            <li key={`${e.trackingNumber}-${e.replacedAt}`} className="flex min-w-0 items-baseline gap-2 px-1 py-1">
              <span className={cn(RECORD_ID_CLASS, 'truncate text-mode-muted line-through')}>{e.trackingNumber}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-mode-muted">
                {[REASON_FACE[e.reason], e.replacedBy, formatMonthDayTimePST(e.replacedAt)].filter(Boolean).join(' · ')}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
