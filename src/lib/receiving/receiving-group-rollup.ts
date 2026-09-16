/**
 * Group-band rollups (operator 2026-09-14, "implement all 1-3"):
 *
 * 1. STATUS rollup — the collapsed/expanded band carries a compound state pill
 *    summarizing its children ("2 RECEIVED", "1 RECEIVED · 1 UNBOXED"), worst
 *    child tone wins, so a group answers "does this need me?" without
 *    expanding. Industry-standard summary-row behavior (AG Grid row grouping /
 *    Airtable grouped aggregates).
 * 2. QTY rollup — receiving bands sum quantity_received / quantity_expected
 *    onto the under-title qty subtitle, the way To-ship already rolls
 *    qty + money (parentOrderLineTotals).
 *
 * Pure, DB-free: rows in, display facts out.
 */

import type {
  CompoundStateTone,
  CompoundSubtitlePart,
} from '@/components/tables/compound/compound-row-model';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { receivingStateTone } from '@/lib/receiving/receiving-compound-view';

const TONE_RANK: Record<CompoundStateTone, number> = { done: 1, neutral: 2, alert: 3 };

export interface StatusWordRollup {
  /** Band pill label — "2 RECEIVED" or "1 RECEIVED · 1 UNBOXED" (top 2 words). */
  label: string;
  /** Worst child tone — an exception anywhere paints the alert tone. */
  tone: CompoundStateTone;
  /** Hover tip — the full breakdown, every word counted. */
  tip: string;
}

/**
 * Count words, worst tone wins. Shared by every fold family so the band
 * grammar stays one grammar — only the WORD source and tone SoT are family
 * facts.
 */
export function statusWordRollup(
  words: readonly (string | null | undefined)[],
  toneFor: (word: string) => CompoundStateTone,
): StatusWordRollup {
  const byWord = new Map<string, number>();
  let worst: CompoundStateTone = 'done';
  for (const raw of words) {
    const word = String(raw || '').trim().toUpperCase();
    if (!word) continue;
    byWord.set(word, (byWord.get(word) ?? 0) + 1);
    const tone = toneFor(word);
    if (TONE_RANK[tone] > TONE_RANK[worst]) worst = tone;
  }
  const segments = [...byWord.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word, n]) => `${n} ${word}`);
  if (segments.length === 0) return { label: '', tone: 'neutral', tip: '' };
  const head = segments.slice(0, 2).join(' · ');
  const label = segments.length > 2 ? `${head} +${segments.length - 2}` : head;
  return { label, tone: worst, tip: segments.join(' · ') };
}

export interface ReceivingGroupRollup extends StatusWordRollup {
  /** Sum of the children's quantity_received. */
  qtyReceived: number;
  /** Sum of the children's quantity_expected. */
  qtyExpected: number;
}

/**
 * Receiving fold rollup: status words through the coarse vocabulary, tone via
 * the receiving three-tone SoT ({@link receivingStateTone} — applied to the
 * word so exception vocabulary keeps its alert), qty summed from the line
 * columns.
 */
export function receivingGroupRollup(rows: readonly ReceivingLineRow[]): ReceivingGroupRollup {
  const rollup = statusWordRollup(
    rows.map((row) => String(row.workflow_status || 'EXPECTED').toUpperCase()),
    (word) => receivingStateTone(word),
  );
  let qtyReceived = 0;
  let qtyExpected = 0;
  for (const row of rows) {
    const recv = Number(row.quantity_received);
    const exp = Number(row.quantity_expected);
    if (Number.isFinite(recv) && recv > 0) qtyReceived += Math.trunc(recv);
    if (Number.isFinite(exp) && exp > 0) qtyExpected += Math.trunc(exp);
  }
  return { ...rollup, qtyReceived, qtyExpected };
}

/**
 * The BAND's qty part — `received/expected`, NOT a bare number, so it must
 * not reuse {@link lineQtySubtitlePart}'s `widthCh: 2` slot (the leaf law): a
 * "3/3" face in a 2ch box is exactly the "3/3 is blocked off" clip the
 * operator reported (2026-09-14). Width fits the two counts plus the slash.
 */
export function bandQtyRollupPart(fieldId: string, received: number, expected: number): CompoundSubtitlePart {
  const text = `${received}/${expected}`;
  return {
    text,
    toneClass:
      expected > 0 && received >= expected
        ? 'font-semibold text-text-default'
        : 'font-semibold text-text-warning',
    key: fieldId,
    widthCh: Math.max(4, text.length),
  };
}

/** Orders/To-ship tone for the band state rollup — shipped words are done. */
export function ordersBandStateTone(word: string): CompoundStateTone {
  const s = word.toUpperCase();
  if (/EXCEPTION|HOLD|CANCEL|BLOCK|FAIL|SHORT|MISSING/.test(s)) return 'alert';
  if (/SHIPPED|DELIVERED|DONE|COMPLETE/.test(s)) return 'done';
  return 'neutral';
}
