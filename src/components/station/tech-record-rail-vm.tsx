/**
 * Adapter: a History {@link TechRecord} → shared `RailRowVM` slots for the
 * Shipping sidebar personal recent rail. Matches TechRecordRow identity
 * (title / qty·condition) — not the old order ship-out chrome.
 */

import type { ReactNode } from 'react';
import type { TechRecord } from '@/hooks/useTechLogs';
import { hasUsableProductTitle } from '@/hooks/station/useTechTableController';
import { normalizeProductTitle } from '@/components/station/tech-record-mappers';
import type { RailRowVM } from '@/components/sidebar/rail-shell/RailRowBody';
import { getOrderIdLast4 } from '@/utils/upnext-helpers';
import {
  resolveStationSource,
  SOURCE_DOT_BG,
  SOURCE_DOT_LABEL,
} from '@/utils/source-dot';

export function techRecordRailTitle(record: TechRecord): string {
  return hasUsableProductTitle(record.product_title)
    ? normalizeProductTitle(record.product_title)
    : 'Unknown Product';
}

export function getTechRecordStatusDot(record: TechRecord): string {
  const { dotType } = resolveStationSource({
    orderId: record.order_id,
    accountSource: record.account_source,
    trackingType: record.fnsku ? 'FNSKU' : null,
    scanRef: record.shipping_tracking_number,
  });
  return SOURCE_DOT_BG[dotType];
}

export function getTechRecordStatusDotLabel(record: TechRecord): string {
  const { dotType } = resolveStationSource({
    orderId: record.order_id,
    accountSource: record.account_source,
    trackingType: record.fnsku ? 'FNSKU' : null,
    scanRef: record.shipping_tracking_number,
  });
  return SOURCE_DOT_LABEL[dotType];
}

function conditionLabel(record: TechRecord): string {
  const isFbaRow =
    record.account_source === 'fba' ||
    record.source_kind === 'fba_scan' ||
    String(record.order_id || '').toUpperCase() === 'FBA';
  const raw = String(record.condition || '').trim();
  if (isFbaRow) {
    if (!raw || /^fba\s*scan$/i.test(raw)) return 'N/A';
    return raw;
  }
  return raw || 'N/A';
}

export function techRecordToRailVM(record: TechRecord): RailRowVM {
  const title = techRecordRailTitle(record);
  const qty = Math.max(1, parseInt(String(record.quantity || '1'), 10) || 1);
  const condition = conditionLabel(record);
  const shortId = record.order_id ? getOrderIdLast4(record.order_id) : null;
  const channel = (record.account_source || '').trim() || null;
  const fnsku = String(record.fnsku || '').trim();

  let eyebrow: ReactNode | undefined;
  if (fnsku) {
    eyebrow = (
      <>
        <span className="font-mono font-bold text-text-muted truncate">{fnsku}</span>
        <span className="text-text-faint">·</span>
        <span className="truncate">FBA</span>
      </>
    );
  } else if (shortId || channel) {
    eyebrow = (
      <>
        {shortId ? (
          <span className="font-mono font-bold text-text-muted">#{shortId}</span>
        ) : null}
        {shortId && channel ? <span className="text-text-faint">·</span> : null}
        {channel ? <span className="truncate">{channel}</span> : null}
      </>
    );
  }

  return {
    eyebrow,
    title,
    meta: (
      <span className="block truncate font-semibold uppercase tracking-widest text-text-soft">
        {qty} · {condition}
      </span>
    ),
  };
}

/** Client-side filter for the shipping tech-log rail. */
export function filterTechRecordRailRows(rows: TechRecord[], query: string): TechRecord[] {
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
