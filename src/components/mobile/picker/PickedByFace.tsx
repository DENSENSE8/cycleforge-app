'use client';

import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { formatMonthDayTimePST } from '@/utils/date';

/**
 * Who picked and when (owner 2026-10-08): the staff bubble (their colour and
 * initial), the name, then the pick's date · time in PT. The pick list paints
 * it right of the Picked status; the order screen in its Picked by row.
 */
export function PickedByFace({ staffId, name, at }: { staffId: number | null; name: string | null; at: string | null }) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      <StaffAvatar staffId={staffId} name={name} size="sm" colorRing alt="" />
      <span className="font-semibold text-text-default">{name ?? 'Unknown staff'}</span>
      {at ? (
        <time dateTime={at} className="tabular-nums text-text-muted">
          {formatMonthDayTimePST(at)}
        </time>
      ) : null}
    </span>
  );
}
