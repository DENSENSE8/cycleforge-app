'use client';

/**
 * The repair record's HEADER verbs (owner 2026-09-30), in the owner's order:
 * Mark done · Mark pending · Print 2×1 label · Print paperwork · Print receipt
 * · Link ticket · Create ticket, then Change status and Start pickup, with
 * Square checkout and Cancel repair behind ⋮. Which verbs show (and why one is
 * disabled) is the pure model's call (`repairRecordVerbs`); this file only
 * wires each to its existing writer. A panel verb swaps the record body for
 * its panel (Back returns); Start pickup opens the customer signing sheet.
 */

import type { ReactNode } from 'react';
import {
  Check,
  Link2,
  ListChecks,
  Package,
  Pencil,
  Printer,
  Receipt,
  RotateCcw,
  Store,
  Tag,
  Ticket,
  Trash2,
  Wrench,
} from '@/components/Icons';
import type { RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { buildRepairLabelPayload, printRepairLabel } from '@/lib/print/printRepairLabel';
import type { RepairRecordModel, RepairVerbId } from '@/lib/repair/repair-record-model';
import { RepairStatusList } from '../cards/RepairStatusList';
import { useRepairStatusChange } from '../useRepairStatusChange';
import { RepairInfoEditor } from './RepairInfoEditor';
import { RepairBenchPanel } from './RepairBenchPanel';
import { RepairCreateTicketPanel, RepairLinkTicketPanel, useRepairLinkedTickets } from './RepairTicketPanels';
import {
  CancelRepairPanel,
  PickupDisplay,
  TicketNumberPanel,
  markLabelPrinted,
  openSquareCheckout,
  printPage,
} from './repair-record-verb-panels';

/** An Actions panel verb; `panel` verbs swap the record body for their panel, with Back. */
export interface RepairRecordVerb extends RecordActionVerb {
  panel?: (done: () => void) => ReactNode;
}

/**
 * Every verb the open repair offers, in strip order. `refresh` refetches the
 * open record after a write; `onClose` closes it (after Cancel).
 */
export function useRepairRecordVerbs(
  repair: RSRecord | null,
  model: RepairRecordModel | null,
  { refresh, onClose }: { refresh: () => void; onClose: () => void },
): RepairRecordVerb[] {
  const changeStatus = useRepairStatusChange();
  const linked = useRepairLinkedTickets(repair?.id ?? 0);
  if (!repair || !model) return [];
  const linkedTicket = (linked.data ?? []).find((row) => row.ticketId != null)?.ticketId ?? null;
  const typedTicket = /^\d+$/.test(String(model.title.ticket ?? '')) ? Number(model.title.ticket) : null;
  const triageTicket = linkedTicket ?? typedTicket;

  const setStatus = async (next: string) => {
    await changeStatus(repair, next);
    refresh();
  };

  const all: Record<RepairVerbId, RepairRecordVerb> = {
    'mark-done': {
      id: 'mark-done',
      label: 'Mark done',
      icon: <Check aria-hidden />,
      tone: 'success',
      hotkey: 'd',
      run: () => setStatus('Done'),
    },
    'mark-pending': {
      id: 'mark-pending',
      label: 'Mark pending',
      icon: <RotateCcw aria-hidden />,
      hotkey: 'p',
      run: () => setStatus('Pending Repair'),
    },
    pickup: {
      id: 'pickup',
      label: 'Start pickup',
      icon: <Package aria-hidden />,
      tone: 'blue',
      hotkey: 'u',
      display: (done) => <PickupDisplay repair={repair} onUpdate={refresh} done={done} />,
    },
    label: {
      id: 'label',
      label: 'Print 2×1 label',
      icon: <Tag aria-hidden />,
      hotkey: 'l',
      run: async () => {
        printRepairLabel(
          buildRepairLabelPayload({
            repairId: repair.id,
            customerName: model.customer.name ?? repair.contact_info,
            ticketNumber: repair.ticket_number,
            intakeAt: repair.created_at,
          }),
        );
        // The first print takes the repair off the Needs-label queue (idempotent server-side).
        await markLabelPrinted(repair.id);
        refresh();
      },
    },
    paperwork: {
      id: 'paperwork',
      label: 'Print paperwork',
      icon: <Printer aria-hidden />,
      hotkey: 'w',
      run: () => printPage(`/api/repair-service/print/${repair.id}`, 'Repair paperwork'),
    },
    receipt: {
      id: 'receipt',
      label: 'Print receipt',
      icon: <Receipt aria-hidden />,
      hotkey: 'r',
      run: () => printPage(`/api/counter/visit/${repair.counter_transaction_id}/receipt?print=1`, 'Repair receipt'),
    },
    'edit-info': {
      id: 'edit-info',
      label: 'Edit information',
      icon: <Pencil aria-hidden />,
      hotkey: 'i',
      panel: (done) => <RepairInfoEditor repair={repair} onSaved={refresh} onDone={done} />,
    },
    'work-log': {
      id: 'work-log',
      label: 'Bench log',
      icon: <Wrench aria-hidden />,
      hotkey: 'b',
      panel: () => <RepairBenchPanel repair={repair} />,
    },
    'triage-ticket': {
      id: 'triage-ticket',
      label: 'Triage ticket',
      icon: <Ticket aria-hidden />,
      hotkey: 't',
      disabled: triageTicket == null,
      disabledReason: triageTicket == null ? 'Add or link a support ticket first' : undefined,
      panel: () => triageTicket == null ? null : (
        <SupportTicketDetail
          ticketId={triageTicket}
          embedded
          hideLinkedContext
          showRequesterDetail
          mergeFloorTimeline
        />
      ),
    },
    'link-ticket': {
      id: 'link-ticket',
      label: 'Link ticket',
      icon: <Link2 aria-hidden />,
      hotkey: 'v',
      panel: (done) => (
        <RepairLinkTicketPanel
          repair={repair}
          onDone={() => {
            refresh();
            done();
          }}
        />
      ),
    },
    'ticket-number': {
      id: 'ticket-number',
      label: model.title.ticket ? 'Edit ticket #' : 'Add ticket #',
      icon: <Pencil aria-hidden />,
      hotkey: 'e',
      panel: (done) => (
        <TicketNumberPanel
          repair={repair}
          onSaved={() => {
            refresh();
            done();
          }}
        />
      ),
    },
    'create-ticket': {
      id: 'create-ticket',
      label: 'Create ticket',
      icon: <Ticket aria-hidden />,
      hotkey: 'c',
      // One helpdesk ticket per repair: create only while none is linked.
      disabled: linkedTicket != null,
      disabledReason: linkedTicket != null ? `Ticket #${linkedTicket} is already linked — unlink it under Link ticket first` : undefined,
      panel: (done) => (
        <RepairCreateTicketPanel
          repair={repair}
          onDone={() => {
            refresh();
            done();
          }}
        />
      ),
    },
    status: {
      id: 'status',
      label: 'Change status',
      icon: <ListChecks aria-hidden />,
      hotkey: 's',
      panel: (done) => (
        <RepairStatusList
          current={model.status.stored}
          testId="repair-record-status-list"
          onPick={(next) => {
            done();
            void setStatus(next);
          }}
        />
      ),
    },
    square: {
      id: 'square',
      label: 'Square checkout',
      icon: <Store aria-hidden />,
      run: () => openSquareCheckout(repair),
    },
    cancel: {
      id: 'cancel',
      label: 'Cancel repair',
      icon: <Trash2 aria-hidden />,
      tone: 'danger',
      panel: () => (
        <CancelRepairPanel
          repair={repair}
          onCancelled={() => {
            refresh();
            onClose();
          }}
        />
      ),
    },
  };

  // Owner order; Start pickup leads once the device can leave.
  const order: RepairVerbId[] = [
    'pickup',
    'mark-done',
    'mark-pending',
    'label',
    'paperwork',
    'receipt',
    'edit-info',
    'work-log',
    'triage-ticket',
    'link-ticket',
    'ticket-number',
    'create-ticket',
    'status',
    'square',
    'cancel',
  ];
  return order.flatMap((id) => {
    const state = model.verbs[id];
    if (state.hidden) return [];
    const verb = all[id];
    return [state.disabledReason ? { ...verb, disabled: true, disabledReason: state.disabledReason } : verb];
  });
}
