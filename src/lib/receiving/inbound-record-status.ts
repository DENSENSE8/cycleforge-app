/**
 * The inbound record's Receiving group (owner 2026-09-29) — the inverse of the
 * outbound Fulfillment group: External is the carrier bringing the purchase to
 * the dock, Internal is our floor's ladder
 * Ordered / Imported → Docked → Unboxed → Graded → Tested → Put away, and ONE
 * current status answers "where is this purchase now?". Unboxed IS the
 * receipt — there is no separate Received step.
 */

import { deriveCartonSteps, type CartonRecordCarton } from './carton-record-status';
import type { ReceivingLineRow } from './receiving-line-row';
import type { ReceivingStatusStep } from './receiving-status-strip';

const FLOOR_KEYS = ['scanned', 'unboxed', 'graded', 'tested', 'putaway'] as const;
type FloorKey = (typeof FLOOR_KEYS)[number];

const FLOOR_LABEL: Readonly<Record<FloorKey, string>> = {
  scanned: 'Docked',
  unboxed: 'Unboxed',
  graded: 'Graded',
  tested: 'Tested',
  putaway: 'Put away',
};

/** Where the step is while it is still open — the current-status face. */
const AWAITING_LABEL: Readonly<Record<FloorKey, string>> = {
  scanned: 'Awaiting dock scan',
  unboxed: 'Awaiting unbox',
  graded: 'Awaiting grading',
  tested: 'Awaiting test',
  putaway: 'Awaiting put away',
};

const isFloorKey = (key: string): key is FloorKey => (FLOOR_KEYS as readonly string[]).includes(key);

const text = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed || null;
};

/** Earliest non-empty stamp (ISO / pg strings compare as dates). */
function earliest(values: ReadonlyArray<string | null | undefined>): string | null {
  let best: { raw: string; ms: number } | null = null;
  for (const raw of values) {
    const value = text(raw);
    if (!value) continue;
    const ms = Date.parse(value.replace(' ', 'T'));
    if (Number.isFinite(ms) && (!best || ms < best.ms)) best = { raw: value, ms };
  }
  return best?.raw ?? null;
}

/**
 * The ladder's first step: Ordered on the PO date (a calendar day, no time),
 * else Imported on the record's import time (the earliest of the carton row
 * and its lines). Absent when neither is known.
 */
function orderedStep(poDate: string | null, importStamps: ReadonlyArray<string | null | undefined>): ReceivingStatusStep | null {
  if (poDate) return { key: 'ordered', label: 'Ordered', state: 'done', who: null, at: poDate, dateOnly: true, detail: null };
  const imported = earliest(importStamps);
  return imported ? { key: 'ordered', label: 'Imported', state: 'done', who: null, at: imported, detail: null } : null;
}

/**
 * The floor's ladder for a carton (or a purchase's lines before a carton
 * read lands). Unboxed and Received fold into ONE step: the unbox stamp, else
 * the receipt. Tested paints only when a line needs a test; Put away always
 * paints, open until a line is staged to a bin.
 */
export function deriveInboundInternalSteps(
  carton: CartonRecordCarton | null,
  lines: readonly ReceivingLineRow[],
  { poDate = null }: { poDate?: string | null } = {},
): ReceivingStatusStep[] {
  const cartonSteps = deriveCartonSteps(carton, lines);
  const received = cartonSteps.find((step) => step.key === 'received');
  const steps: ReceivingStatusStep[] = cartonSteps
    .filter((step) => isFloorKey(step.key))
    .map((step): ReceivingStatusStep => {
      const face = { ...step, label: FLOOR_LABEL[step.key as FloorKey] };
      if (step.key !== 'unboxed' || !received) return face;
      if (step.state === 'done') return { ...face, who: face.who ?? received.who };
      if (received.state === 'done' || received.state === 'partial') {
        return { ...face, state: received.state, who: received.who, at: received.at, detail: received.detail };
      }
      return face;
    });
  if (!steps.some((step) => step.key === 'putaway')) {
    steps.push({ key: 'putaway', label: FLOOR_LABEL.putaway, state: 'todo', who: null, at: null, detail: null });
  }
  const ordered = orderedStep(text(poDate) ?? text(lines.find((line) => text(line.po_date))?.po_date), [
    carton?.created_at,
    ...lines.map((line) => line.created_at),
  ]);
  return ordered ? [ordered, ...steps] : steps;
}

/** The record's ONE current status — painted in one pinned tone, so it carries none of its own. */
export interface InboundCurrentStatus {
  label: string;
  detail?: string;
}

export function inboundCurrentStatus({
  internal,
  delivered,
  carrierStatus,
  tracking,
}: {
  internal: readonly ReceivingStatusStep[];
  delivered: boolean;
  /** The carrier's latest status label / category, when it has scanned the package. */
  carrierStatus: string | null;
  tracking: string | null;
}): InboundCurrentStatus {
  // Ordered / Imported is paperwork, not the floor: until the dock scans it,
  // "now" is the carrier's word.
  const floor = internal.filter((step) => step.key !== 'ordered');
  const lastStarted = floor.reduce(
    (last, step, index) => (step.state === 'done' || step.state === 'partial' ? index : last),
    -1,
  );
  if (lastStarted >= 0) {
    // A partly done step is itself "now"; else the step after the furthest done
    // one (a skipped, unrecorded step behind it never reads as "now").
    const partial = floor.find((step) => step.state === 'partial');
    const open = partial ?? floor[lastStarted + 1];
    if (!open) return { label: floor[lastStarted]!.label };
    if (isFloorKey(open.key)) {
      return {
        label: open.state === 'partial' ? `${open.label} ${open.detail ?? ''}`.trim() : AWAITING_LABEL[open.key],
        detail: open.detail ?? undefined,
      };
    }
  }
  if (delivered) return { label: 'Delivered', detail: 'Awaiting dock scan' };
  const carrier = carrierStatus?.trim();
  if (carrier) {
    const words = carrier.replaceAll('_', ' ').toLowerCase();
    return { label: words.charAt(0).toUpperCase() + words.slice(1) };
  }
  if (tracking) return { label: 'Awaiting carrier scan' };
  return { label: 'Awaiting tracking' };
}
