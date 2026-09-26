'use client';

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { META_REST_COL, MetaFactSlot } from '@/components/ui/RowMetaColumns';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';
import { cn } from '@/utils/_cn';
import { formatDateTimePST, formatOpsStageTime } from '@/utils/date';

/** Dense row stage clock — same language as OrdersQueue / Shipped / Receiving history: */
export function RowStageTimeMeta({
  instant,
  label,
  tooltip,
  tooltipExtra,
  className,
  reserve = false,
}: {
  instant: string | Date | null | undefined;
  /** Stage noun for the tooltip, e.g. "Tested" / "Packed" / "Unboxed". */
  label: string;
  /** Full tooltip override (skips absolute + label composition). */
  tooltip?: string | null;
  /** Appended after the absolute primary line (` · …`). */
  tooltipExtra?: string | null;
  className?: string;
  reserve?: boolean;
}) {
  useTimeFormat();
  const empty = instant == null || instant === '';
  const display = empty ? null : formatOpsStageTime(instant);
  const hasDisplay = Boolean(display && display !== '--:--');

  if (!hasDisplay) {
    return reserve ? (
      <MetaFactSlot width={META_REST_COL.stageTime} className={className} reserve />
    ) : null;
  }

  const tip =
    (tooltip || '').trim() ||
    [
      `${label} ${formatDateTimePST(instant)}`,
      (tooltipExtra || '').trim() || null,
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <MetaFactSlot
      width={META_REST_COL.stageTime}
      className={cn('text-text-faint', className)}
      reserve={reserve}
    >
      <HoverTooltip label={tip} focusable={false} asChild>
        <span className="truncate tabular-nums">{display}</span>
      </HoverTooltip>
    </MetaFactSlot>
  );
}
