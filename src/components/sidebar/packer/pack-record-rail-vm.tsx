/**
 * Adapter: a {@link PackerRecord} → shared `RailRowVM` slots for the Packing
 * sidebar recent-packs rail. Sibling of `tech-record-rail-vm` (Shipping) and
 * `RecentActivityRailBase`'s receiving row body — the rail row anatomy,
 * truncation and vertical rhythm come from `RailRowBody`; this module only
 * supplies slot CONTENT and resolves presentation kinds via their SoTs.
 */

import type { PackerRecord } from '@/hooks/usePackerLogs';
import type { RailRowVM } from '@/components/sidebar/rail-shell/RailRowBody';
import { normalizeProductTitle } from '@/components/station/tech-record-mappers';
import {
  resolveStationSource,
  SOURCE_DOT_BG,
  SOURCE_DOT_LABEL,
} from '@/utils/source-dot';
import { orderRowConditionLabel } from '@/lib/conditions';

/** Source facets a pack row's dot resolves from (order vs SKU scan vs FBA). */
function packRecordSource(record: PackerRecord) {
  return resolveStationSource({
    orderId: record.order_id,
    accountSource: record.account_source,
    trackingType: record.tracking_type,
    scanRef: record.scan_ref,
  });
}

export function getPackerRecordStatusDot(record: PackerRecord): string {
  return SOURCE_DOT_BG[packRecordSource(record).dotType];
}

export function getPackerRecordStatusDotLabel(record: PackerRecord): string {
  return SOURCE_DOT_LABEL[packRecordSource(record).dotType];
}

function packerRecordRailTitle(record: PackerRecord): string {
  return normalizeProductTitle(record.product_title) || 'Unknown Product';
}

export function packerRecordToRailVM(record: PackerRecord): RailRowVM {
  const title = packerRecordRailTitle(record);
  const qty = Math.max(1, parseInt(String(record.quantity || '1'), 10) || 1);
  // Condition label resolves through the SoT (`src/lib/conditions.ts`) — never
  // a rail-local grade→label map.
  const condition = orderRowConditionLabel(String(record.condition || '').trim());

  return {
    title,
    titleAttr: title,
    meta: (
      <span className="block truncate font-semibold uppercase tracking-widest text-text-soft">
        {qty} · {condition}
      </span>
    ),
  };
}

/** Client-side filter over the loaded recent-packs rows. */
export function filterPackerRailRows(rows: PackerRecord[], query: string): PackerRecord[] {
  const trimmed = query.trim();
  if (!trimmed) return rows;
  const tokens = trimmed.toLowerCase().split(/\s+/);
  return rows.filter((row) => {
    const haystack = [
      row.product_title,
      row.sku,
      row.order_id,
      row.shipping_tracking_number,
      row.serial_number,
      row.item_number,
      row.account_source,
      row.fnsku,
      row.condition,
      String(row.id),
    ]
      .map((part) => String(part || '').toLowerCase())
      .join(' ');
    return tokens.every((token) => haystack.includes(token));
  });
}
