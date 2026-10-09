/** Adapter: a {@link PackerRecord} → shared `RailRowVM` slots for the Packing sidebar recent-packs rail. */

import type { PackerRecord } from '@/hooks/usePackerLogs';
import type { RailRowVM } from '@/components/sidebar/rail-shell/RailRowBody';
import { normalizeProductTitle } from '@/components/station/tech-record-mappers';
import {
  resolveStationSource,
  SOURCE_DOT_BG,
  SOURCE_DOT_LABEL,
} from '@/utils/source-dot';
import { conditionSentenceLabel, EMPTY_META_DASH, orderRowConditionLabel } from '@/lib/conditions';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';

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

export function packerRecordToRailVM(record: PackerRecord): RailRowVM {
  // Marketplace titles often arrive ALL CAPS; the rail reads sentence case (mixed-case titles pass through).
  const title = sentenceCaseLabel(normalizeProductTitle(record.product_title)) || 'Unknown product';
  const qty = Math.max(1, parseInt(String(record.quantity || '1'), 10) || 1);
  // Condition resolves through the SoT (`src/lib/conditions.ts`) in sentence
  // case ("Used - A", never "USED - A"); empty / N/A stays the dash.
  const rawCondition = orderRowConditionLabel(String(record.condition || '').trim());
  const condition = rawCondition === EMPTY_META_DASH ? rawCondition : conditionSentenceLabel(rawCondition);

  return {
    title,
    titleAttr: title,
    meta: (
      <span className="block truncate font-semibold text-text-soft">
        {qty} · {condition}
      </span>
    ),
  };
}

/**
 * One rail row per package: every scan writes its own PACK activity row, so a
 * re-scan of a packed box yields a second row on the same `packer_log_id`.
 * Keep only the newest scan, so a re-scan moves the package to the top instead
 * of listing it twice. Rows without a packer log stay as they are.
 */
export function collapsePackerRailRows(rows: PackerRecord[]): PackerRecord[] {
  const newestByLog = new Map<number, PackerRecord>();
  for (const row of rows) {
    const logId = Number(row.packer_log_id ?? 0);
    if (!(logId > 0)) continue;
    const kept = newestByLog.get(logId);
    if (!kept || Date.parse(row.created_at) > Date.parse(kept.created_at)) newestByLog.set(logId, row);
  }
  return rows.filter((row) => {
    const logId = Number(row.packer_log_id ?? 0);
    return !(logId > 0) || newestByLog.get(logId) === row;
  });
}
