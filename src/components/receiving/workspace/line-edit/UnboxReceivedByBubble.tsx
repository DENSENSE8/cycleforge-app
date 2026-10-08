'use client';

/**
 * Unbox middle bubble: who scanned the carton in, and when (operator 2026-10-08).
 *
 * It read only the door stamp (`received_by` / `received_at`), which a carton
 * scanned straight into Unbox never gets — so a carton that WAS scanned in
 * said "Not scanned in yet". The actor is now the first stamp that exists,
 * in the order the floor touches a carton at Unbox: opened in Unbox (the
 * scan) → unboxed → first tracking scan → door receive.
 */

import { StaffCell } from '@/components/identity/StaffCell';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { formatDateTimePST } from '@/utils/date';

type ReceivedByRow = Pick<
  ReceivingLineRow,
  | 'unbox_opened_by_id'
  | 'unbox_opened_by_name'
  | 'unbox_opened_at'
  | 'unboxed_by_id'
  | 'unboxed_by_name'
  | 'unboxed_at'
  | 'scanned_by_id'
  | 'scanned_by_name'
  | 'scanned_at'
  | 'received_by_id'
  | 'received_by_name'
  | 'received_at'
>;

export function UnboxReceivedByBubble({ row }: { row: ReceivedByRow }) {
  const stamps = [
    { id: row.unbox_opened_by_id, name: row.unbox_opened_by_name, at: row.unbox_opened_at },
    { id: row.unboxed_by_id, name: row.unboxed_by_name, at: row.unboxed_at },
    { id: row.scanned_by_id, name: row.scanned_by_name, at: row.scanned_at },
    { id: row.received_by_id, name: row.received_by_name, at: row.received_at },
  ].map((s) => ({ id: s.id ?? null, name: s.name?.trim() || null, at: s.at?.trim() || null }));
  const actor = stamps.find((s) => s.id != null || s.name != null) ?? null;
  // The actor's own time first; a stamp that carries only a time still dates the scan.
  const at = actor?.at ?? stamps.find((s) => s.at != null)?.at ?? null;

  return (
    <div className="flex h-full flex-col justify-between gap-1" data-testid="unbox-received-by">
      <p className="text-role-eyebrow text-text-muted">Received by</p>
      {actor ? (
        <StaffCell staffId={actor.id} name={actor.name} className="text-role-title" />
      ) : (
        <p className="text-role-body text-text-muted">{at ? 'Staff not recorded' : 'Not scanned in yet'}</p>
      )}
      <p className="text-role-body tabular-nums text-text-default">{at ? formatDateTimePST(at) : '—'}</p>
    </div>
  );
}
