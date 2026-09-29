/** Pure Local Pickup adapter for the shared triage card family. */

import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import type { RecordCardLine, RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import type { RecordStateFace } from '@/design-system/tokens/industrial-record';
import { conditionSentenceLabel, resolveConditionGrade } from '@/lib/conditions';
import {
  pickupLineNeedsProcess,
  pickupOrderIsDone,
} from '@/lib/local-pickup/order-status';
import { formatDateKeyMedium } from '@/utils/date';
import {
  summarizeReceivingUnitStages,
  type ReceivingUnitStageSummary,
} from '@/lib/receiving/receiving-unit-stage-summary';
import type { ReceivingUnitStageFactView } from '@/lib/receiving/receiving-line-row';
import { pickupMoney, type PickupLine } from '../pickup-lines';

const DONE: RecordStateFace = {
  id: 'DONE',
  code: 'DON',
  label: 'Done',
  tone: 'success',
  icon: 'package-check',
};
const PROCESS: RecordStateFace = {
  id: 'PROCESS',
  code: 'PROC',
  label: 'Need to process',
  tone: 'warning',
  icon: 'package-open',
};
const DRAFT: RecordStateFace = {
  id: 'DRAFT',
  code: 'DFT',
  label: 'Draft',
  tone: 'neutral',
  icon: 'circle-dot',
};

export interface PickupCardModel {
  key: string;
  ids: number[];
  lead: PickupOrderRecord;
  line: PickupLine;
  rows: PickupLine[];
  state: RecordStateFace;
  identity: string;
  customer: string | null;
  pickupDate: string | null;
  itemCount: number;
  totalValue: number;
  paymentMethod: string | null;
  paidAmountCents: number | null;
  unitSummary: ReceivingUnitStageSummary;
  /** Expanded card rows at physical-unit grain, with their owning pickup line. */
  units: PickupUnitCardLine[];
}

export interface PickupUnitCardLine {
  cardId: number;
  pickupLineId: number;
  ordinal: number;
  row: PickupLine;
  fact: ReceivingUnitStageFactView | null;
}

/** One triage record is one LCPU order; its item rows are child disclosure. */
export interface PickupOrderRecord {
  id: number;
  orderId: number;
  lines: PickupLine[];
}

export function pickupOrderRecords(lines: readonly PickupLine[]): PickupOrderRecord[] {
  return groupRowsBy([...lines], (line) => `pickup:${line.order_id}`).map((group) => ({
    id: group.rows[0]!.order_id,
    orderId: group.rows[0]!.order_id,
    lines: group.rows,
  }));
}

export function pickupCardKey(group: RowGroup<PickupOrderRecord>): string {
  return group.key;
}

export function pickupIdentity(row: PickupLine): string {
  return (row.po_number || row.reference_number || `Order ${row.order_id}`).trim();
}

export function pickupDateKey(row: PickupLine): string | null {
  const value = (row.pickup_date || '').trim();
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

export function pickupCardModel(group: RowGroup<PickupOrderRecord>): PickupCardModel {
  const lead = group.rows[0]!;
  const rows = lead.lines;
  const line = rows[0]!;
  const done = pickupOrderIsDone(line.order_status);
  const needsProcess = rows.some(pickupLineNeedsProcess);
  const units = rows.flatMap(pickupUnitCardLines);
  const unitSummary = summarizeReceivingUnitStages(rows.map((row) => ({
    quantity: row.quantity,
    unitStageFacts: row.unit_stage_facts,
  })));
  return {
    key: group.key,
    ids: [lead.id],
    lead,
    line,
    rows,
    state: done ? DONE : needsProcess ? PROCESS : DRAFT,
    identity: pickupIdentity(line),
    customer: (line.customer_name || line.zoho_vendor_name || '').trim() || null,
    pickupDate: pickupDateKey(line),
    itemCount: rows.reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0),
    totalValue: rows.reduce((sum, row) => sum + (Number(row.total_price) || 0), 0),
    paymentMethod: (line.payment_method || '').trim() || null,
    paidAmountCents: line.paid_amount_cents == null ? null : Number(line.paid_amount_cents),
    unitSummary,
    units,
  };
}

function unitCardId(row: PickupLine, ordinal: number, fact: ReceivingUnitStageFactView | null): number {
  // Real unit ids are stable. Negative ids keep them disjoint from pickup-item
  // ids while virtual pre-label units still have deterministic React keys.
  if (fact) return -fact.receiving_line_unit_id;
  return -(2_000_000_000 + row.id * 1_000 + ordinal);
}

function pickupUnitCardLines(row: PickupLine): PickupUnitCardLine[] {
  const facts = row.unit_stage_facts ?? [];
  const count = Math.max(1, Number(row.quantity) || 0, facts.length);
  return Array.from({ length: count }, (_, index) => {
    const fact = facts[index] ?? null;
    const ordinal = fact?.ordinal ?? index + 1;
    return { cardId: unitCardId(row, ordinal, fact), pickupLineId: row.id, ordinal, row, fact };
  });
}

function qcFace(fact: ReceivingUnitStageFactView | null): string {
  if (!fact) return 'Pending';
  if (fact.qc_state === 'TEST_AGAIN') return 'Retest';
  return fact.qc_state[0] + fact.qc_state.slice(1).toLowerCase();
}

function pickupLine(unit: PickupUnitCardLine): RecordCardLine {
  const { row, fact, ordinal } = unit;
  const condition = resolveConditionGrade(row.condition_grade);
  const note = (row.missing_parts_note || row.condition_note || '').trim() || null;
  const perUnitPrice = (Number(row.total_price) || 0) / Math.max(1, Number(row.quantity) || 1);
  const unitIdentity = fact?.unit_uid || fact?.serial || `Unit ${ordinal}`;
  return {
    id: unit.cardId,
    title: row.product_title || row.sku || 'Unidentified item',
    photoUrl: row.image_url,
    alert: !fact || fact.label_state === 'MISSING' || fact.qc_state !== 'PASSED',
    alertNote: note || (!fact ? 'Unit identity and label pending' : `${qcFace(fact)} · ${fact.label_state === 'PRINTED' ? 'Label printed' : 'Label missing'}`),
    facts: {
      unit: { kind: 'code', text: unitIdentity, title: fact?.unit_uid ? 'Unit UID' : fact?.serial ? 'Serial' : 'Expected physical unit' },
      condition: fact?.condition_grade || row.condition_grade
        ? {
            kind: 'grade',
            label: conditionSentenceLabel(resolveConditionGrade(fact?.condition_grade || row.condition_grade)),
            code: fact?.condition_grade || condition,
          }
        : null,
      qc: { kind: 'text', text: qcFace(fact) },
      label: fact?.label_state === 'PRINTED'
        ? { kind: 'text', text: 'Label printed' }
        : { kind: 'missing', text: 'Label missing' },
      sku: row.sku ? { kind: 'code', text: row.sku, title: 'SKU' } : null,
      price: { kind: 'money', text: pickupMoney(String(perUnitPrice)), estimate: false, estimateTitle: '' },
    },
  };
}

const QC_FACE: Readonly<Record<ReceivingUnitStageSummary['strongestQc'], RecordStateFace>> = {
  FAILED: { id: 'FAILED', code: 'FAIL', label: 'QC failed', tone: 'danger', icon: 'package-x' },
  PENDING: { id: 'PENDING', code: 'PEND', label: 'QC pending', tone: 'warning', icon: 'clock' },
  TEST_AGAIN: { id: 'TEST_AGAIN', code: 'RETEST', label: 'Retest', tone: 'warning', icon: 'circle-dot' },
  PASSED: { id: 'PASSED', code: 'PASS', label: 'QC passed', tone: 'success', icon: 'package-check' },
};

export function pickupRecordCardState(model: PickupCardModel): RecordStateFace {
  return model.state.id === 'PROCESS' ? model.state : QC_FACE[model.unitSummary.strongestQc];
}

export function pickupRecordCard(model: PickupCardModel): RecordCardModel {
  const lines = model.units.map(pickupLine);
  const processFirst = model.state.id === 'PROCESS';
  const state = pickupRecordCardState(model);
  const next = processFirst ? 'Process' : model.unitSummary.nextAction;
  const missingLabels = Math.max(0, model.unitSummary.units - model.unitSummary.labelsPrinted);
  const alertCount = lines.filter((line) => line.alert).length;
  return {
    key: model.key,
    leadId: model.lead.id,
    state,
    stateIcon: recordStateGlyph(state),
    stateMeaning: `${state.label} — ${model.unitSummary.compact}`,
    alert: alertCount > 0 ? {
      count: alertCount,
      summary: `${alertCount} of ${lines.length} units need attention`,
      ariaLabel: `${state.label}, ${alertCount} of ${lines.length} units need attention`,
    } : null,
    aria: {
      card: `Local pickup ${model.identity}, ${model.state.label}, ${lines[0]?.title ?? ''}`,
      open: `Open local pickup ${model.identity}`,
      check: `Select local pickup ${model.identity}`,
    },
    channel: null,
    person: model.customer,
    chips: [
      ...(missingLabels > 0 ? [{
        id: 'labels',
        tone: 'warning' as const,
        short: `${missingLabels} unlabeled`,
        long: `${missingLabels} ${missingLabels === 1 ? 'label' : 'labels'} missing`,
        tooltip: 'Physical units without a recorded 2×1 QC label',
      }] : []),
      ...(model.unitSummary.tickets > 0 ? [{ id: 'tickets', tone: 'info' as const, short: `${model.unitSummary.tickets} ticket${model.unitSummary.tickets === 1 ? '' : 's'}`, tooltip: 'Linked support tickets' }] : []),
    ],
    notes: { fixed: null, own: null },
    status: { kind: 'state', face: model.unitSummary.compact, tone: state.tone, tip: model.pickupDate ? `Pickup ${formatDateKeyMedium(model.pickupDate, { weekday: 'short', withYear: true })}` : null },
    next: { label: next, tone: state.tone, tip: `Next: ${next.toLowerCase()}`, blocked: next === 'Resolve failure' },
    lines,
    hiddenAlertLabel: (count) => `${count} more ${count === 1 ? 'unit needs' : 'units need'} attention`,
  };
}
