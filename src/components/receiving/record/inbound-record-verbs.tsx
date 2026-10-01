'use client';

/**
 * The inbound record's HEADER verbs (owner 2026-09-29) — Allocate's ordering:
 * the most-used verbs in colour at the header's right, the rest behind ⋮,
 * the destructive verb last. Every capability the retired inline tabs held
 * (pairing, marketplace seller, email, PO note, Zoho receive
 * sync, the audit timeline, claims, attach tracking) is one verb here: a
 * panel verb swaps the record body for its panel (Back returns), a modal verb
 * opens its dialog, the rest navigate or act.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Camera,
  Copy,
  FileText,
  History,
  Link2,
  Mail,
  Package,
  Printer,
  RefreshCw,
  Store,
  Ticket,
  Trash2,
} from '@/components/Icons';
import { requestConfirm } from '@/design-system/components/confirm';
import { evidenceVerbClass } from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { TimelineSection } from '@/components/ui/TimelineSection';
import { buildRecordTaskVerbs } from '@/components/tasks/RecordTaskActions';
import { ReceivingClaimPanel } from '@/components/receiving/workspace/ReceivingClaimPanel';
import { ReceivingAuditPanel } from '@/components/receiving/workspace/ReceivingAuditPanel';
import { MovePhotosBetweenPoPanel } from '@/components/receiving/workspace/line-edit/MovePhotosBetweenPoPanel';
import { emitReceiving } from '@/components/receiving/receiving-events';
import type { CartonRecord } from '@/components/receiving/history/use-carton-record';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { IncomingAttachTrackingPopover } from '@/components/sidebar/receiving/IncomingAttachTrackingPopover';
import { EbayTab } from '@/components/sidebar/receiving/incoming-details/EbayTab';
import { EmailTab } from '@/components/sidebar/receiving/incoming-details/EmailTab';
import { PairingTab } from '@/components/sidebar/receiving/incoming-details/PairingTab';
import {
  copyValue,
  fmtDateTime,
  type DetailsResponse,
} from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import type { IncomingDetailsController } from '@/components/sidebar/receiving/incoming-details/useIncomingDetails';
import { ZohoReceiveSyncControl } from '@/components/zoho/ZohoReceiveSyncControl';
import { useAuth } from '@/contexts/AuthContext';
import type { IncomingDetailsFromRowResult } from '@/lib/receiving/incoming-details-target';
import { printReceivingLineLabels } from '@/lib/receiving/print-receiving-line-labels';
import { formatReceivingCopyRow } from '@/lib/receiving/receiving-copy-row';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { openInUnboxHref } from '@/lib/receiving/surface-path';
import { removeReceivingRailByCarton } from '@/lib/queries/receiving-queries';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { inventoryEventsToTimeline } from '@/lib/timeline/inventory-events';
import { toast } from '@/lib/toast';
import { dispatchReceivingOpenPairingPo } from '@/utils/events';
import { cn } from '@/utils/_cn';
import type { RecordVerb } from '@/design-system/components/record-ledger/record-model';
import { cartonIdOf } from './inbound-record-model';

const NO_CARTON = 'Available after the door scan — no carton yet';

/** Read-only text panel (the synced Zoho PO note). */
function NotePanel({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap break-words text-role-data">{text}</p>;
}

/** The receiving audit trail: the carton's timeline, the lines' receive / test events, the vendor's Zoho activity. */
function InboundTimelinePanel({
  receivingId,
  data,
  onClose,
}: {
  receivingId: number | null;
  data: DetailsResponse | null;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="inbound-record-timeline">
      {receivingId ? <ReceivingAuditPanel open receivingId={receivingId} onClose={onClose} hideHeader /> : null}
      {data ? (
        <TimelineSection
          title="Receiving & testing"
          items={inventoryEventsToTimeline(data.receive_events ?? [])}
          emptyMessage="No receiving or testing activity yet."
          className=""
        />
      ) : null}
      {data?.zoho_activity.length ? (
        <section aria-label="Vendor activity">
          <h4 className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Vendor activity</h4>
          <ol className="mt-1 flex flex-col border-t border-mode-fact">
            {data.zoho_activity.map((event, index) => (
              <li key={`${event.timestamp}:${index}`} className="border-b border-mode-fact py-2 text-role-data last:border-b-0">
                <p className={RECORD_LABEL_CLASS}>
                  {fmtDateTime(event.timestamp)} · {event.label}
                </p>
                {event.description ? <p className="whitespace-pre-wrap text-mode-muted">{event.description}</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

/** The incoming delivery's read + controller — one per open record, shared by the view and its verbs. */
export interface IncomingDelivery {
  /** The row's details target, or why it has none; null when nothing is open. */
  resolved: IncomingDetailsFromRowResult | null;
  controller: IncomingDetailsController;
}

export function buildInboundDeliveryVerbs({
  row,
  delivery,
  canSyncZoho,
  navigate,
  onRemoved,
}: {
  row: ReceivingLineRow;
  delivery: IncomingDelivery;
  canSyncZoho: boolean;
  /** Client navigation (`router.push`). */
  navigate: (href: string) => void;
  /** The record is gone from Incoming — close it. */
  onRemoved: () => void;
}): RecordVerb[] {
  const c = delivery.controller;
  const data = c.data?.success ? c.data : undefined;
  const target = delivery.resolved?.ok ? delivery.resolved.target : null;
  const cartonId = cartonIdOf(row, data);
  const po = data?.po?.zoho_purchaseorder_number || row.zoho_purchaseorder_number || null;
  const poId = (data?.po?.zoho_purchaseorder_id || row.zoho_purchaseorder_id || '').trim();
  const tracking = (data?.shipment?.tracking_number || row.tracking_number || data?.inbound?.tracking_number || '').trim();
  const unpaired = data != null && !data.po?.zoho_purchaseorder_id && !data.inbound;
  const ticket = (row.zendesk_ticket || '').trim() || null;
  const poNote = (data?.po_notes || '').trim() || null;

  const primary: RecordVerb[] = [];
  if (unpaired && data) {
    primary.push({
      id: 'pair',
      label: 'Pair to PO',
      icon: <Link2 aria-hidden />,
      tone: 'warning',
      panel: (done) => (
        <PairingTab
          data={data}
          seedRow={row}
          focusReceivingId={target?.receivingId ?? null}
          focusReceivingLineId={target?.receivingLineId ?? null}
          onPaired={() => {
            c.invalidateIncoming();
            done();
          }}
        />
      ),
    });
  }
  if (!tracking && poId) {
    primary.push({
      id: 'attach-tracking',
      label: 'Attach tracking',
      icon: <Link2 aria-hidden />,
      tone: 'yellow',
      // The attach dialog over the record; the header reads which verb is open.
      display: (done) => (
        <>
          <span className="truncate text-role-caption text-mode-muted">Attaching tracking…</span>
          <IncomingAttachTrackingPopover
            presetPo={{ poId, poNumber: po }}
            open
            trigger={null}
            onOpenChange={(open) => {
              if (!open) done();
            }}
            onAttached={c.invalidateIncoming}
          />
        </>
      ),
    });
  }
  primary.push(
    {
      id: 'unbox',
      label: 'Open in Unbox',
      icon: <Package aria-hidden />,
      tone: 'blue',
      disabled: cartonId == null,
      disabledReason: 'No carton yet — it opens in Unbox after the door scan',
      run: () => {
        if (cartonId != null) navigate(openInUnboxHref(cartonId, row.id > 0 ? row.id : undefined));
      },
    },
    {
      id: 'claim',
      label: ticket ? 'Update claim' : 'File claim',
      icon: <Ticket aria-hidden />,
      panel: (done) => (
        <ReceivingClaimPanel
          open
          row={row}
          chrome="display"
          onClose={done}
          onTicketCreated={() => {
            c.invalidateIncoming();
            done();
          }}
        />
      ),
    },
    {
      id: 'sync',
      label: c.syncing ? 'Syncing…' : 'Sync',
      icon: <RefreshCw aria-hidden />,
      disabled: !target || c.isShipmentOnly || c.isCartonOnly || c.syncing,
      disabledReason: c.syncing ? 'Sync in progress' : 'No purchase order to re-pull',
      run: () => c.syncOne(),
    },
  );

  const overflow: RecordVerb[] = [
    {
      id: 'timeline',
      label: 'Timeline',
      icon: <History aria-hidden />,
      disabled: data == null && cartonId == null,
      disabledReason: 'Details still loading',
      panel: (done) => <InboundTimelinePanel receivingId={cartonId} data={data ?? null} onClose={done} />,
    },
    {
      id: 'email',
      label: 'Email',
      icon: <Mail aria-hidden />,
      disabled: !data?.po,
      disabledReason: 'No purchase-order mailbox thread without a purchase order',
      panel: () => (data ? <EmailTab data={data} /> : null),
    },
    ...(data?.inbound
      ? [{
          id: 'marketplace',
          label: 'Seller & account',
          icon: <Store aria-hidden />,
          panel: () => <EbayTab data={data} />,
        } satisfies RecordVerb]
      : []),
    {
      id: 'po-note',
      label: 'PO note',
      icon: <FileText aria-hidden />,
      disabled: poNote == null,
      disabledReason: 'The purchase order carries no note',
      panel: () => (poNote ? <NotePanel text={poNote} /> : null),
    },
    ...(canSyncZoho
      ? [{
          id: 'zoho-receive',
          label: 'Zoho receive sync',
          icon: <RefreshCw aria-hidden />,
          panel: () => <ZohoReceivePanel />,
        } satisfies RecordVerb]
      : []),
    {
      id: 'copy',
      label: 'Copy details',
      icon: <Copy aria-hidden />,
      run: () => copyValue(formatReceivingCopyRow(row), 'Details'),
    },
    ...(cartonId
      ? buildRecordTaskVerbs({ entityType: 'receiving', entityId: cartonId, label: po ? `PO ${po}` : `Carton ${cartonId}` })
      : [
          { id: 'task-mine', label: 'Add task', disabled: true, disabledReason: NO_CARTON },
          { id: 'task-staff', label: 'Send to staff as task', disabled: true, disabledReason: NO_CARTON },
        ]),
    {
      id: 'remove',
      label: 'Remove from Incoming',
      icon: <Trash2 aria-hidden />,
      tone: 'danger',
      disabled: data == null,
      disabledReason: 'Details still loading',
      run: async () => {
        const confirmed = await requestConfirm({
          title: 'Remove from Incoming',
          description: data?.po
            ? 'Removes every incoming line for this purchase order. The upstream purchase order is unchanged.'
            : 'Removes this incoming record.',
          confirmLabel: 'Remove',
          tone: 'danger',
        });
        if (!confirmed) return;
        await c.handleDelete();
        onRemoved();
      },
    },
  ];
  return [...primary, ...overflow];
}

/** Pushes every unboxed / received line Zoho has not recorded yet — not just this record; the drain also runs every 5 minutes. */
function ZohoReceivePanel() {
  return (
    <div className="flex items-center justify-between gap-3" data-testid="inbound-record-zoho-sync">
      <span className="text-role-caption text-text-muted">Received status</span>
      <ZohoReceiveSyncControl />
    </div>
  );
}

/** Claim for a carton: pick the item (when the carton has several), then the claim wizard for that line. */
function CartonClaimPanel({ record, onDone }: { record: CartonRecord; onDone: () => void }) {
  const { itemLines, live } = record;
  const [line, setLine] = useState<ReceivingLineRow | null>(itemLines.length === 1 ? itemLines[0]! : null);
  if (!line) {
    return (
      <div className="flex flex-col gap-2" data-testid="carton-claim-pick">
        <p className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Which item is the claim for?</p>
        {itemLines.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            className={cn(evidenceVerbClass(candidate.id === live.id), 'justify-start normal-case tracking-normal')}
            onClick={() => setLine(candidate)}
          >
            <ItemFace line={candidate} />
          </button>
        ))}
      </div>
    );
  }
  return (
    <ReceivingClaimPanel
      chrome="display"
      open
      row={line}
      onClose={onDone}
      onTicketCreated={(ticket) => {
        toast.success(`Claim ${ticket} linked`);
        record.refresh();
      }}
      onTicketUnlinked={record.refresh}
    />
  );
}

function ItemFace({ line }: { line: ReceivingLineRow }): ReactNode {
  const title = resolveSkuIdentityTitle({
    zoho_item_title: line.zoho_item_title,
    catalog_product_title: line.catalog_product_title,
    item_name: line.item_name,
    sku: line.sku,
  });
  const ticket = (line.zendesk_ticket || '').trim();
  return (
    <span className="truncate">
      {title || 'Unidentified item'}
      {line.sku ? ` · ${line.sku}` : ''}
      {ticket ? ` · ticket ${ticket}` : ''}
    </span>
  );
}

/**
 * The open carton's header verbs — `[]` when nothing is open. Lead verb by
 * the carton's state: an unfound carton leads with Resolve, one on the bench
 * with Open in Unbox, a finished one with Print labels.
 */
export function useInboundCartonVerbs(record: CartonRecord | null, onClose: () => void): RecordVerb[] {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canSyncZoho = useAuth().has('integrations.zoho');
  const live = record?.live ?? null;
  const receivingId = record?.receivingId ?? null;

  // Open the carton on the Unbox bench: the live line when the bench listens
  // on this page, else the Unbox route. Unfound → straight into pairing.
  const openInUnbox = useCallback(
    (pairing = false) => {
      if (!live || receivingId == null) return;
      onClose();
      if (live.id > 0) {
        dispatchSelectLine(live);
        if (pairing) window.requestAnimationFrame(() => dispatchReceivingOpenPairingPo());
      } else {
        router.push(openInUnboxHref(receivingId));
      }
    },
    [live, receivingId, onClose, router],
  );

  // Deletes the whole carton (`receiving_carton`) — rail mirror, the list
  // query and the shared `receiving-entry-deleted` event all refresh.
  const deleteCarton = useCallback(async () => {
    if (receivingId == null) return;
    const confirmed = await requestConfirm({
      title: 'Delete carton',
      description: 'Deletes this carton and its receiving lines.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    const res = await fetch(`/api/receiving-logs?id=${encodeURIComponent(String(receivingId))}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      toast.error(body?.error || `Delete failed (${res.status})`);
      return;
    }
    removeReceivingRailByCarton(queryClient, receivingId);
    void queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
    emitReceiving('receiving-entry-deleted', receivingId);
    toast.success('Carton deleted');
    onClose();
  }, [receivingId, queryClient, onClose]);

  return useMemo(() => {
    if (!record) return [];
    const { itemLines, lines, unfound, readiness, recordLabel, poNumber, carton } = record;
    const printable = itemLines.some((line) => (line.sku || '').trim());
    const onBench = readiness?.cta === 'continue_unbox' || readiness?.cta === 'match_po';
    const poNote = (carton?.zoho_notes || record.live.receiving_zoho_notes || '').trim() || null;

    const resolve: RecordVerb = {
      id: 'resolve',
      label: 'Resolve unfound',
      icon: <Package aria-hidden />,
      tone: 'warning',
      run: () => openInUnbox(true),
    };
    const unbox: RecordVerb = {
      id: 'unbox',
      label: 'Open in Unbox',
      icon: <Package aria-hidden />,
      tone: 'blue',
      run: () => openInUnbox(),
    };
    const print: RecordVerb = {
      id: 'print',
      label: 'Print labels',
      icon: <Printer aria-hidden />,
      disabled: !printable || unfound,
      disabledReason: unfound ? 'Pair the carton to a purchase order first' : 'No item on this carton has a SKU',
      run: () => printReceivingLineLabels(itemLines),
    };
    const lead = unfound ? [resolve, print] : onBench ? [unbox, print] : [print, unbox];

    const overflow: RecordVerb[] = [
      {
        id: 'timeline',
        label: 'Timeline',
        icon: <History aria-hidden />,
        panel: (done) => <InboundTimelinePanel receivingId={record.receivingId} data={null} onClose={done} />,
      },
      {
        id: 'po-note',
        label: 'PO note',
        icon: <FileText aria-hidden />,
        disabled: poNote == null,
        disabledReason: 'The purchase order carries no note',
        panel: () => (poNote ? <NotePanel text={poNote} /> : null),
      },
      ...(canSyncZoho
        ? [{
            id: 'zoho-receive',
            label: 'Zoho receive sync',
            icon: <RefreshCw aria-hidden />,
            panel: () => <ZohoReceivePanel />,
          } satisfies RecordVerb]
        : []),
      {
        id: 'move-photos',
        label: 'Move photos',
        icon: <Camera aria-hidden />,
        panel: (done) => (
          <MovePhotosBetweenPoPanel open chrome="display" receivingId={record.receivingId} onClose={done} onMoved={record.refresh} />
        ),
      },
      {
        id: 'copy',
        label: 'Copy details',
        icon: <Copy aria-hidden />,
        run: () => {
          const text = lines.map(formatReceivingCopyRow).filter(Boolean).join('\n');
          void navigator.clipboard?.writeText(text).then(
            () => toast.success(`Copied ${lines.length} line${lines.length === 1 ? '' : 's'}`),
            () => toast.error('Copy failed'),
          );
        },
      },
      ...buildRecordTaskVerbs({ entityType: 'receiving', entityId: record.receivingId, label: poNumber ? `PO ${poNumber}` : recordLabel }),
      {
        id: 'delete',
        label: 'Delete carton',
        icon: <Trash2 aria-hidden />,
        tone: 'danger',
        run: deleteCarton,
      },
    ];
    return [
      ...lead,
      {
        id: 'claim',
        label: 'Claim',
        icon: <Ticket aria-hidden />,
        disabled: itemLines.length === 0,
        disabledReason: 'No item lines to file a claim against',
        panel: (done) => <CartonClaimPanel record={record} onDone={done} />,
      },
      ...overflow,
    ];
  }, [record, openInUnbox, deleteCarton, canSyncZoho]);
}
