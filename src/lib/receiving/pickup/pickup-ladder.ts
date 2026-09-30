/**
 * The local pickup's floor ladder, pure (owner 2026-09-29, Step 3):
 * `PICKUP_LIFECYCLE` steps with k/N, the ONE count-aware status word
 * ("Awaiting grading 4/12") and the next step. The record adapter, the desk
 * card and the phone card all read it, so they never disagree.
 */

import type { RecordStep } from '@/design-system/components/record-ledger/record-model';
import { PICKUP_LIFECYCLE, type PickupLifecycleState } from '@/design-system/tokens/lifecycle';
import type { ReceivingUnitStageFactView } from '@/lib/receiving/receiving-line-row';
import { formatDateKeyMedium, getCurrentPSTDateKey } from '@/utils/date';
import type { PickupCardModel } from './pickup-card-model';
import type { PickupLine } from './pickup-lines';

/** The status word while a step is the one in hand. */
const AWAITING: Readonly<Record<PickupLifecycleState, string>> = {
  ordered: 'Awaiting order',
  collected: 'Awaiting pickup',
  unboxed: 'Awaiting unboxing',
  graded: 'Awaiting grading',
  tested: 'Awaiting testing',
  putAway: 'Awaiting put away',
};

export const pickupText = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One physical unit of a pickup item — a projected unit, or a virtual one before its label mints it. */
export interface PickupUnitView {
  key: string;
  ordinal: number;
  fact: ReceivingUnitStageFactView | null;
  identity: string;
  /** The floor's grade: the unit's own, else the line's graded grade. */
  grade: string | null;
  qc: ReceivingUnitStageFactView['qc_state'];
  labelPrinted: boolean;
}

/** The line's floor grade — only once somebody graded it (the seller's word is not a grade). */
export function pickupLineGrade(row: PickupLine): string | null {
  return row.line_graded_at ? pickupText(row.line_condition_grade) : null;
}

export function pickupUnits(row: PickupLine): PickupUnitView[] {
  const facts = row.unit_stage_facts ?? [];
  const count = Math.max(1, Number(row.quantity) || 0, facts.length);
  const graded = pickupLineGrade(row);
  return Array.from({ length: count }, (_, index) => {
    const fact = facts[index] ?? null;
    const ordinal = fact?.ordinal ?? index + 1;
    return {
      key: fact ? `unit:${fact.receiving_line_unit_id}` : `virtual:${row.id}:${ordinal}`,
      ordinal,
      fact,
      identity: fact?.unit_uid || fact?.serial || `Unit ${ordinal}`,
      grade: pickupText(fact?.condition_grade) ?? graded,
      qc: fact?.qc_state ?? 'PENDING',
      labelPrinted: fact?.label_state === 'PRINTED',
    };
  });
}

export type PickupItemFilter = 'all' | 'grade' | 'test' | 'failed';

/** Does an item answer to an Items-header filter: an ungraded unit, an untested unit, a failed unit. */
export function pickupItemMatches(row: PickupLine, filter: PickupItemFilter): boolean {
  if (filter === 'all') return true;
  const units = pickupUnits(row);
  if (filter === 'grade') return units.some((unit) => unit.grade == null);
  if (filter === 'test') return units.some((unit) => unit.qc === 'PENDING' || unit.qc === 'TEST_AGAIN');
  return units.some((unit) => unit.qc === 'FAILED');
}

/** A ladder step before the record gives it its glyph. */
export type PickupLadderStep = Omit<RecordStep, 'icon' | 'key'> & { key: PickupLifecycleState };

export interface PickupLadder {
  steps: PickupLadderStep[];
  status: { label: string; detail: string };
  /** The next step in words ("Grade 8 units"); null when every passed unit is shelved. */
  next: string | null;
  units: number;
  labelled: number;
  failed: number;
}

interface StepCount {
  key: PickupLifecycleState;
  done: number;
  of: number;
  noun: string;
  verb: string;
}

/** k of N → none / partly / done. */
function stepState(done: number, of: number): RecordStep['state'] {
  if (of <= 0 || done <= 0) return 'todo';
  return done >= of ? 'done' : 'partial';
}

export function pickupLadder(order: PickupCardModel): PickupLadder {
  const rows = order.rows;
  const line = order.line;
  const units = rows.flatMap(pickupUnits);
  const graded = units.filter((unit) => unit.grade != null).length;
  const failed = units.filter((unit) => unit.qc === 'FAILED').length;
  const tested = units.filter((unit) => unit.qc === 'PASSED' || unit.qc === 'FAILED').length;
  const putAway = rows.reduce((sum, row) => sum + (row.put_away_units ?? 0), 0);
  // A line is opened once received, graded or labelled — a grade is unbox evidence (`acknowledgeUnbox`).
  const unboxed = rows.filter(
    (row) => pickupText(row.unboxed_at) || (row.quantity_received ?? 0) > 0 || row.line_graded_at || (row.unit_stage_facts?.length ?? 0) > 0,
  ).length;
  const collector = pickupText(line.created_by_name);
  const collected = order.pickupDate != null && order.pickupDate <= getCurrentPSTDateKey();
  const graders = [...new Set(rows.map((row) => pickupText(row.line_graded_by_name)).filter(Boolean))];
  const lastTest = units
    .map((unit) => unit.fact)
    .filter((fact): fact is ReceivingUnitStageFactView => Boolean(fact?.tested_at))
    .sort((a, b) => (b.tested_at ?? '').localeCompare(a.tested_at ?? ''))[0];

  const counted: StepCount[] = [
    { key: 'unboxed', done: unboxed, of: rows.length, noun: 'item', verb: 'Unbox' },
    { key: 'graded', done: graded, of: units.length, noun: 'unit', verb: 'Grade' },
    { key: 'tested', done: tested, of: units.length, noun: 'unit', verb: 'Test' },
    // A failed unit is never shelved — it leaves the put-away count.
    { key: 'putAway', done: putAway, of: units.length - failed, noun: 'unit', verb: 'Put away' },
  ];
  const face = (key: PickupLifecycleState) => ({ key, label: PICKUP_LIFECYCLE[key].label, tone: PICKUP_LIFECYCLE[key].tone });
  const steps: PickupLadderStep[] = [
    { ...face('ordered'), state: 'done', who: collector, at: line.order_created_at },
    collected
      ? { ...face('collected'), state: 'done', who: collector, at: order.pickupDate, dateOnly: true }
      : {
          ...face('collected'),
          state: 'todo',
          detail: order.pickupDate ? `Due ${formatDateKeyMedium(order.pickupDate, { weekday: 'none' })}` : null,
        },
    ...counted.map((step): PickupLadderStep => ({
      ...face(step.key),
      state: stepState(step.done, step.of),
      detail: step.of > 0 ? `${step.done}/${step.of}` : null,
      who: step.key === 'graded' && graders.length === 1 ? graders[0] : step.key === 'tested' ? (lastTest?.tested_by_name ?? null) : null,
      at: step.key === 'tested' ? (lastTest?.tested_at ?? null) : null,
    })),
  ];

  const base = {
    steps,
    units: units.length,
    labelled: units.filter((unit) => unit.labelPrinted).length,
    failed,
  };
  // "Now" is the rail's (`RecordView`): the first partly done step, else the first after the furthest done.
  const lastDone = steps.reduce((last, step, i) => (step.state === 'done' || step.state === 'partial' ? i : last), -1);
  const partialAt = steps.findIndex((step) => step.state === 'partial');
  const current = steps[partialAt >= 0 ? partialAt : lastDone + 1] ?? null;
  const failedNote = failed > 0 ? ` · ${plural(failed, 'unit')} failed` : '';
  if (!current) {
    return { ...base, status: { label: PICKUP_LIFECYCLE.putAway.label, detail: `Every passed unit is shelved${failedNote}` }, next: null };
  }
  const count = counted.find((step) => step.key === current.key);
  const next = count
    ? `${count.verb} ${plural(count.of - count.done, count.noun)}`
    : current.key === 'collected'
      ? 'Collect from the seller'
      : 'Record the order';
  return {
    ...base,
    status: {
      label: count ? `${AWAITING[current.key]} ${count.done}/${count.of}` : AWAITING[current.key],
      detail: `Next: ${next.toLowerCase()}${failedNote}`,
    },
    next,
  };
}
