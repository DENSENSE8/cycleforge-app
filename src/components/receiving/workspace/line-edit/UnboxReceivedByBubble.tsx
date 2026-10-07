'use client';

/** Unbox middle bubble (operator 2026-10-07): who received the carton at the door, and when. */

import { StaffCell } from '@/components/identity/StaffCell';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { formatDateTimePST } from '@/utils/date';

export function UnboxReceivedByBubble({
  row,
}: {
  row: Pick<ReceivingLineRow, 'received_by_id' | 'received_by_name' | 'received_at'>;
}) {
  const at = (row.received_at ?? '').trim();
  const hasStaff = row.received_by_id != null || Boolean(row.received_by_name?.trim());
  return (
    <div className="flex h-full flex-col justify-between gap-1" data-testid="unbox-received-by">
      <p className="text-role-eyebrow text-text-muted">Received by</p>
      {hasStaff ? (
        <StaffCell staffId={row.received_by_id ?? null} name={row.received_by_name} className="text-role-title" />
      ) : (
        <p className="text-role-body text-text-muted">{at ? 'Staff not recorded' : 'Not scanned in yet'}</p>
      )}
      <p className="text-role-body tabular-nums text-text-default">{at ? formatDateTimePST(at) : '—'}</p>
    </div>
  );
}
