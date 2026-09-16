/**
 * `QueueRowRecord → CompoundRowView` — the Tech / Packer bench adapter. Pure,
 * strings and enums, no JSX.
 *
 * This is the whole of what the bench families contribute to the row. Before
 * the Wave C port the benches shipped `StationQueueRow` — a row COMPONENT that
 * wrapped `OrdersQueueTableRow`, defaulted its columns to the hand
 * `STATION_HISTORY_COLUMNS` array, and hardcoded `testerDisplay="---"` /
 * `packerDisplay="---"` because the flat tracks had no facts behind them. A row
 * component per family is the fork `ENGINE_IS_MONOMORPHIC` forbids; the names
 * now arrive as BOUND facts through the family catalogs (`tech.tested` /
 * `packer.packed` stage events), resolved by the family resolver.
 *
 * Faithfulness notes — this adapter paints what the bench painted, not more:
 *  · `stateLabel` is the row's SOURCE (platform origin), which is what the old
 *    `stage` track actually showed: `StationQueueRow` passed the source dot in
 *    as `rowStatus`. It is not a workflow stage.
 *  · `delay` is null. The bench passed `daysLate={null}`, so the flat `age` /
 *    "Late" track was always blank — a bench log has no ship-by to be late
 *    against. Painting a delay here would invent a fact.
 *
 * Callers: `useBenchSpreadsheet` → `DataTable`.
 */

import { format } from 'date-fns';
import type { CompoundRowView } from '@/components/tables/compound/compound-row-model';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import { resolveStationSource, SOURCE_DOT_LABEL } from '@/utils/source-dot';

/** Compact civil face for the Dates Hash line — no year (slot-table date law). */
function civilFace(iso: string | null | undefined): {
  label: string;
  dateKey: string | null;
} | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { label: format(d, 'MMM d'), dateKey: format(d, 'yyyy-MM-dd') };
}

export function benchRowCompoundView(row: QueueRowRecord): CompoundRowView {
  const source = resolveStationSource({
    orderId: row.order_id,
    accountSource: row.account_source,
    trackingType: row.tracking_type,
    scanRef:
      (typeof row.scan_ref === 'string' && row.scan_ref ? row.scan_ref : null) ??
      row.shipping_tracking_number ??
      '',
  });
  // The scan stamp — both mappers set `created_at` to it, and the day bands
  // read the same field, so the Hash line and the band cannot disagree.
  const scanned = civilFace(row.created_at as string | null | undefined);

  return {
    id: String(row.id),
    thumbUrl: null,
    title: String(row.product_title ?? '').trim() || 'Unknown Product',
    note: String(row.notes ?? '').trim() || null,
    orderId: String(row.order_id ?? '').trim() || null,
    tracking: String(row.shipping_tracking_number ?? '').trim() || null,
    platformValue: String(row.account_source ?? '').trim() || null,
    carrier: null,
    orderedAt: scanned
      ? {
          label: scanned.label,
          tip: `Scanned ${scanned.label}`,
          dateKey: scanned.dateKey,
        }
      : null,
    startedHover: scanned ? `Scanned ${scanned.label}` : undefined,
    stateLabel: SOURCE_DOT_LABEL[source.dotType],
    stateTone: 'neutral',
    delay: null,
    amount: null,
  };
}
