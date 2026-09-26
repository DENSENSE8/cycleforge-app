'use client';

/** Every label on the open order, as the Label block lists it: */

import { useState } from 'react';
import { Printer, X } from '@/components/Icons';
import { TrackingIdentity } from '@/components/ui/OrderIdentityChips';
import { DESK_BAR_SEGMENT_CLASS, deskBarSegmentTone } from '@/design-system/components/DeskActionSlot';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { Button, TextField } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { requestConfirm } from '@/design-system/components/confirm';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS, RECORD_PRICE_CLASS } from '@/design-system/tokens/industrial-record';
import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { outboundDocumentContentSrc } from '@/lib/documents/outbound-document-display';
import type { OutboundDocument } from '@/lib/documents/types';
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import { LABEL_CREATION_FACE, LABEL_PURPOSE_FACE } from '@/lib/shipping/label-purpose';
import type { OrderLabelEntry } from '@/lib/shipping/order-label-links';
import { toast } from '@/lib/toast';
import { formatCurrency } from '@/utils/_number';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { orderLabelPdfSrc, useOrderLabelActions } from './order-labels-client';
import { printDocument } from '@/lib/orders/order-paperwork-client';

/** Purpose code tone — outbound reads as ink, the second stories stand out. */
const PURPOSE_TONE: Record<OrderLabelEntry['purpose'], string> = {
  outbound: 'border-mode-ink text-mode-ink',
  return: cn('border-current', STATE_TONE_CLASSES.warning.text),
  replacement: cn('border-current', STATE_TONE_CLASSES.info.text),
};

function money(value: number | null, currency: string | null): string {
  if (value == null) return '—';
  return !currency || currency.toUpperCase() === 'USD' ? formatCurrency(value) : `${currency} ${value.toFixed(2)}`;
}

/** Paired labels come off; a bought label is voided; the import's outbound primary is the order's tracking. */
function canUnlink(label: OrderLabelEntry): boolean {
  if (label.creationType === 'linked_manually') return true;
  return label.creationType === 'imported_shipstation' && label.purpose === 'return';
}

export function OrderLabelEntries({
  orderId,
  orderRef,
  labels,
  documents,
}: {
  orderId: number;
  orderRef: string;
  labels: readonly OrderLabelEntry[];
  documents: readonly OutboundDocument[];
}) {
  const actions = useOrderLabelActions(orderId);
  const [ticketFor, setTicketFor] = useState<OrderLabelEntry | null>(null);

  const unlink = async (label: OrderLabelEntry) => {
    const ok = await requestConfirm({
      title: `Unlink this ${LABEL_PURPOSE_FACE[label.purpose].label.toLowerCase()} label?`,
      description: `${label.trackingNumber ?? label.labelId ?? 'The label'} comes off ${orderRef}. The label itself stays in ShipStation; you can link it again.`,
      confirmLabel: 'Unlink',
      tone: 'danger',
    });
    if (!ok) return;
    actions.unlink.mutate(label.id, {
      onSuccess: () => toast.success('Label unlinked'),
      onError: (error) => toast.error(error.message),
    });
  };

  if (labels.length === 0) return null;
  return (
    <>
      <ol className="flex flex-col" data-testid="evidence-label-list">
        {labels.map((label) => {
          const purpose = LABEL_PURPOSE_FACE[label.purpose];
          const carrier = shipStationCarrierToStored(label.carrierCode) ?? label.carrierCode;
          const doc = label.labelDocumentId == null ? null : documents.find((d) => d.id === label.labelDocumentId) ?? null;
          const printSrc = doc ? outboundDocumentContentSrc(doc) : label.printable ? orderLabelPdfSrc(orderId, label.id) : null;
          const voided = label.status === 'voided';
          return (
            <li
              key={label.id}
              data-testid="evidence-label-entry"
              data-purpose={label.purpose}
              data-creation-type={label.creationType}
              className="border-b border-mode-ink last:border-b-0"
            >
              <div className="flex min-h-mode-hit items-center gap-2 border-b border-mode-edge px-4">
                <span
                  title={purpose.label}
                  className={cn(RECORD_LABEL_CLASS, 'border px-1.5 py-0.5 leading-none', PURPOSE_TONE[label.purpose])}
                >
                  {purpose.code}
                </span>
                <span className={cn(RECORD_LABEL_CLASS, 'text-mode-ink')}>{purpose.label}</span>
                <span className={cn(RECORD_LABEL_CLASS, 'min-w-0 flex-1 truncate text-mode-muted')}>
                  · {LABEL_CREATION_FACE[label.creationType].label}
                </span>
                {voided ? <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Voided</span> : null}
              </div>
              <div className={cn('flex flex-col px-4', voided && 'opacity-60')}>
                <EvidenceFactRow label="Carrier">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className={RECORD_LABEL_CLASS}>{carrier ?? '—'}</span>
                    {label.serviceCode ? (
                      <span className="min-w-0 truncate text-mode-muted">{label.serviceCode.replace(/_/g, ' ')}</span>
                    ) : null}
                  </span>
                </EvidenceFactRow>
                <EvidenceFactRow label="Cost">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className={RECORD_PRICE_CLASS}>{money(label.cost, label.currency)}</span>
                    {label.insuranceCost ? (
                      <span className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>+ {money(label.insuranceCost, label.currency)} ins.</span>
                    ) : null}
                  </span>
                </EvidenceFactRow>
                <EvidenceFactRow label={LABEL_CREATION_FACE[label.creationType].verb}>
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="truncate">{label.actor?.name ?? (label.creationType === 'imported_shipstation' ? 'ShipStation' : '—')}</span>
                    <span className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>{label.at ? formatMonthDayTimePST(label.at) : ''}</span>
                  </span>
                </EvidenceFactRow>
                <EvidenceFactRow label="TRK#">
                  <span className="flex min-w-0 items-center" data-testid="evidence-label-tracking">
                    {label.trackingNumber ? (
                      <TrackingIdentity tracking={label.trackingNumber} carrierHint={carrier} />
                    ) : (
                      <span className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>—</span>
                    )}
                  </span>
                </EvidenceFactRow>
                {label.tickets.length > 0 ? (
                  <EvidenceFactRow label="Tickets">
                    <span className="flex min-w-0 flex-wrap items-center gap-1.5 py-1" data-testid="evidence-label-tickets">
                      {label.tickets.map((t) => (
                        <span
                          key={`${t.zendeskTicketId ?? t.supportTicketId}`}
                          className="inline-flex items-stretch border border-mode-ink"
                        >
                          <a
                            href={t.zendeskTicketId ? `/support?ticket=${t.zendeskTicketId}` : undefined}
                            title={[t.subject, t.status].filter(Boolean).join(' · ') || 'Support ticket'}
                            className={cn(RECORD_ID_CLASS, 'px-1.5 leading-6 hover:bg-mode-hover', focusRing('control'))}
                          >
                            #{t.zendeskTicketId ?? t.supportTicketId}
                          </a>
                          {t.zendeskTicketId ? (
                            <button
                              type="button"
                              title="Unlink this ticket from the label"
                              aria-label={`Unlink ticket ${t.zendeskTicketId}`}
                              className={cn('ds-raw-button border-l border-mode-edge px-1 hover:bg-mode-hover', focusRing('control'))}
                              onClick={() =>
                                actions.unlinkTicket.mutate(
                                  { rowId: label.id, ticketId: t.zendeskTicketId! },
                                  { onError: (error) => toast.error(error.message) },
                                )
                              }
                            >
                              <X className="h-3 w-3" aria-hidden />
                            </button>
                          ) : null}
                        </span>
                      ))}
                    </span>
                  </EvidenceFactRow>
                ) : null}
              </div>
              <div className="flex items-stretch bg-mode-bar">
                <button
                  type="button"
                  disabled={!printSrc || voided}
                  title={printSrc ? 'Print this label' : 'Nothing printable for this label'}
                  data-testid="evidence-label-entry-print"
                  className={cn(DESK_BAR_SEGMENT_CLASS, 'flex-1 justify-center border-r border-mode-edge', deskBarSegmentTone(false))}
                  onClick={() => printSrc && printDocument(printSrc)}
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden />
                  Print
                </button>
                <button
                  type="button"
                  disabled={!label.trackingNumber}
                  title="Link this label and the order to a support ticket"
                  data-testid="evidence-label-entry-ticket"
                  className={cn(DESK_BAR_SEGMENT_CLASS, 'flex-1 justify-center border-r border-mode-edge', deskBarSegmentTone(false))}
                  onClick={() => setTicketFor(label)}
                >
                  Ticket
                </button>
                <button
                  type="button"
                  disabled={!canUnlink(label) || actions.unlink.isPending}
                  title={
                    canUnlink(label)
                      ? 'Take this label off the order'
                      : label.creationType === 'bought_in_app'
                        ? 'Bought here — void it in the Labels walk'
                        : "The order's imported primary label — replace its tracking instead"
                  }
                  data-testid="evidence-label-entry-unlink"
                  className={cn(DESK_BAR_SEGMENT_CLASS, 'flex-1 justify-center', deskBarSegmentTone(false))}
                  onClick={() => void unlink(label)}
                >
                  Unlink
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <LabelTicketDialog
        orderRef={orderRef}
        label={ticketFor}
        saving={actions.linkTicket.isPending}
        onClose={() => setTicketFor(null)}
        onConfirm={(ticket) => {
          if (!ticketFor) return;
          actions.linkTicket.mutate(
            { rowId: ticketFor.id, ticket },
            {
              onSuccess: (data) => {
                toast.success(
                  data.orderAnchored
                    ? `Ticket #${data.ticketId} linked to the order and this label`
                    : `Ticket #${data.ticketId} references this label (it was already about another record)`,
                );
                setTicketFor(null);
              },
              onError: (error) => toast.error(error.message),
            },
          );
        }}
      />
    </>
  );
}

function LabelTicketDialog({
  orderRef,
  label,
  saving,
  onClose,
  onConfirm,
}: {
  orderRef: string;
  label: OrderLabelEntry | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (ticket: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const close = () => {
    setDraft('');
    onClose();
  };
  const trimmed = draft.trim();
  return (
    <Dialog open={label != null} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-sm" data-testid="label-ticket-dialog">
        {/* Portals out of the ledger's industrial region; re-declare it. */}
        <ModeRegion mode="industrial" className="contents">
          <DialogHeader>
            <DialogTitle>Link a support ticket</DialogTitle>
            <DialogDescription>
              {label
                ? `${LABEL_PURPOSE_FACE[label.purpose].label} label ${label.trackingNumber ?? ''} on ${orderRef}. The ticket shows the order and this label under its connections.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <TextField
            label="Ticket #"
            value={draft}
            onChange={setDraft}
            aria-label="Ticket number"
            placeholder="48120"
            mono
            autoFocus
            disabled={saving}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => trimmed && onConfirm(trimmed)} disabled={!trimmed || saving} loading={saving}>
              Link ticket
            </Button>
          </DialogFooter>
        </ModeRegion>
      </DialogContent>
    </Dialog>
  );
}
