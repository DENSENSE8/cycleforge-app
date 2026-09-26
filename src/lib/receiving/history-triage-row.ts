/**
 * Receiving history row helpers — unfound vs matched row state (the carton
 * record's alerts, the History context menu) and the grid column under a
 * context-menu target.
 */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ReceivingGridColumnKey } from '@/lib/receiving/receiving-grid-layout';

/** Intake carton with no linked PO (ORDER: —, QTY: 0/?, …). */
export function isHistoryUnfoundRow(row: ReceivingLineRow): boolean {
  const source = (row.receiving_source || '').trim().toLowerCase();
  if (source === 'unmatched') return true;
  const pairing = (row.pairing_state || '').trim().toUpperCase();
  if (pairing === 'UNFOUND') return true;
  const po = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
  return !po && source !== 'zoho_po' && source !== 'local_pickup';
}

/** Resolve the LedgerGrid column from a context-menu event target. */
export function resolveReceivingColFromTarget(
  target: EventTarget | null,
): ReceivingGridColumnKey | null {
  if (target == null || typeof target !== 'object') return null;
  const el = target as {
    closest?: (sel: string) => { getAttribute: (name: string) => string | null } | null;
  };
  if (typeof el.closest !== 'function') return null;
  const hit = el.closest('[data-col]');
  if (!hit) return null;
  const key = hit.getAttribute('data-col');
  if (!key || key === 'select' || key === '_fill') return null;
  return key as ReceivingGridColumnKey;
}
