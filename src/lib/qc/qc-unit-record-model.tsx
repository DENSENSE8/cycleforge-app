/**
 * The QC unit record's ADAPTER — one serial unit as the shared
 * {@link RecordModel} (owner 2026-09-29, record grammar Step 5): header
 * `# SN … · SKU · <tested>`, the Quality control band on
 * `QC_UNIT_LIFECYCLE` (Received → Graded → Testing → Verdict → Labeled → Put
 * away | Ticket), the tester assigned in line on Testing, the unit's product
 * as the one item. Logic, not a surface: the desk record (`/test`, QC labels)
 * paints the model through `RecordView`, and the phone's F-pattern record
 * reads its state, code, colour and next step from {@link qcUnitRecordState}.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle, ExternalLink, PackageOpen, RotateCcw, Star, Tag, Ticket, Warehouse, X } from '@/components/Icons';
import type { RecordFact, RecordModel, RecordStep } from '@/design-system/components/record-ledger/record-model';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { QC_UNIT_LIFECYCLE, type QcUnitLifecycleState } from '@/design-system/tokens/lifecycle';
import { conditionLabel } from '@/lib/conditions';
import { qcLabelHandle, type QcLabelRow } from '@/lib/labels/qc-label-row';
import { patchLineQcAssignee } from '@/lib/qc/qc-assignee-client';
import { QC_UNIT_NEXT, qcUnitStage } from '@/lib/qc/unit-qc-stage';
import type { SerialUnitEvent, SerialUnitRead } from '@/lib/serial/use-serial-unit';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';

/** What the adapter reads: the unit (`GET /api/serial-units/[id]`), and on the QC labels desk its printed label. */
export interface QcUnitRecordInput {
  unit: SerialUnitRead;
  /** Newest first, as the unit read returns them. */
  events: readonly SerialUnitEvent[];
  label?: QcLabelRow | null;
}

/** What only the host knows: its refetch, the evidence door, bench tooling under the unit. */
export interface QcUnitRecordFrame {
  refresh: (() => void) | null;
  photos: ReactNode;
  /** The `/test` bench's session, readings and next steps — under the unit on its ruler. */
  bench?: ReactNode;
  capturePhotos?: boolean;
}

/** The unit's ONE QC state and its `→ next` — the desk pill and the phone's state code read this. */
export function qcUnitRecordState(unit: Pick<SerialUnitRead, 'current_status' | 'current_line_ticket'>): {
  stage: QcUnitLifecycleState;
  next: string | null;
} {
  const stage = qcUnitStage(unit.current_status, { ticket: Boolean(unit.current_line_ticket) });
  return { stage, next: QC_UNIT_NEXT[stage] };
}

const PASS_PATH: Partial<Record<QcUnitLifecycleState, true>> = { passed: true, labeled: true, putAway: true };
const FAIL_PATH: Partial<Record<QcUnitLifecycleState, true>> = { failed: true, ticket: true };

const at = (value: string | null | undefined) => (value ? formatMonthDayTimePST(value) : null);

const id = (value: string) => <span className={cn(RECORD_ID_CLASS, 'select-all')}>{value}</span>;

/**
 * The QC ladder from the unit's events (newest first) and status. The Verdict
 * step wears its outcome; Passed runs on to Labeled → Put away, Failed forks
 * to the Ticket. A step behind the furthest one done that was never stamped
 * reads "Not recorded", never "Not yet".
 */
function qcUnitSteps(input: QcUnitRecordInput, stage: QcUnitLifecycleState): RecordStep[] {
  const { unit, events, label } = input;
  const newest = (...types: string[]) => events.find((event) => types.includes(event.event_type)) ?? null;
  const received = events.findLast((event) => event.event_type === 'RECEIVED') ?? null;
  const graded = newest('GRADED');
  const started = newest('TEST_START');
  const verdict = newest('TEST_PASS', 'TEST_FAIL');
  const labeled = newest('LABELED');
  const putAway = newest('PUTAWAY');
  // The status is the answer; only a unit beyond the shelf ("past") reads its last verdict event.
  const testing = stage === 'testing';
  const outcome: 'passed' | 'failed' | null = FAIL_PATH[stage]
    ? 'failed'
    : PASS_PATH[stage]
      ? 'passed'
      : stage === 'past' && verdict
        ? verdict.event_type === 'TEST_PASS'
          ? 'passed'
          : 'failed'
        : null;
  const verdictAt = verdict?.occurred_at ?? label?.tested_at ?? null;
  const verdictWho = verdict?.actor_name ?? label?.tested_by_name ?? null;

  const steps: RecordStep[] = [
    {
      key: 'received',
      label: QC_UNIT_LIFECYCLE.received.label,
      state: 'done',
      who: unit.received_by_name ?? received?.actor_name ?? null,
      at: unit.received_at ?? received?.occurred_at ?? null,
      icon: <PackageOpen aria-hidden />,
      tone: QC_UNIT_LIFECYCLE.received.tone,
    },
    {
      key: 'graded',
      label: QC_UNIT_LIFECYCLE.graded.label,
      state: graded || unit.condition_grade ? 'done' : 'todo',
      who: graded?.actor_name ?? null,
      at: graded?.occurred_at ?? null,
      detail: unit.condition_grade ? conditionLabel(unit.condition_grade, 'label') : null,
      icon: <Star aria-hidden />,
      tone: QC_UNIT_LIFECYCLE.graded.tone,
    },
    {
      key: 'testing',
      label: QC_UNIT_LIFECYCLE.testing.label,
      state: testing ? 'partial' : outcome ? 'done' : 'todo',
      who: started?.actor_name ?? null,
      at: started?.occurred_at ?? null,
      detail: testing ? 'On the bench' : null,
      icon: <RotateCcw aria-hidden />,
      tone: QC_UNIT_LIFECYCLE.testing.tone,
    },
    {
      key: 'verdict',
      label: 'Verdict',
      state: outcome ? 'done' : 'todo',
      who: outcome ? verdictWho : null,
      at: outcome ? verdictAt : null,
      detail: outcome ? QC_UNIT_LIFECYCLE[outcome].label : null,
      icon: outcome === 'failed' ? <X aria-hidden /> : <CheckCircle />,
      tone: QC_UNIT_LIFECYCLE[outcome ?? 'passed'].tone,
    },
    ...(outcome === 'failed'
      ? [
          {
            key: 'ticket',
            label: QC_UNIT_LIFECYCLE.ticket.label,
            state: unit.current_line_ticket ? 'done' : 'todo',
            detail: unit.current_line_ticket ? `#${unit.current_line_ticket.replace(/^#/, '')}` : null,
            icon: <Ticket aria-hidden />,
            tone: QC_UNIT_LIFECYCLE.ticket.tone,
          } satisfies RecordStep,
        ]
      : [
          {
            key: 'labeled',
            label: QC_UNIT_LIFECYCLE.labeled.label,
            state: labeled || label || stage === 'labeled' || stage === 'putAway' ? 'done' : 'todo',
            who: labeled?.actor_name ?? label?.last_printed_by_name ?? null,
            at: labeled?.occurred_at ?? label?.first_printed_at ?? null,
            icon: <Tag aria-hidden />,
            tone: QC_UNIT_LIFECYCLE.labeled.tone,
          } satisfies RecordStep,
          {
            key: 'putAway',
            label: QC_UNIT_LIFECYCLE.putAway.label,
            state: putAway || stage === 'putAway' ? 'done' : 'todo',
            who: putAway?.actor_name ?? null,
            at: putAway?.occurred_at ?? null,
            detail: stage === 'putAway' ? unit.current_location : null,
            icon: <Warehouse aria-hidden />,
            tone: QC_UNIT_LIFECYCLE.putAway.tone,
          } satisfies RecordStep,
        ]),
  ];
  const lastDone = steps.findLastIndex((step) => step.state === 'done' || step.state === 'partial');
  return steps.map((step, index) => (step.state === 'todo' && index < lastDone ? { ...step, state: 'unrecorded' } : step));
}

/** The unit's printed QC label and where it goes next (the QC labels desk). */
function labelFacts(label: QcLabelRow): RecordFact[] {
  const printedBy = label.print_count <= 1 && label.last_printed_by_name ? ` · ${label.last_printed_by_name}` : '';
  return [
    { label: 'Unit id', value: id(qcLabelHandle(label)) },
    { label: 'Printed', value: `${at(label.first_printed_at) ?? '—'}${printedBy}` },
    ...(label.print_count > 1
      ? [{
          label: 'Reprinted',
          value: `${label.print_count - 1}×, last ${at(label.last_printed_at) ?? '—'}${label.last_printed_by_name ? ` · ${label.last_printed_by_name}` : ''}`,
        }]
      : []),
    {
      label: 'Order',
      value:
        label.order_id != null ? (
          <Link className={cn('underline underline-offset-2', focusRing('control'))} href={`/shipping/orders?openOrderId=${label.order_id}`}>
            #{label.order_label ?? label.order_id}
          </Link>
        ) : (
          <span className="text-mode-muted">Not on an order</span>
        ),
    },
    ...(label.order_id != null
      ? [
          { label: 'Allocation', value: label.allocation_state ? sentenceCaseLabel(label.allocation_state) : '—' },
          // Held for the order, serial not bound yet: the pick scan of THIS label closes the loop.
          {
            label: 'Serial',
            value: label.serial_on_order ? 'On the order' : <span className="text-mode-warn">Joins the order when the picker scans this label</span>,
          },
        ]
      : []),
  ];
}

export function qcUnitRecordModel(input: QcUnitRecordInput, frame: QcUnitRecordFrame): RecordModel {
  const { unit, events, label } = input;
  const { stage, next } = qcUnitRecordState(unit);
  const face = QC_UNIT_LIFECYCLE[stage];
  const verdict = events.find((event) => event.event_type === 'TEST_PASS' || event.event_type === 'TEST_FAIL') ?? null;
  const testedAt = verdict?.occurred_at ?? label?.tested_at ?? null;
  const ticket = unit.current_line_ticket?.replace(/^#/, '') ?? null;
  const lineId = unit.current_receiving_line_id;
  const title = unit.product_title || label?.title || unit.sku || 'Unidentified item';
  const refresh = frame.refresh;

  return {
    key: `qc-unit:${unit.id}`,
    title: {
      ref: `SN ${unit.serial_number}`,
      platform: null,
      channel: unit.sku,
      date: testedAt ? { label: formatMonthDayTimePST(testedAt), tip: `Tested ${formatMonthDayTimePST(testedAt)}` } : null,
      ticket: ticket ? { label: `#${ticket}`, href: zendeskTicketUrl(ticket) } : null,
    },
    status: { label: next ? `${face.label} → ${next}` : face.label, detail: `QC: ${face.label}${next ? ` · next ${next}` : ''}` },
    alerts: [],
    exception: null,
    internalLabel: 'Quality control',
    flow: 'inbound',
    partyTitle: 'Receipt',
    movementTitle: label ? 'Location & label' : 'Location',
    dates: [],
    promise: null,
    external: null,
    internal: qcUnitSteps(input, stage),
    stepAssign:
      lineId != null
        ? {
            stepKey: 'testing',
            label: 'tester',
            role: 'technician',
            staffId: unit.current_line_tech_id,
            onCommit: (staffId) => patchLineQcAssignee(lineId, staffId).then(() => refresh?.()),
          }
        : null,
    items: [
      {
        key: `unit:${unit.id}`,
        title,
        sku: unit.sku,
        skuCatalogId: unit.sku_catalog_id,
        photoUrl: unit.product_image_url,
        received: null,
        expected: null,
        short: false,
        condition: unit.condition_grade ? conditionLabel(unit.condition_grade, 'label') : null,
        conditionGrade: unit.condition_grade,
        listing: null,
        serials: [unit.serial_number],
        serialNote: null,
        cost: null,
        facts: [],
        extra: frame.bench,
        current: true,
      },
    ],
    itemsNotice: null,
    itemsSummary: null,
    serials: [],
    expectedUnits: undefined,
    notes: verdict?.notes ? [{ label: 'Verdict note', value: verdict.notes, wide: true }] : [],
    staffNote: null,
    price: null,
    currency: null,
    refresh,
    capturePhotos: frame.capturePhotos,
    photos: frame.photos,
    party: [
      ...(unit.current_receiving_id != null ? [{ label: 'Carton', value: id(`R-${unit.current_receiving_id}`) }] : []),
      ...(lineId != null ? [{ label: 'Line', value: id(`L-${lineId}`) }] : []),
      ...(ticket
        ? [{
            label: 'Claim',
            value: (
              <a
                href={zendeskTicketUrl(ticket) ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(RECORD_ID_CLASS, 'inline-flex items-center gap-1 underline underline-offset-2', focusRing('control'))}
              >
                #{ticket}
                <ExternalLink aria-hidden className="h-3 w-3" />
              </a>
            ),
          }]
        : []),
    ],
    movement: [
      {
        label: 'Bin',
        value: <span className={cn(RECORD_ID_CLASS, !unit.current_location && 'text-mode-warn')}>{unit.current_location ?? 'No location'}</span>,
      },
      { label: 'Unit status', value: sentenceCaseLabel(unit.current_status) },
      ...(label ? labelFacts(label) : []),
    ],
    loadFailed: null,
  };
}
