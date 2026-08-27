'use client';

/**
 * Session capture strip under the Arrival scan bar while batch-sort is armed.
 * Flat ledger chips — not chat bubbles.
 */

import { X } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import type { ArrivalBatchEntry } from '@/lib/receiving/arrival-batch-sort';
import { cn } from '@/utils/_cn';

interface ArrivalBatchCaptureStripProps {
  batch: ArrivalBatchEntry[];
  onRemove: (receivingId: number) => void;
  className?: string;
}

export function ArrivalBatchCaptureStrip({
  batch,
  onRemove,
  className,
}: ArrivalBatchCaptureStripProps) {
  if (batch.length === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 border-b border-border-soft bg-amber-50/80 px-3 py-2',
        className,
      )}
      role="list"
      aria-label={`Batch sort queue, ${batch.length} cartons`}
    >
      {batch.map((entry) => (
        <span
          key={entry.receivingId}
          role="listitem"
          className="inline-flex max-w-full items-center gap-1 rounded-md border border-amber-200 bg-surface-card px-1.5 py-0.5 text-role-caption font-semibold text-amber-900"
        >
          <span className="truncate">{entry.label}</span>
          <IconButton
            size="xs"
            tone="neutral"
            ariaLabel={`Remove ${entry.label} from batch`}
            icon={<X className="h-3.5 w-3.5" />}
            onClick={() => onRemove(entry.receivingId)}
            className="shrink-0 text-amber-700 hover:text-amber-950"
          />
        </span>
      ))}
    </div>
  );
}
