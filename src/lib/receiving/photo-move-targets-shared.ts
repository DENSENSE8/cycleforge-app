/**
 * Pure Move-photos search helpers — safe for client + unit tests.
 * Server search lives in `photo-move-targets.ts`.
 */

import { formatReturnSerialProductTitle } from '@/lib/receiving/receiving-line-serials';
import { parsePoListSearch } from '@/lib/receiving/po-list-search';

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

/**
 * Classify the operator's Move-photos search string.
 *
 * Carton handles win first (same as po/list). `#N` is always a ticket id.
 * Bare 1–8 digit strings are treated as ticket ids AND still searched as
 * free-text (PO / tracking / external ticket id / subject) via `pattern`.
 */
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

/**
 * Product-field face for the picker ladder. Empty / whitespace / the
 * `'Unfound PO'` stub sentinel are treated as missing so a later real field
 * (or the final fallback) can win — same idea as {@link isReceivingPoGroupTitleRow}.
 */
function productField(value?: string | null): string {
  const t = String(value || '').trim();
  if (!t || t === 'Unfound PO') return '';
  return t;
}

/**
 * Carton picker title — same product ladder as Unboxed rail
 * {@link receivingProductTitle}: catalog → Zoho item → listing item_name → sku.
 * PO identity stays on `PoChip`; never invent a platform · PO title here.
 * Generated return-serial titles paint last-8.
 */
export function resolvePhotoMoveTargetTitle(row: {
  catalog_product_title?: string | null;
  zoho_item_title?: string | null;
  item_name?: string | null;
  sku?: string | null;
  zoho_item_id?: string | null;
}): string {
  const raw =
    productField(row.catalog_product_title) ||
    productField(row.zoho_item_title) ||
    productField(row.item_name) ||
    productField(row.sku) ||
    productField(row.zoho_item_id) ||
    'Unfound PO';
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
    return tracking.length > 8 ? `…${tracking.slice(-8)}` : tracking;
  }
  return `R-${row.receiving_id}`;
}
