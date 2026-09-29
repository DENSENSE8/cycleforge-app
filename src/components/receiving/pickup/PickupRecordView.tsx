'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Printer, Ticket } from '@/components/Icons';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import {
  EvidenceFact,
  EvidenceFacts,
  EvidenceStateStrip,
} from '@/design-system/components/record-ledger/RecordEvidence';
import { Button } from '@/design-system/primitives/Button';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordPhoto, recordInitials } from '@/design-system/components/record-ledger/IndustrialRecord';
import {
  RECORD_FACT_KEY_CLASS,
  RECORD_ID_CLASS,
  RECORD_PRICE_CLASS,
} from '@/design-system/tokens/industrial-record';
import { conditionSentenceLabel, resolveConditionGrade } from '@/lib/conditions';
import { printReceivingLineLabelsByIds } from '@/lib/receiving/print-receiving-line-labels';
import type { ReceivingUnitStageFactView } from '@/lib/receiving/receiving-line-row';
import { useEntitySupportTicket } from '@/hooks/useEntitySupportTicket';
import { formatDateKeyMedium } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { TicketDisplayHost } from '@/components/receiving/workspace/line-edit/TicketDisplayHost';
import { TicketLinkPopover } from '@/components/support/context/TicketLinkPopover';
import { SupportCreateTicketModal } from '@/components/support/service-workspace/SupportCreateTicketModal';
import { useSupportTicketClaimHost } from '@/components/support/service-workspace/useSupportTicketClaimHost';
import { pickupMoney, type PickupLine } from './pickup-lines';
import { pickupRecordCardState, type PickupCardModel } from './cards/pickup-card-model';

function qcLabel(state: ReceivingUnitStageFactView['qc_state']): string {
  if (state === 'TEST_AGAIN') return 'Retest';
  return state[0] + state.slice(1).toLowerCase();
}

function testedFace(fact: ReceivingUnitStageFactView): string | null {
  if (!fact.tested_at && !fact.tested_by_name) return null;
  const when = fact.tested_at
    ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(fact.tested_at))
    : null;
  return [fact.tested_by_name, when].filter(Boolean).join(' · ');
}

function PickupUnit({
  fact,
  ordinal,
  fallbackCondition,
  onOpenTicket,
  onOpenUnit,
  onCreateTicket,
}: {
  fact: ReceivingUnitStageFactView | null;
  ordinal: number;
  fallbackCondition: string | null;
  onOpenTicket: (fact: ReceivingUnitStageFactView) => void;
  onOpenUnit: (serialUnitId: number) => void;
  onCreateTicket: (fact: ReceivingUnitStageFactView, identity: string) => void;
}) {
  const [linkingTicket, setLinkingTicket] = useState(false);
  const queryClient = useQueryClient();
  const identity = fact?.unit_uid || fact?.serial || `Unit ${ordinal}`;
  const conditionGrade = fact?.condition_grade || fallbackCondition;
  const condition = conditionGrade
    ? conditionSentenceLabel(resolveConditionGrade(conditionGrade))
    : 'Not recorded';
  return (
    <div data-testid="pickup-record-unit" className="grid min-w-0 gap-2 border-t border-mode-fact px-4 py-2 @xl/record:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(6rem,auto))_auto] @xl/record:items-center">
      <div className="min-w-0">
        <p className={cn(RECORD_ID_CLASS, 'truncate')} title={identity}>{identity}</p>
        <p className="truncate text-role-micro text-mode-muted">
          {fact?.serial ? `SN ${fact.serial}` : `Physical unit ${ordinal}`}
        </p>
      </div>
      <p className="text-role-data">
        <span className={RECORD_FACT_KEY_CLASS}>Condition </span>{condition}
      </p>
      <p className={cn('text-role-data font-semibold', fact?.qc_state === 'FAILED' ? 'text-text-danger' : fact?.qc_state === 'PASSED' ? 'text-text-success' : 'text-text-warning')}>
        {fact ? qcLabel(fact.qc_state) : 'Pending'}
      </p>
      <p className={cn('text-role-data', fact?.label_state === 'PRINTED' ? 'text-mode-ink' : 'font-semibold text-text-warning')}>
        {fact?.label_state === 'PRINTED' ? 'Label printed' : 'Label missing'}
        {fact && testedFace(fact) ? <span className="block truncate text-role-micro font-normal text-mode-muted">{testedFace(fact)}</span> : null}
      </p>
      <div className="flex flex-wrap justify-end gap-1.5">
        {fact?.primary_support_ticket_id ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenTicket(fact)}>
            <Ticket className="size-3.5" aria-hidden /> Ticket #{fact.primary_support_ticket_id}
          </Button>
        ) : null}
        {!fact?.primary_support_ticket_id && fact?.serial_unit_id && fact.qc_state === 'FAILED' ? (
          <>
            <Button type="button" variant="secondary" size="sm" onClick={() => onCreateTicket(fact, identity)}>
              <Ticket className="size-3.5" aria-hidden /> New ticket
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setLinkingTicket((open) => !open)}>
              <Ticket className="size-3.5" aria-hidden /> Link ticket
            </Button>
          </>
        ) : null}
        {fact?.serial_unit_id ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => onOpenUnit(fact.serial_unit_id!)}>
            <ExternalLink className="size-3.5" aria-hidden /> Open unit
          </Button>
        ) : null}
      </div>
      {linkingTicket && fact?.serial_unit_id ? (
        <div className="@xl/record:col-span-5">
          <TicketLinkPopover
            linkable={{
              canLinkTicket: true,
              anchorType: 'serialUnit',
              anchorId: fact.serial_unit_id,
              serialUnitId: fact.serial_unit_id,
            }}
            open
            onClose={() => setLinkingTicket(false)}
            onLinked={() => void queryClient.invalidateQueries({ queryKey: ['local-pickup-lines'] })}
            title={`Link ticket to ${identity}`}
          />
        </div>
      ) : null}
    </div>
  );
}

function PickupItem({
  row,
  current,
  printing,
  onPrint,
  onOpenTicket,
  onOpenUnit,
  onCreateTicket,
}: {
  row: PickupLine;
  current: boolean;
  printing: boolean;
  onPrint: (lineId: number) => void;
  onOpenTicket: (fact: ReceivingUnitStageFactView, row: PickupLine) => void;
  onOpenUnit: (serialUnitId: number) => void;
  onCreateTicket: (fact: ReceivingUnitStageFactView, row: PickupLine, identity: string) => void;
}) {
  const title = row.product_title || row.sku || 'Unidentified item';
  const note = (row.missing_parts_note || row.condition_note || '').trim() || null;
  const condition = row.condition_grade ? conditionSentenceLabel(resolveConditionGrade(row.condition_grade)) : 'Not recorded';
  return (
    <article
      data-testid="pickup-record-item"
      data-line-id={row.id}
      data-current={current ? '' : undefined}
      className={cn('border-b border-mode-fact last:border-b-0', current ? 'bg-mode-panel' : 'bg-mode-bar')}
    >
      <div className="flex gap-3 px-4 py-3">
        <span className="relative h-24 w-24 shrink-0 overflow-hidden rounded-mode-control border border-mode-frame bg-mode-well">
          <RecordPhoto src={row.image_url} fallback={recordInitials(title)} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-start gap-2">
            <p className="line-clamp-2 min-w-0 flex-1 text-role-body font-bold text-mode-ink" title={title}>{title}</p>
            {row.receiving_line_id ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={printing}
                onClick={() => onPrint(row.receiving_line_id!)}
                data-testid="pickup-print-unit-labels"
              >
                <Printer className="size-3.5" aria-hidden />
                {printing ? 'Printing…' : (row.unit_stage_facts ?? []).some((fact) => fact.label_state === 'PRINTED') ? 'Reprint labels' : 'Print labels'}
              </Button>
            ) : null}
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-role-data">
            <span>
              <span className={RECORD_FACT_KEY_CLASS}>SKU </span>
              <span className={cn(RECORD_ID_CLASS, 'select-all')}>{row.sku || '—'}</span>
            </span>
            <span>
              <span className={RECORD_FACT_KEY_CLASS}>Qty </span>
              <span className={RECORD_ID_CLASS}>{row.quantity}</span>
            </span>
            <span>
              <span className={RECORD_FACT_KEY_CLASS}>Condition </span>
              <span>{condition}</span>
            </span>
            <span>
              <span className={RECORD_FACT_KEY_CLASS}>Price </span>
              <span className={RECORD_PRICE_CLASS}>{pickupMoney(row.total_price)}</span>
            </span>
          </p>
        </div>
      </div>
      {note || row.parts_status ? (
        <div className="px-4 pb-2">
          {row.parts_status ? <EvidenceFactRow label="Parts">{row.parts_status}</EvidenceFactRow> : null}
          {note ? <EvidenceFactRow label="Notes" wide>{note}</EvidenceFactRow> : null}
        </div>
      ) : null}
      {Array.from({ length: Math.max(1, Number(row.quantity) || 0, row.unit_stage_facts?.length ?? 0) }, (_, index) => (
        <PickupUnit
          key={row.unit_stage_facts?.[index]?.receiving_line_unit_id ?? `virtual:${row.id}:${index + 1}`}
          fact={row.unit_stage_facts?.[index] ?? null}
          ordinal={row.unit_stage_facts?.[index]?.ordinal ?? index + 1}
          fallbackCondition={row.condition_grade}
          onOpenTicket={(fact) => onOpenTicket(fact, row)}
          onOpenUnit={onOpenUnit}
          onCreateTicket={(fact, identity) => onCreateTicket(fact, row, identity)}
        />
      ))}
    </article>
  );
}

interface PickupTicketTarget {
  serialUnitId: number | null;
  lineId: number | null;
  receivingId: number | null;
  projectedTicketId: number;
}

interface PickupTicketCreateTarget extends PickupTicketTarget {
  identity: string;
}

function PickupTicketDisplay({
  target,
  onClose,
}: {
  target: PickupTicketTarget;
  onClose: () => void;
}) {
  const ticket = useEntitySupportTicket({
    serialUnitId: target.serialUnitId,
    lineId: target.lineId,
    receivingId: target.receivingId,
  });
  const providerTicketId = ticket.data?.providerTicketId ?? null;

  if (ticket.isLoading) {
    return <p className="px-4 py-6 text-role-data text-mode-muted">Loading ticket…</p>;
  }
  if (ticket.isError || providerTicketId == null) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-6">
        <p className="text-role-data text-mode-muted">
          Ticket #{target.projectedTicketId} is linked, but its provider thread is unavailable.
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>Back to pickup</Button>
      </div>
    );
  }

  return (
    <div className="h-[min(72vh,52rem)] min-h-0">
      <TicketDisplayHost
        receivingId={target.receivingId}
        ticketId={providerTicketId}
        onCloseTicket={onClose}
      />
    </div>
  );
}

export function PickupRecordView({ model, openLineId }: { model: PickupCardModel; openLineId: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [printingLineId, setPrintingLineId] = useState<number | null>(null);
  const [ticketTarget, setTicketTarget] = useState<PickupTicketTarget | null>(null);
  const [createTarget, setCreateTarget] = useState<PickupTicketCreateTarget | null>(null);
  const claim = useSupportTicketClaimHost();
  const lead = model.line;
  const pickupDate = model.pickupDate
    ? formatDateKeyMedium(model.pickupDate, { weekday: 'short', withYear: true })
    : 'Not recorded';
  const next = model.state.id === 'PROCESS' ? 'Process' : model.unitSummary.nextAction;
  const printLine = async (lineId: number) => {
    if (printingLineId != null) return;
    setPrintingLineId(lineId);
    try {
      await printReceivingLineLabelsByIds([lineId]);
      await queryClient.invalidateQueries({ queryKey: ['local-pickup-lines'] });
    } finally {
      setPrintingLineId(null);
    }
  };
  const main = ticketTarget ? (
    <RecordGroup title="Linked ticket" testId="pickup-record-ticket">
      <PickupTicketDisplay target={ticketTarget} onClose={() => setTicketTarget(null)} />
    </RecordGroup>
  ) : (
    <RecordGroup title={`Items · ${model.rows.length} · ${model.unitSummary.compact}`} testId="pickup-record-items">
      {model.rows.map((row) => (
        <PickupItem
          key={row.id}
          row={row}
          current={row.id === openLineId}
          printing={printingLineId === row.receiving_line_id}
          onPrint={(lineId) => void printLine(lineId)}
          onOpenTicket={(fact, ticketRow) => setTicketTarget({
            serialUnitId: fact.serial_unit_id,
            lineId: ticketRow.receiving_line_id ?? null,
            receivingId: ticketRow.receiving_id,
            projectedTicketId: fact.primary_support_ticket_id!,
          })}
          onOpenUnit={(serialUnitId) => router.push(`/inventory/units?unit=${serialUnitId}`)}
          onCreateTicket={(fact, ticketRow, identity) => {
            if (!fact.serial_unit_id) return;
            const target = {
              serialUnitId: fact.serial_unit_id,
              lineId: ticketRow.receiving_line_id ?? null,
              receivingId: ticketRow.receiving_id,
              projectedTicketId: 0,
              identity,
            };
            setCreateTarget(target);
            claim.openCreate({ type: 'serialUnit', serialUnitId: fact.serial_unit_id });
          }}
        />
      ))}
    </RecordGroup>
  );
  const aside = (
    <div className="flex min-w-0 flex-col gap-4">
      <RecordGroup title="Pickup" testId="pickup-record-facts">
        <div className="px-4 pb-3">
          <EvidenceFacts>
            <EvidenceFact label="Order" mono>{model.identity}</EvidenceFact>
            <EvidenceFact label="Date">{pickupDate}</EvidenceFact>
            <EvidenceFact label="Seller">{model.customer || '—'}</EvidenceFact>
            <EvidenceFact label="Items">{model.itemCount}</EvidenceFact>
            <EvidenceFact label="QC">{model.unitSummary.compact}</EvidenceFact>
            <EvidenceFact label="Labels">{model.unitSummary.labelsPrinted}/{model.unitSummary.units} printed</EvidenceFact>
            <EvidenceFact label="Tickets">{model.unitSummary.tickets || '—'}</EvidenceFact>
            <EvidenceFact label="Total" mono>{pickupMoney(String(model.totalValue))}</EvidenceFact>
            <EvidenceFact label="Payment">{model.paymentMethod || '—'}</EvidenceFact>
            <EvidenceFact label="Paid" mono>
              {model.paidAmountCents == null ? '—' : pickupMoney(String(model.paidAmountCents / 100))}
            </EvidenceFact>
            <EvidenceFact label="Reference" mono>{lead.reference_number || '—'}</EvidenceFact>
            <EvidenceFact label="Carton" mono>{lead.receiving_id ?? '—'}</EvidenceFact>
          </EvidenceFacts>
        </div>
      </RecordGroup>
      {lead.zoho_po_id || lead.zoho_status || lead.zoho_vendor_name ? (
        <RecordGroup title="Source record" testId="pickup-record-source">
          <div className="px-4 pb-3">
            <EvidenceFacts>
              <EvidenceFact label="Zoho PO" mono>{lead.zoho_po_id || '—'}</EvidenceFact>
              <EvidenceFact label="Status">{lead.zoho_status || '—'}</EvidenceFact>
              <EvidenceFact label="Vendor">{lead.zoho_vendor_name || '—'}</EvidenceFact>
            </EvidenceFacts>
          </div>
        </RecordGroup>
      ) : null}
    </div>
  );
  return (
    <>
      <div className="flex flex-1 flex-col gap-4 bg-mode-canvas p-4 text-mode-ink" data-testid="pickup-record-view">
        <EvidenceStateStrip state={pickupRecordCardState(model)} next={next} />
        <DeskRecordLayout main={main} aside={aside} />
      </div>
      <SupportCreateTicketModal
        open={claim.createOpen}
        defaultSubject={createTarget ? `Receiving failure · ${createTarget.identity}` : 'Receiving failure'}
        submitting={claim.createTicket.isPending}
        onClose={() => {
          claim.closeCreate();
          setCreateTarget(null);
        }}
        onCreate={({ subject, note, linkages }) =>
          claim.createTicket.mutate(
            { subject, note, linkages },
            {
              onSuccess: (data) => {
                if (createTarget) {
                  setTicketTarget({
                    serialUnitId: createTarget.serialUnitId,
                    lineId: createTarget.lineId,
                    receivingId: createTarget.receivingId,
                    projectedTicketId: data.supportTicketId,
                  });
                }
                setCreateTarget(null);
                void queryClient.invalidateQueries({ queryKey: ['local-pickup-lines'] });
              },
            },
          )
        }
      />
    </>
  );
}
