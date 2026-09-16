/**
 * `BinUtilizationReportRow → CompoundRowView` — the bin-utilization adapter.
 *
 * Pure, strings and enums, no JSX: "the moment a family can pass a node, the
 * fork walks back in wearing a view model." Every fact not named here is a
 * bound SLOT resolved through `report-bin-utilization-resolve.ts`.
 *
 * ## What the compound row says about one bin
 *
 * - TITLE — the ROOM. A compound title is what the thing IS, and a bin's
 *   answer to that is where it is. A bin the MV has no room for is named by
 *   its own key rather than painted "Untitled".
 * - IDS — the bin's scannable HANDLE (`barcode ?? bin_name`), the retired Bin
 *   cell's coalesce. No tracking line: a bin has no carrier, and inventing one
 *   would paint a chip over a fact this feed does not have.
 * - STATE — the DERIVED fill percentage, the number the route orders by. The
 *   word carries the `%`; the FACT behind the header is the bare integer
 *   (`binFillPercent`), so the column sorts numerically and the search box
 *   matches what an operator types ("88", not "88%").
 * - DATES — nothing. This row has no temporal column, the track is declared
 *   inert chrome at the mount, and both lines stay null so the shared cell
 *   paints the honest empty face rather than a borrowed stamp.
 *
 * There is no money and no photo on a bin row either; both stay null.
 */

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

/**
 * A utilization row is a measurement, not work waiting on a human, and nothing
 * on this desk can act on it. Tone is never the fact; the pill's word is — and
 * banding the percentage into a tone would need thresholds this report does
 * not define.
 */
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
    // The Id track carries THIS family's handle, not an order: `identityFace`
    // paints it plainly and copyably, without the marketplace brand dot and
    // the open-on-platform menu `orderId` brings (operator 2026-09-14 — the
    // column is Id product-wide).
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
