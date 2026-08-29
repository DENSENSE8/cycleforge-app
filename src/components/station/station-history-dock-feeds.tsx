'use client';

/**
 * Per-station adapters for {@link StationHistoryDock}.
 *
 * Each scan station already has a history feed; what they do not share is a row
 * SHAPE — a tech log, a pack log and a receiving line name different things and
 * carry different ids. So each station maps its own feed into
 * {@link StationHistoryDockEntry} here, and the dock renders one face for all of
 * them.
 *
 * That split is the point. A shared face is what stops six benches from teaching
 * six slightly different reading orders for the same glance ("did that scan
 * land?"), while a shared FEED would have meant inventing a union row type that
 * every station half-fills — the mega-row the table plan bans, one level down.
 *
 * Adapters are deliberately thin and pure: they take the feed's rows and return
 * entries. No fetching happens here; the station's existing query stays its own.
 */

import { useMemo } from 'react';

/** The one row shape the dock draws: a time, a thing, and optionally who. */
export interface StationHistoryDockEntry {
  key: string;
  /** Short local time — "14:32". */
  time: string;
  /** The thing scanned; the dock truncates and titles it. */
  identifier: string;
  /** One quiet line beneath (staff, status, quantity). */
  meta?: string;
  /** Stable record id, so a caller can open it. */
  recordId?: string | number;
}

/**
 * `2026-08-29T14:32:11Z` → `14:32`, in the viewer's zone.
 *
 * Local rather than PST-civil: this answers "did the scan I just made land",
 * which is a question about the clock on the wall in front of the operator, not
 * about which fulfilment day a row belongs to. The civil-date SoT still owns
 * every date that means a DAY.
 */
export function dockTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Rows a dock shows before it starts scrolling past usefulness. */
const DOCK_LIMIT = 60;

interface TechLikeRecord {
  id: number;
  created_at: string;
  order_id?: string | null;
  serial_number?: string | null;
  shipping_tracking_number?: string | null;
  product_title?: string | null;
}

/**
 * Tech / Testing / Shipping benches — all three read `TechRecord`-shaped logs.
 *
 * The identifier prefers the ORDER, then the serial, then the tracking: an
 * operator at these benches is scanning against an order, and a serial or a
 * tracking number is what they fall back to when the order is not yet known.
 */
export function useTechStationDockEntries(
  records: readonly TechLikeRecord[] | undefined,
  getStaffName?: (id: number) => string | undefined,
  staffIdOf?: (record: TechLikeRecord) => number | undefined,
): StationHistoryDockEntry[] {
  return useMemo(() => {
    if (!records?.length) return [];
    return records.slice(0, DOCK_LIMIT).map((r) => {
      const staffId = staffIdOf?.(r);
      const who = staffId != null ? getStaffName?.(staffId) : undefined;
      return {
        key: String(r.id),
        recordId: r.id,
        time: dockTime(r.created_at),
        identifier:
          r.order_id?.trim() ||
          r.serial_number?.trim() ||
          r.shipping_tracking_number?.trim() ||
          `#${r.id}`,
        meta: [who, r.product_title?.trim()].filter(Boolean).join(' · ') || undefined,
      };
    });
  }, [records, getStaffName, staffIdOf]);
}

interface ReceivingLikeRow {
  id: number | string;
  received_at?: string | null;
  created_at?: string | null;
  item_number?: string | null;
  product_title?: string | null;
  po_number?: string | null;
  quantity?: number | null;
}

/**
 * Unbox / Arrival benches — receiving lines.
 *
 * The identifier prefers the ITEM NUMBER: an operator unboxing is matching what
 * is in their hand to a line, and the item number is what is printed on it. The
 * PO and the quantity go to the meta line because they answer "which delivery"
 * and "how many", which are the follow-up questions, not the first one.
 */
export function useReceivingStationDockEntries(
  rows: readonly ReceivingLikeRow[] | undefined,
): StationHistoryDockEntry[] {
  return useMemo(() => {
    if (!rows?.length) return [];
    return rows.slice(0, DOCK_LIMIT).map((r) => ({
      key: String(r.id),
      recordId: r.id,
      time: dockTime(r.received_at ?? r.created_at),
      identifier: r.item_number?.trim() || r.product_title?.trim() || `#${r.id}`,
      meta:
        [r.po_number?.trim(), r.quantity != null ? `×${r.quantity}` : null]
          .filter(Boolean)
          .join(' · ') || undefined,
    }));
  }, [rows]);
}
