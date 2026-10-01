/**
 * The REPAIR RECORD's facts — one repair ticket (`RSRecord`) → what the
 * two-column record paints (owner 2026-09-30): the header identity, the
 * Fulfillment band's status points (`REPAIR_LIFECYCLE`, who / when from
 * `status_history`), the device, the history, the customer and movement facts,
 * and which header verbs the ticket offers now. Pure — the view
 * (`RepairServiceRecordView`) and the verbs (`useRepairRecordVerbs`) read it.
 */

import type { RecordCardDeadline } from '@/design-system/components/record-card/record-card-types';
import type { StateName } from '@/design-system/tokens/lifecycle';
import { REPAIR_LIFECYCLE, type RepairLifecycleStep } from '@/design-system/tokens/repair-lifecycle';
import { repairStatusFace } from '@/design-system/tokens/repair-status';
import type { RepairStatusHistoryEntry, RSRecord } from '@/lib/neon/repair-service-queries';
import { canStartRepairPickup, isRepairClosed, repairStatusOperatorLabel } from '@/lib/repair-status';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { repairPriceDisplay, repairSla, repairTicketHandle, repairTitle } from '@/lib/repair/repair-queue-model';
import { REPAIR_CHANNEL_LABEL, parseRepairChannel, type RepairChannel } from '@/lib/repair/repair-channel';
import { pickupEntry } from '@/lib/repair/repair-history';
import { formatDateKeyShort, toPSTDateKey } from '@/utils/date';

/** Where a status point stands: stamped behind "now" but never recorded reads `skipped`. */
export type RepairStepState = 'done' | 'current' | 'pending' | 'skipped';

export interface RepairRecordStep {
  key: RepairLifecycleStep;
  label: string;
  tone: StateName;
  state: RepairStepState;
  at: string | null;
  who: string | null;
  /** A branch state of the current step (Waiting on parts under In repair). */
  sub: string | null;
}

export interface RepairHistoryRow {
  from: string | null;
  to: string;
  who: string | null;
  at: string;
}

export type RepairVerbId =
  | 'mark-done'
  | 'mark-pending'
  | 'pickup'
  | 'label'
  | 'paperwork'
  | 'receipt'
  | 'edit-info'
  | 'work-log'
  | 'triage-ticket'
  | 'link-ticket'
  | 'ticket-number'
  | 'create-ticket'
  | 'status'
  | 'square'
  | 'cancel';

/** A verb the ticket offers now: hidden, or shown (disabled with its reason when `disabledReason`). */
export type RepairVerbState = { hidden: true } | { hidden: false; disabledReason: string | null };

export interface RepairRecordModel {
  key: string;
  id: number;
  title: { ticket: string | null; face: string };
  /** `customer · Shipped in|Dropped off · due <date>` (or the closed date). */
  subtitle: string;
  status: { stored: string; label: string; tone: StateName };
  closed: boolean;
  sla: RecordCardDeadline;
  steps: readonly RepairRecordStep[];
  /** The inbound carrier tracking — the external rail's source; null = no external rail. */
  tracking: string | null;
  channel: RepairChannel | null;
  device: {
    title: string;
    sku: string | null;
    serial: string | null;
    issue: string | null;
    price: string | null;
    photoUrl: string | null;
    orderId: string | null;
    sourceSystem: string | null;
  };
  /** Newest first. */
  history: readonly RepairHistoryRow[];
  customer: { id: number | null; name: string | null; phone: string | null; email: string | null };
  /** The drop-off carton (`R-{id}`) once the ticket became a receiving line. */
  carton: { receivingId: number; face: string } | null;
  notes: string;
  verbs: Readonly<Record<RepairVerbId, RepairVerbState>>;
}

const text = (value: string | null | undefined): string | null => String(value ?? '').trim() || null;

const IN_REPAIR = ['Pending Repair', 'Awaiting Parts', 'Awaiting Additional Parts Payment'] as const;
const PAYMENT = ['Awaiting Payment'] as const;
const CLOSING = ['Picked Up', 'Shipped', 'Done', 'Cancelled'] as const;

/** Latest history entry into any of `statuses`. */
function latestInto(history: readonly RepairStatusHistoryEntry[], statuses: readonly string[]): RepairStatusHistoryEntry | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (statuses.includes(history[i]!.status)) return history[i]!;
  }
  return null;
}

/** The step the stored status sits on. */
function currentStep(status: string): RepairLifecycleStep {
  if (status === 'Incoming Shipment') return 'received';
  if ((IN_REPAIR as readonly string[]).includes(status)) return 'inRepair';
  if (status === 'Repaired, Contact Customer') return 'repaired';
  if ((PAYMENT as readonly string[]).includes(status)) return 'awaitingPayment';
  if (status === 'Awaiting Pickup') return 'ready';
  if ((CLOSING as readonly string[]).includes(status)) return 'closed';
  // A free-text legacy status: on the bench.
  return 'inRepair';
}

/**
 * The status points, in ladder order. Awaiting payment paints only when the
 * ticket used it; a stamped step is done wherever it sits; a step behind "now"
 * with no stamp is `skipped` (never recorded), ahead of it `pending`.
 */
export function repairRecordSteps(repair: RSRecord, staffName?: (id: number) => string | null): RepairRecordStep[] {
  const history = repair.status_history ?? [];
  const status = (repair.status || '').trim();
  const channel = parseRepairChannel(repair.intake_channel);
  const opening = history[0] && !history[0].previous_status ? history[0] : null;
  const incoming = status === 'Incoming Shipment';
  const received = incoming ? null : text(repair.received_at);
  const receiver = repair.received_by_staff_id != null ? (staffName?.(repair.received_by_staff_id) ?? null) : null;
  const work = latestInto(history, IN_REPAIR);
  const repaired = latestInto(history, ['Repaired, Contact Customer']);
  const payment = latestInto(history, PAYMENT);
  const ready = latestInto(history, ['Awaiting Pickup']);
  const pickup = pickupEntry(repair);
  const closedEntry = pickup ?? latestInto(history, CLOSING);
  const closedLabel =
    status === 'Cancelled'
      ? 'Cancelled'
      : pickup || status === 'Picked Up'
        ? 'Picked up'
        : status === 'Shipped'
          ? 'Shipped back'
          : REPAIR_LIFECYCLE.closed.label;

  const raw: Array<Omit<RepairRecordStep, 'state' | 'tone'>> = [
    { key: 'checkedIn', label: REPAIR_LIFECYCLE.checkedIn.label, at: text(repair.created_at), who: opening?.user_name ?? null, sub: null },
    { key: 'received', label: REPAIR_LIFECYCLE.received.label, at: received, who: received ? receiver : null, sub: null },
    { key: 'labeled', label: REPAIR_LIFECYCLE.labeled.label, at: text(repair.label_printed_at), who: null, sub: null },
    {
      key: 'inRepair',
      label: REPAIR_LIFECYCLE.inRepair.label,
      at: work?.timestamp ?? null,
      who: work?.user_name ?? null,
      // Waiting on parts / on the parts payment: the bench's sub-state, never its own step.
      sub: status !== 'Pending Repair' && (IN_REPAIR as readonly string[]).includes(status) ? repairStatusOperatorLabel(status) : null,
    },
    { key: 'repaired', label: REPAIR_LIFECYCLE.repaired.label, at: repaired?.timestamp ?? null, who: repaired?.user_name ?? null, sub: null },
    ...(payment || (PAYMENT as readonly string[]).includes(status)
      ? [{ key: 'awaitingPayment' as const, label: REPAIR_LIFECYCLE.awaitingPayment.label, at: payment?.timestamp ?? null, who: payment?.user_name ?? null, sub: null }]
      : []),
    {
      key: 'ready',
      label: channel === 'shipment' ? 'Ready to ship back' : REPAIR_LIFECYCLE.ready.label,
      at: ready?.timestamp ?? null,
      who: ready?.user_name ?? null,
      sub: null,
    },
    { key: 'closed', label: closedLabel, at: closedEntry?.timestamp ?? null, who: closedEntry?.user_name ?? null, sub: null },
  ];

  const now = raw.findIndex((step) => step.key === currentStep(status));
  const closed = isRepairClosed(status);
  return raw.map((step, i) => {
    // Ahead of "now", a stamp is a previous pass (a reopened ticket) — still to come,
    // except the 2×1 label, which stays on the device whenever it was printed.
    const state: RepairStepState =
      i === now
        ? closed
          ? 'done'
          : 'current'
        : i < now
          ? step.at
            ? 'done'
            : 'skipped'
          : step.key === 'labeled' && step.at
            ? 'done'
            : 'pending';
    return { ...step, tone: REPAIR_LIFECYCLE[step.key].tone, state };
  });
}

/** Status changes, newest first. */
export function repairHistoryRows(repair: RSRecord): RepairHistoryRow[] {
  return [...(repair.status_history ?? [])]
    .reverse()
    .map((entry) => ({ from: entry.previous_status ?? null, to: entry.status, who: entry.user_name ?? null, at: entry.timestamp }));
}

const shown = (disabledReason: string | null = null): RepairVerbState => ({ hidden: false, disabledReason });
const HIDDEN: RepairVerbState = { hidden: true };

/** A price the Square link can charge (> 0 after stripping `$` and commas). */
function hasChargeablePrice(price: string | null | undefined): boolean {
  const parsed = Number(String(price ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) && Math.round(parsed * 100) > 0;
}

/**
 * Which header verbs the ticket offers now. Mark done hides once closed;
 * Mark pending hides while pending; Start pickup shows only while the device
 * is ready to leave (never once closed); Print receipt needs the counter visit it prints.
 */
export function repairRecordVerbs(repair: RSRecord): Record<RepairVerbId, RepairVerbState> {
  const status = (repair.status || '').trim();
  const closed = isRepairClosed(status);
  const cancelled = status === 'Cancelled';
  return {
    'mark-done': closed ? HIDDEN : shown(),
    'mark-pending': status === 'Pending Repair' ? HIDDEN : shown(),
    pickup: !closed && canStartRepairPickup(status) ? shown() : HIDDEN,
    label: shown(),
    paperwork: shown(),
    receipt: shown(repair.counter_transaction_id != null ? null : 'No counter visit — this ticket was not checked in at the counter'),
    'edit-info': shown(),
    'work-log': shown(),
    'triage-ticket': shown(),
    'link-ticket': shown(),
    'ticket-number': shown(),
    'create-ticket': shown(),
    status: shown(cancelled ? 'Cancelled — reopen it before changing its status' : null),
    square: shown(text(repair.source_sku) || hasChargeablePrice(repair.price) ? null : 'Add a source SKU or a valid price first'),
    cancel: shown(cancelled ? 'Already cancelled' : null),
  };
}

/** The whole record. `todayKey` is the PT day the SLA reads against. */
export function repairRecordModel(repair: RSRecord, todayKey: string, staffName?: (id: number) => string | null): RepairRecordModel {
  const status = (repair.status || '').trim();
  const face = repairStatusFace(status);
  const ticket = repairTicketHandle(repair);
  const channel = parseRepairChannel(repair.intake_channel);
  const contact = resolveRepairContact(repair);
  const closed = isRepairClosed(status);
  const sla = repairSla(repair, todayKey);
  const dueKey = closed ? '' : toPSTDateKey(text(repair.due_at));
  const when = closed ? sla.face : dueKey && status !== 'Incoming Shipment' ? `due ${formatDateKeyShort(dueKey)}` : null;
  const tracking = text(repair.source_tracking_number);
  const cartonLinked = repair.receiving_line_id != null && repair.receiving_id != null;
  return {
    key: `repair:${repair.id}`,
    id: repair.id,
    title: { ticket, face: ticket ? `#${ticket}` : 'No ticket #' },
    subtitle: [contact.name, channel ? REPAIR_CHANNEL_LABEL[channel] : null, when].filter(Boolean).join(' · '),
    status: { stored: status, label: repairStatusOperatorLabel(face.label), tone: face.tone === 'fulfillment' ? 'info' : face.tone },
    closed,
    sla,
    steps: repairRecordSteps(repair, staffName),
    // A drop-off came through the door, never a carrier.
    tracking: channel === 'pickup' ? null : tracking,
    channel,
    device: {
      title: repairTitle(repair),
      sku: text(repair.source_sku),
      serial: text(repair.serial_number),
      issue: text(repair.issue),
      price: repairPriceDisplay(repair),
      photoUrl: text(repair.image_url),
      orderId: text(repair.source_order_id),
      sourceSystem: text(repair.source_system),
    },
    history: repairHistoryRows(repair),
    customer: { id: repair.customer_id ?? null, ...contact },
    carton: cartonLinked ? { receivingId: repair.receiving_id!, face: `R-${repair.receiving_id}` } : null,
    notes: repair.notes ?? '',
    verbs: repairRecordVerbs(repair),
  };
}
