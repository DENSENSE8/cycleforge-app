/** `BinUtilizationReportRow → CompoundRowView` — the bin-utilization adapter. */

import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import {
  binFillPercent,
  binHandle,
} from '@/lib/tables/field-catalog/report-bin-utilization-resolve';
import type { BinUtilizationReportRow } from '@/lib/reports/report-rows';
import { compoundIdentityFace } from '@/components/tables/compound/compound-row-model';

/** A utilization row is a measurement, not work waiting on a human, and nothing on this desk can act on it. */
const BIN_TONE: CompoundStateTone = 'neutral';

/** What the pill says when the MV carries no ratio for the bin. */
const FILL_UNKNOWN_LABEL = 'Fill unknown';

export function reportBinUtilizationCompoundView(
  row: BinUtilizationReportRow,
): CompoundRowView {
  const handle = binHandle(row);
  const percent = binFillPercent(row);

  return {
    id: String(row.bin_id),
    thumbUrl: null,
    // A bin the view has no room for is named by the one fact it definitely
    // has, rather than painting "Untitled" over a real row.
    title: row.room ?? `Bin #${row.bin_id}`,
    // Nothing under the title: the layout binds no subtitle, and the three
    // magnitudes are tracks. A fallback note here would repeat a column.
    note: null,
    // The Id track carries THIS family's handle, not an order:
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    identityFace: compoundIdentityFace(handle, 'Bin'),
    orderId: null,
    tracking: null,
    // No marketplace and no carrier behind a bin: the identity chip must not
    // borrow a brand dot from another family's vocabulary.
    platformValue: null,
    carrier: null,
    stateLabel: percent === null ? FILL_UNKNOWN_LABEL : `${percent}%`,
    stateTone: BIN_TONE,
    stateTip:
      row.capacity === null
        ? `${row.in_bin} in bin · no capacity set`
        : `${row.in_bin} of ${row.capacity}`,
    // This report has no temporal fact at all — see the grid layout's ruling on
    // the factless `dates` chrome.
    orderedAt: null,
    delay: null,
    amount: null,
  };
}
