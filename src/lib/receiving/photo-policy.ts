/** Receiving photo-policy evaluator — the completion-insurance SoT for the `receiving.photoPolicy` org setting (WS-PHOTO Plan 5,… */

import type { ReceivingPhotoPolicy } from '@/lib/settings/accessors';
import { receivingStageFromPhotoType } from '@/lib/receiving/photo-intent';

export interface ReceivingCartonPhotoCounts {
  /** Arrival package shots (`receiving_package` + legacy alias) on the carton. */
  package: number;
  /** Unbox carton shots (`receiving_unbox_carton`) on the carton. */
  unboxCarton: number;
}

export interface ReceivingLinePhotoCount {
  lineId: number;
  /** Line SKU for blocker copy; null/blank falls back to `line #<id>`. */
  sku: string | null;
  /** Item shots primary-linked to this RECEIVING_LINE. */
  itemCount: number;
}

export interface EvaluateReceivingPhotoPolicyInput {
  policy: ReceivingPhotoPolicy;
  cartonPhotoCounts: ReceivingCartonPhotoCounts;
  /** Non-cancelled lines only — see the caller contract above. */
  linePhotoCounts: ReceivingLinePhotoCount[];
}

export interface ReceivingPhotoPolicyResult {
  ok: boolean;
  /** Operator-readable reasons; empty exactly when `ok`. */
  blockers: string[];
}

/** ≥1 real photo — non-finite / negative counts are no evidence. */
function hasEvidence(count: number): boolean {
  return Number.isFinite(count) && count >= 1;
}

/** Distinct SKUs named before the list truncates to `+N more`. */
const MAX_BLOCKER_SKUS = 2;

/** Display name for a line in blocker copy. */
function lineDisplayName(line: ReceivingLinePhotoCount): string {
  const sku = line.sku?.trim();
  return sku ? sku : `line #${line.lineId}`;
}

/**
 * `"3 lines need item photos: SKU-A, SKU-B, +1 more"` — line count is exact;
 * display names are de-duplicated, kept in input order, and truncated past
 * {@link MAX_BLOCKER_SKUS} (`+N more` counts the hidden distinct names).
 */
function perItemBlocker(missing: ReceivingLinePhotoCount[]): string {
  const names = [...new Set(missing.map(lineDisplayName))];
  const shown = names.slice(0, MAX_BLOCKER_SKUS);
  const hidden = names.length - shown.length;
  const head =
    missing.length === 1
      ? '1 line needs an item photo'
      : `${missing.length} lines need item photos`;
  return `${head}: ${shown.join(', ')}${hidden > 0 ? `, +${hidden} more` : ''}`;
}

/** One row of the receiving-photos list (`caption` IS `photos.photo_type` in that payload). */
interface ReceivingPhotoStageCountRow {
  /** Absent/null = carton-linked; a number = line-linked (item evidence). */
  receivingLineId?: number | null;
  caption: string | null;
}

interface ReceivingPhotoStageCounts {
  cartonPhotoCounts: ReceivingCartonPhotoCounts;
  /** Item shots per RECEIVING_LINE id — entity-only per the identity law. */
  itemCountsByLineId: ReadonlyMap<number, number>;
}

/** Client-side twin of the gate's SQL count assembly: */
export function deriveReceivingPhotoStageCounts(
  rows: readonly ReceivingPhotoStageCountRow[] | null | undefined,
): ReceivingPhotoStageCounts {
  const cartonPhotoCounts: ReceivingCartonPhotoCounts = { package: 0, unboxCarton: 0 };
  const itemCountsByLineId = new Map<number, number>();
  for (const row of rows ?? []) {
    if (row.receivingLineId != null) {
      itemCountsByLineId.set(row.receivingLineId, (itemCountsByLineId.get(row.receivingLineId) ?? 0) + 1);
      continue;
    }
    const stage = receivingStageFromPhotoType('RECEIVING', row.caption);
    if (stage === 'arrival_package') cartonPhotoCounts.package += 1;
    else if (stage === 'unbox_carton') cartonPhotoCounts.unboxCarton += 1;
  }
  return { cartonPhotoCounts, itemCountsByLineId };
}

export function evaluateReceivingPhotoPolicy(
  input: EvaluateReceivingPhotoPolicyInput,
): ReceivingPhotoPolicyResult {
  const { policy, cartonPhotoCounts, linePhotoCounts } = input;

  if (policy === 'require_one') {
    if (hasEvidence(cartonPhotoCounts.package)) return { ok: true, blockers: [] };
    // Name the confusion when the operator DID shoot photos — just not the
    // stage this policy insures (the box as it arrived, unopened).
    const hasOtherEvidence =
      hasEvidence(cartonPhotoCounts.unboxCarton) ||
      linePhotoCounts.some((line) => hasEvidence(line.itemCount));
    return {
      ok: false,
      blockers: [
        hasOtherEvidence
          ? 'Carton needs an arrival package photo (unbox and item photos do not count)'
          : 'Carton needs an arrival package photo',
      ],
    };
  }

  if (policy === 'require_per_item') {
    // Vacuously ok with zero lines: the caller passes only non-cancelled
    // lines, and a carton with nothing to receive has nothing to prove.
    const missing = linePhotoCounts.filter((line) => !hasEvidence(line.itemCount));
    if (missing.length === 0) return { ok: true, blockers: [] };
    return { ok: false, blockers: [perItemBlocker(missing)] };
  }

  // 'optional' — plus any runtime-corrupt value the unvalidated settings cast
  // lets through — gates nothing (degrade-not-block on the receive bench).
  return { ok: true, blockers: [] };
}
