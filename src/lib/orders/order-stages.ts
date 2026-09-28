/**
 * An order's Pick → QC → Pack stages — one reading shared by the card face,
 * its quick look and the full record, so every disclosure level names the
 * same actor, stamp and assignee. Pure (no React).
 *
 * Grain: Pick and QC belong to a LINE (each line is picked and checked on its
 * own); Pack belongs to the ORDER (the box goes out once).
 */

import type { ShippedOrder } from '@/types/orders';
import { resolveOrdersSlotValue } from '@/lib/tables/field-catalog/orders-resolve';
import { formatDateKeyShort, formatMonthDayTimePST, formatTime12hPST, toPSTDateKey } from '@/utils/date';

export type OrderStageKind = 'qc' | 'pick' | 'pack';

/** The floor's order: pull it off the shelf, check it, box it. */
export const ORDER_STAGE_KINDS = ['pick', 'qc', 'pack'] as const;

/** Why a stage cannot start. Pick only today: the line has no stock to pull. */
export type OrderStageBlock = 'out_of_stock';

/** A QC stage's unit verdict (see {@link OrderStage.verdict}). */
export type OrderStageVerdict = 'pass' | 'fail' | 'retest';

const QC_VERDICTS: Record<NonNullable<ShippedOrder['qc_verdict']>, OrderStageVerdict> = {
  PASS: 'pass',
  TESTING_FAILED: 'fail',
  TEST_AGAIN: 'retest',
};

export interface OrderStage {
  kind: OrderStageKind;
  /**
   * The stage's word: "Picked" / "QC'd" / "Packed" once done; "Pre-QC'd" when
   * {@link inherited}; "Out of stock" when {@link blocked}; else "Pick" / "QC" / "Pack".
   */
  label: string;
  done: boolean;
  /** Done: who did it. Not done: who it is ASSIGNED to (null = nobody). */
  who: string | null;
  staffId: number | null;
  /** Full PST stamp "Sep 27, 2:14 PM" — the Picked by / QC by / Packed by line. Null until done. */
  at: string | null;
  /**
   * One-column stamp for the card chip, from the RAW event timestamp: today
   * (PST) → time only ("2:14 PM"), an earlier day → date only ("Sep 27").
   * Null until done.
   */
  atShort: string | null;
  /**
   * QC only: the unit's latest verdict predates this order (`qc_inherited` — a
   * pre-tested unit pulled from stock); reads "Pre-QC'd". False for Pick / Pack.
   */
  inherited: boolean;
  /**
   * QC only: the latest bench verdict on a unit allocated to this line
   * (`qc_verdict`, testing_results) — `'pass'` / `'fail'` (TESTING_FAILED) /
   * `'retest'` (TEST_AGAIN). Null for Pick / Pack and while no unit was tested.
   */
  verdict: OrderStageVerdict | null;
  /**
   * Pick only: the line cannot be picked — `'out_of_stock'` when the card
   * model marks the line out of stock. Null for QC / Pack and for stocked lines.
   */
  blocked: OrderStageBlock | null;
}

export interface OrderStageOptions {
  /** PST date key for "today" — decides {@link OrderStage.atShort}'s time-vs-date face. */
  todayKey: string;
  /** Names a staff id from the directory (beats the wire's name). */
  staffName?: (id: number) => string;
  /** The line is out of stock → a pending pick reads {@link OrderStage.blocked}. */
  outOfStock?: boolean;
}

/** The raw timestamp the stage's stamp is read from (first usable candidate). */
function rawStageAt(row: ShippedOrder, kind: OrderStageKind): string | null {
  const candidates =
    kind === 'qc' ? [row.test_activity_at] : kind === 'pick' ? [row.picked_at] : [row.packed_at, row.pack_activity_at];
  for (const candidate of candidates) {
    const raw = String(candidate ?? '').trim();
    if (raw && toPSTDateKey(raw)) return raw;
  }
  return null;
}

/** Today → "2:14 PM"; an earlier day → "Sep 27". */
function shortStamp(raw: string | null, todayKey: string): string | null {
  if (!raw) return null;
  const day = toPSTDateKey(raw);
  if (!day) return null;
  return day === todayKey ? formatTime12hPST(raw, { withSeconds: false }) : formatDateKeyShort(day);
}

/**
 * One stage: pick / pack from the `orders.picked` / `orders.packed`
 * resolvers, QC from the latest bench verdict on a unit allocated to the line
 * (`tested_by` · `test_activity_at` · `qc_verdict`, testing_results). Named
 * from the staff directory, then the wire. Not done → the work assignment
 * (`picker_*` = the ORDER/PICK assignee, `packer_*` = the ORDER/PACK
 * assignee; `qc_assignee_*` = the QC tech assigned on the allocated unit's
 * origin receiving line).
 */
export function orderStage(row: ShippedOrder, kind: OrderStageKind, options: OrderStageOptions): OrderStage {
  const { todayKey, staffName, outOfStock = false } = options;
  let at: string | null;
  if (kind === 'qc') {
    const stamp = row.test_activity_at ? formatMonthDayTimePST(row.test_activity_at) : '—';
    at = stamp === '—' ? null : stamp;
  } else {
    const step = resolveOrdersSlotValue(row, kind === 'pick' ? 'orders.picked' : 'orders.packed');
    at = step?.kind === 'stage_event' ? (step.at ?? null) : null;
  }
  const done = at != null;
  const face = {
    qc: { labels: ["QC'd", 'QC'], actor: [row.tested_by, row.tested_by_name], assignee: [row.qc_assignee_id, row.qc_assignee_name] },
    pick: { labels: ['Picked', 'Pick'], actor: [row.picked_by, row.picked_by_name], assignee: [row.picker_id, row.picker_name] },
    pack: { labels: ['Packed', 'Pack'], actor: [row.packed_by, row.packed_by_name], assignee: [row.packer_id, row.packer_name] },
  }[kind];
  const [rawId, wireName] = done ? face.actor : face.assignee;
  const staffId = Number(rawId) > 0 ? Number(rawId) : null;
  const directory = staffId != null && staffName ? staffName(staffId).trim() : '';
  const who = (directory && directory !== '---' && !directory.startsWith('#') ? directory : '') || String(wireName ?? '').trim() || null;
  const verdict = kind === 'qc' && row.qc_verdict ? QC_VERDICTS[row.qc_verdict] ?? null : null;
  const inherited = kind === 'qc' && done && row.qc_inherited === true;
  const blocked: OrderStageBlock | null = kind === 'pick' && !done && outOfStock ? 'out_of_stock' : null;
  const label = inherited ? "Pre-QC'd" : done ? face.labels[0]! : blocked ? 'Out of stock' : face.labels[1]!;
  return {
    kind,
    label,
    done: done || inherited,
    who,
    staffId,
    at,
    atShort: done ? shortStamp(rawStageAt(row, kind), todayKey) : null,
    inherited,
    verdict,
    blocked,
  };
}

/** Where the order is now: the first stage still to do, else (all done) the last one. */
export function currentOrderStage(stages: readonly OrderStage[]): OrderStage {
  return stages.find((s) => !s.done) ?? stages[stages.length - 1]!;
}
