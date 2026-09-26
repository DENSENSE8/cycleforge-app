/**
 * `SkuLedgerTableRow → CompoundRowView` — pure, strings and enums, no JSX.
 *
 * The family's ONLY contribution to how a stock movement paints. Every fact it
 * does not name here is a bound SLOT resolved through `sku-ledger-resolve.ts`.
 *
 * ## What the compound row says about one movement
 *
 * - TITLE — the REASON, through `takeReasonLedgerLabel` (a phone take reads
 *   `Taken · FBA`, not `TAKE_FBA`). A ledger row is an event, and what an
 *   operator scans a stock history for is why the number changed.
 * - the note line — the `notes` somebody wrote about the movement (a custom
 *   take's own words: `Taken` over `Returned to vendor`). A row with no note
 *   falls back to the signed CHANGE in words: `delta` is bound to `status:1`,
 *   so that fallback only matters to an org that unbinds the track, and it is
 *   the one fact a ledger row cannot be read without.
 * - IDS — the ORDER behind the movement. No tracking line: a ledger entry has
 *   no carrier, and inventing one would paint a chip over a fact this feed does
 *   not have.
 * - STATE — the DIMENSION (`WAREHOUSE` | `BOXED`), verbatim. A closed
 *   vocabulary is a pill, and it is a BUCKET rather than a lifecycle, so both
 *   words read `neutral`: tone is never the fact, and neither bucket is more
 *   urgent than the other. The direction of the movement is in the sign of
 *   `delta`, not in the pill's colour.
 * - DATES — the stamp, on BOTH lines: the civil day on the Hash line and the
 *   clock face (with seconds) on the Calendar line. The retired cell printed
 *   `toLocaleString()` — day and time to the second — and on an authoritative
 *   ledger the second is the point: two movements a heartbeat apart are a
 *   different story from two an hour apart, and `SUM(delta)` is only auditable
 *   if the order of the entries is readable. Putting the clock in the Hash tip
 *   and leaving the Calendar line `--` would lose it (the kiosk dwell rule).
 *
 * There is no money, no photo and no deadline on a ledger row; all three stay
 * null and the shared cells paint the honest empty face. A signed QUANTITY is
 * not an amount — see the catalog docblock on `amountFieldId`.
 */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { SkuLedgerTableRow } from '@/lib/inventory/sku-ledger-row';
import {
  skuLedgerDeltaText,
  skuLedgerReasonText,
} from '@/lib/tables/field-catalog/sku-ledger-resolve';

/**
 * A ledger entry is a record of stock that already moved. Nothing on this desk
 * can act on it, and neither quantity bucket is an exception waiting for a
 * human — so the pill carries the word and no urgency.
 */
const LEDGER_TONE: CompoundStateTone = 'neutral';

/** What the pill says when a row names no dimension (defended, not expected). */
const UNKNOWN_DIMENSION_LABEL = 'Unknown bucket';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The Calendar (secondary) line of the DATES cell — time of day to the second.
 *
 * Exported because it IS the precision the retired `toLocaleString()` cell
 * carried and the test pins it: a face that quietly dropped the seconds would
 * read as a formatting choice rather than as the regression it is.
 */
export function skuLedgerClockFace(iso: string | null | undefined): string | null {
  const d = parseInstant(iso);
  return d ? format(d, 'h:mm:ss a') : null;
}

export function skuLedgerCompoundView(row: SkuLedgerTableRow): CompoundRowView {
  const reason = skuLedgerReasonText(row.reason);
  const dimension = str(row.dimension);
  const instant = parseInstant(row.created_at);
  const day = instant
    ? { label: format(instant, 'MMM d'), dateKey: format(instant, 'yyyy-MM-dd') }
    : null;
  const clock = skuLedgerClockFace(row.created_at);
  const stamp = day && clock ? `${day.label} · ${clock}` : (day?.label ?? clock);

  return {
    id: String(row.id),
    thumbUrl: null,
    // A row with no reason is a malformed write (the column is NOT NULL); name
    // it by its own id rather than painting "Untitled" over the one fact it
    // definitely has.
    title: reason ?? `Ledger #${row.id}`,
    note: str(row.notes) ?? skuLedgerDeltaText(row.delta),
    orderId: str(row.ref_order_id),
    tracking: null,
    // No marketplace and no carrier behind a stock movement: the identity chip
    // must not borrow a brand dot from another family's vocabulary.
    platformValue: null,
    carrier: null,
    stateLabel: dimension ?? UNKNOWN_DIMENSION_LABEL,
    stateTone: LEDGER_TONE,
    orderedAt: day ? { label: day.label, tip: stamp ?? day.label, dateKey: day.dateKey } : null,
    // Explicit Hash hover SoT — this family names the chip, so the engine must
    // not prefix "Start date" onto a line that is a write stamp.
    ...(stamp ? { startedHover: stamp } : null),
    // Calendar line = the clock face. Not a deadline: `days: 0` / not overdue
    // is the honest answer for a desk with no due dates at all.
    delay: clock ? { days: 0, overdue: false, faceLabel: clock } : null,
    delayTip: stamp ?? undefined,
    amount: null,
  };
}
