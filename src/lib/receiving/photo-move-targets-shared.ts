/**
 * Pure Move-photos search helpers — safe for client + unit tests.
 * Server search lives in `photo-move-targets.ts`.
 */

import { formatReturnSerialProductTitle } from '@/components/station/receiving-line-serials';
import { parsePoListSearch } from '@/lib/receiving/po-list-search';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { getLast8 } from '@/lib/copy-chip-format';

/** Parsed search intent — pure so unit tests stay DB-free. */
interface PhotoMoveSearchIntent {
  needle: string;
  /** Exact carton id from `R-<id>` / `RCV-<id>`. */
  receivingId: number | null;
  /**
   * Exact support_tickets.id from `#232` or a short bare digit string (≤8).
   * Long digit runs stay free-text (tracking).
   */
  ticketId: number | null;
  /** Free-text pattern for ILIKE (`%needle%`), null when exact-id path only. */
  pattern: string | null;
}

/** Classify the operator's Move-photos search string. */
export function parsePhotoMoveSearch(raw: string): PhotoMoveSearchIntent {
  const trimmed = String(raw || '').trim();
  // Detect `#232` BEFORE parsePoListSearch strips leading `#` (used for `#R-…`).
  const hashTicket = /^#(\d{1,12})$/.exec(trimmed);
  if (hashTicket) {
    const ticketId = Number(hashTicket[1]);
    return {
      needle: trimmed,
      receivingId: null,
      ticketId: Number.isFinite(ticketId) && ticketId > 0 ? ticketId : null,
      pattern: null,
    };
  }

  const { needle, receivingId } = parsePoListSearch(raw);
  if (!needle) {
    return { needle: '', receivingId: null, ticketId: null, pattern: null };
  }
  if (receivingId != null) {
    return { needle, receivingId, ticketId: null, pattern: null };
  }

  const bareTicket = /^(\d{1,8})$/.exec(needle);
  if (bareTicket) {
    const ticketId = Number(bareTicket[1]);
    return {
      needle,
      receivingId: null,
      ticketId: Number.isFinite(ticketId) && ticketId > 0 ? ticketId : null,
      pattern: `%${needle}%`,
    };
  }

  return {
    needle,
    receivingId: null,
    ticketId: null,
    pattern: `%${needle}%`,
  };
}

/** Carton picker title — {@link resolveSkuIdentityTitle}, the one ladder (`src/lib/sku/sku-identity-law.ts`): */
export function resolvePhotoMoveTargetTitle(row: {
  catalog_product_title?: string | null;
  zoho_item_title?: string | null;
  item_name?: string | null;
  sku?: string | null;
  zoho_item_id?: string | null;
}): string {
  const raw = resolveSkuIdentityTitle(row) || 'Unfound PO';
  return formatReturnSerialProductTitle(raw);
}

/** Operator-facing label for a hit (title → PO → ticket → tracking → carton handle). */
export function photoMoveTargetLabel(row: {
  title?: string | null;
  po_number?: string | null;
  po_id?: string | null;
  ticket_id?: number | null;
  tracking_number?: string | null;
  receiving_id: number;
}): string {
  const title = String(row.title || '').trim();
  if (title) return title;
  const po = String(row.po_number || row.po_id || '').trim();
  if (po) return po;
  if (row.ticket_id != null && row.ticket_id > 0) return `Ticket #${row.ticket_id}`;
  const tracking = String(row.tracking_number || '').trim();
  if (tracking) {
    return tracking.length > 8 ? `…${getLast8(tracking)}` : tracking;
  }
  return `R-${row.receiving_id}`;
}
