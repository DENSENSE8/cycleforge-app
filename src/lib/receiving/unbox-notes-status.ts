/**
 * Floor-speed status exacts for the Unbox notes Info dialog.
 * Stamps come from the open receiving line — not a second activity engine.
 */

import { formatDateTimePST } from '@/utils/date';
import { formatStagedLocationFace } from './recent-staged-location';

type LineStatusExact = {
  key: string;
  title: string;
  meta: string;
  at: string;
};

export type LineStatusExactSource = {
  received_at?: string | null;
  received_by_name?: string | null;
  unbox_opened_at?: string | null;
  unboxed_at?: string | null;
  unboxed_by_name?: string | null;
  received_done_at?: string | null;
  label_printed_at?: string | null;
  staged_at?: string | null;
  staged_location_name?: string | null;
  staged_location_barcode?: string | null;
  staged_location_room?: string | null;
  /**
   * Bin code AS STAMPED at putaway. Preferred over the joined live columns so a
   * later rename of the bin cannot rewrite what this stamp says.
   */
  staged_location_code?: string | null;
  staged_by_name?: string | null;
};

/**
 * One stamp row. Trailing facts are joined after the exact time — a stamp can
 * carry more than one (Staged shows the bin AND who confirmed it), and blanks
 * are dropped rather than painting an empty separator.
 */
function pushStamp(
  out: LineStatusExact[],
  key: string,
  title: string,
  at: string | null | undefined,
  ...extras: (string | null | undefined)[]
): void {
  const stamp = (at || '').trim();
  if (!stamp) return;
  const exact = formatDateTimePST(stamp);
  const facts = extras.map((e) => (e || '').trim()).filter(Boolean);
  out.push({
    key,
    title,
    meta: [exact, ...facts].join(' · '),
    at: stamp,
  });
}

export function buildLineStatusExacts(
  row: LineStatusExactSource,
): LineStatusExact[] {
  const out: LineStatusExact[] = [];
  pushStamp(out, 'door-scan', 'Door scan', row.received_at, row.received_by_name);
  pushStamp(out, 'opened', 'Opened for unbox', row.unbox_opened_at);
  pushStamp(out, 'unboxed', 'Unboxed', row.unboxed_at, row.unboxed_by_name);
  pushStamp(out, 'received', 'Received', row.received_done_at);
  pushStamp(out, 'printed', 'Label printed', row.label_printed_at);
  // Snapshot first: `staged_location_code` is what the operator confirmed at
  // the time. Only fall back to the live join for rows stamped before the
  // snapshot column was populated.
  const loc =
    (row.staged_location_code || '').trim() ||
    formatStagedLocationFace({
      name: row.staged_location_name,
      barcode: row.staged_location_barcode,
      room: row.staged_location_room,
    });
  pushStamp(out, 'staged', 'Staged', row.staged_at, loc || null, row.staged_by_name);
  return out;
}
