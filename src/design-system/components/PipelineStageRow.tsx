'use client';

import { formatStageClockTimePST, formatDatePST } from '@/utils/date';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';

function hasStamp(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

export interface PipelineStageRowProps {
  label: string;
  at: string | null | undefined;
  staffName: string;
  emptyFallback: string;
  /** Provenance tag when the stamp is inherited from a later milestone (e.g. "At receive"). */
  note?: string;
  /** Render the inherited time softer, so a folded step doesn't read as a distinct stamp. */
  muted?: boolean;
}

/**
 * One milestone row under a pipeline stepper: stage label + attributed staff on
 * the left, date/time right-aligned tabular. Shared by the receiving carton
 * pipeline and the shipped order pipeline (Tested / Packed / Scanned Out).
 *
 * Attribution rides with the milestone: a stage's staff name shows ONLY when
 * that stage's own timestamp exists. A name without a timestamp (e.g. a stale
 * received_by while the carton is still pending) is misleading.
 */
export function PipelineStageRow({
  label,
  at,
  staffName,
  emptyFallback,
  note,
  muted = false,
}: PipelineStageRowProps) {
  // Re-render the instant the 12h/24h clock preference flips.
  useTimeFormat();
  const hasAt = hasStamp(at);
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{label}</p>
        {hasAt && staffName ? (
          <p className="truncate text-sm font-bold text-text-default">{staffName}</p>
        ) : (
          <p className="text-sm font-bold text-text-faint">—</p>
        )}
      </div>
      {hasAt ? (
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-role-eyebrow font-bold uppercase tracking-widest text-text-muted">
            {formatDatePST(at, { withLeadingZeros: true })}
          </p>
          <p className={`text-sm font-bold ${muted ? 'text-text-muted' : 'text-text-default'}`}>
            {formatStageClockTimePST(at)}
          </p>
          {note ? (
            <p className="text-role-eyebrow font-bold uppercase tracking-widest text-text-faint">{note}</p>
          ) : null}
        </div>
      ) : (
        <p className="shrink-0 text-role-eyebrow font-bold uppercase tracking-widest text-text-faint">
          {emptyFallback}
        </p>
      )}
    </div>
  );
}
