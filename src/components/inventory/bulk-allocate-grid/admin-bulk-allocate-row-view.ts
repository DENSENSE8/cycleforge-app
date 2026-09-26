/** `AllocationCandidateRow → CompoundRowView` — the bulk-allocate adapter. */

import {
  formatDateKeyMedium,
  formatDateKeyShort,
  getDaysLateNullable,
  toPSTDateKey,
} from '@/utils/date';
import {
  formatDayGap,
  type CompoundRowView,
  type CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import {
  candidateShortfallSentence,
  candidateStateWord,
  CANDIDATE_STATE_READY,
  type AllocationCandidateRow,
} from '@/lib/inventory/allocation-candidate-row';

/**
 * A candidate that can be allocated is finished work waiting to be taken; one
 * that cannot needs a human to find stock. Those are exactly the `done` and
 * `alert` tones, and the pill's WORD carries the distinction regardless.
 */
function stateTone(word: string): CompoundStateTone {
  return word === CANDIDATE_STATE_READY ? 'done' : 'alert';
}

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

/** DATES Hash line — the purchase day, falling back to the import stamp, with the tooltip naming WHICH. */
function orderedFace(
  row: AllocationCandidateRow,
): { label: string; tip: string; dateKey: string } | null {
  const placedKey = toPSTDateKey(row.order_date);
  if (placedKey && placedKey !== 'Unknown') {
    return {
      label: formatDateKeyShort(placedKey),
      tip: `Ordered · ${formatDateKeyMedium(placedKey, { weekday: 'short', withYear: true })}`,
      dateKey: placedKey,
    };
  }
  const importedKey = toPSTDateKey(row.created_at);
  if (!importedKey || importedKey === 'Unknown') return null;
  return {
    label: formatDateKeyShort(importedKey),
    tip:
      `Imported · ${formatDateKeyMedium(importedKey, { weekday: 'short', withYear: true })}` +
      ' · no order date came from the channel',
    dateKey: importedKey,
  };
}

export function adminBulkAllocateCompoundView(row: AllocationCandidateRow): CompoundRowView {
  const sku = str(row.sku);
  const word = candidateStateWord(row);
  const shortfall = candidateShortfallSentence(row);
  const ordered = orderedFace(row);
  // Whole warehouse-days since the order landed — the same helper the Orders
  // desk ages rows with, so "4d" means the same thing on both desks.
  const waited = ordered ? getDaysLateNullable(ordered.dateKey) : null;

  return {
    id: String(row.order_id),
    thumbUrl: null,
    // The candidate query guarantees a non-blank SKU, but a malformed row must
    // still name itself by the one fact it definitely has rather than painting
    // "Untitled" over a live order.
    title: sku ?? `Order #${row.order_id}`,
    // Fallback line only — the layout binds `qty` + `condition` as subtitles
    // and a bound subtitle replaces this. Says what grade the order wants when
    // an org unbinds both.
    note: str(row.condition),
    orderId: String(row.order_id),
    tracking: null,
    // No marketplace and no carrier on a candidate row: the identity chip must
    // not borrow a brand dot from another family's vocabulary.
    platformValue: null,
    carrier: null,
    stateLabel: word,
    stateTone: stateTone(word),
    // The retired disabled button's tooltip, preserved on the pill that
    // replaced its ink. `Ready` needs no explanation.
    ...(shortfall ? { stateTip: shortfall } : null),
    orderedAt: ordered
      ? { label: ordered.label, tip: ordered.tip, dateKey: ordered.dateKey }
      : null,
    // Explicit Hash hover SoT — this family names the chip (`Ordered ·` /
    // `Imported ·`), so the engine must not prefix "Start date" onto it.
    ...(ordered ? { startedHover: ordered.tip } : null),
    // Calendar line = how long this order has waited for units. Not a
    // deadline: `overdue: false` is the honest answer on a desk where nothing
    // has been promised a ship date yet.
    delay:
      waited === null
        ? null
        : { days: waited, overdue: false, faceLabel: `${formatDayGap(waited)} waiting` },
    ...(ordered ? { delayTip: `Waiting since ${ordered.tip}` } : null),
    amount: null,
  };
}
