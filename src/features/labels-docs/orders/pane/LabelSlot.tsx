'use client';

/**
 * Shipping label slot — one per order. Filled: every physical label of the
 * order (ledger labels, then label documents with no ledger row), full
 * tracking, Printed ×N. A label held for review (matched but not applied, or
 * quarantined) carries its own File-on-this-order verb. Missing / review: the
 * suggested unpaired labels (buyer-name / reference matches, one-click
 * Accept), Pair an uploaded label (search the quarantined uploads), Upload (a
 * PDF batch through the label upload writer, filed onto THIS order), Buy
 * label — the one detailed label-buy form (`ReplacementForm`; operator
 * 2026-10-08: no purpose switcher), as `OrderLabelBuyDialog` here or in the
 * docs sheet's viewer column. An order that already shipped on a label buys
 * a replacement (`labelBuyPurpose`). Pickup orders need no label. Every write
 * files through `fileLabelOnOrderHttp` (confirm, then apply) and re-reads the
 * Orders view. In the docs sheet the sheet lists the labels itself, lends the
 * slot its upload intake and hosts the buy (`sheet`).
 */

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link2, Repeat, ShoppingCart, Upload } from '@/components/Icons';
import { LABEL_BUY_TITLE, OrderLabelBuyDialog } from '@/components/outbound/labels/OrderLabelBuyDialog';
import type { LabelBuyPurpose } from '@/components/outbound/labels/replacement/ReplacementForm';
import { RecordFullId } from '@/design-system/components/record-ledger/RecordFullId';
import { Button } from '@/design-system/primitives';
import { fileLabelOnOrderHttp } from '@/lib/label-ingestions/http-client';
import type { LabelPrintRow } from '@/lib/label-prints/contracts';
import { labelPdfSrc } from '@/lib/label-prints/http-client';
import { isPacketGap, type OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import { toast } from '@/lib/toast';
import { formatMonthDayTimePST } from '@/utils/date';
import { LabelUploadTray } from '../../upload/LabelUploadTray';
import { useLabelUploads, type LabelPageUploads } from '../../upload/use-label-uploads';
import { labelBuyPurpose } from './label-buy-purpose';
import { LABEL_DROP_TYPES, printedFace } from './slot-faces';
import { SlotDocument, SlotFrame, SlotHeading, useFilePicker } from './SlotFrame';
import { UnpairedLabelPicker } from './pane-parts';
import { usePacketRefresh } from './use-packet-refresh';

/** Why the projection suggested a label (`label_ingestions.match_method` or its own reason). */
const MATCH_FACE: Readonly<Record<string, string>> = {
  BUYER_NAME: 'Buyer name matches',
  BUYER_NAME_NEXT_UNLABELED: 'Buyer name matches',
  MARKETPLACE_ORDER_ID: 'Order number on the label',
  CYCLEFORGE_REFERENCE: 'Reference on the label',
  TRACKING_NUMBER: 'Tracking already on the order',
};

/** A ledger label on this order that is not yet filed: matched but unapplied, or held. */
export const HELD_FACE: Readonly<Record<string, string>> = {
  QUARANTINED: 'Held — confirm it is this order’s',
  MATCHED: 'Matched — not filed yet',
  PARSED: 'Read — not filed yet',
  STAGED: 'Staged — not filed yet',
  RECEIVED: 'Received — not filed yet',
  FAILED: 'Failed to read',
};

type Panel = 'pair' | 'buy' | null;

export function LabelSlot({
  packet,
  sheet,
}: {
  packet: OrderPacket;
  /**
   * The docs sheet: it lists the order's labels itself (selectable, with their
   * verbs) and owns the order's one label intake, so an owed label opens with
   * the uploaded-label search already showing and every upload lands in the
   * sheet's tray. Buy label paints in the sheet's viewer column: `buying` is
   * the form open there, `onBuy` opens (or, with null, closes) it.
   */
  sheet?: {
    uploads: LabelPageUploads;
    buying: LabelBuyPurpose | null;
    onBuy: (purpose: LabelBuyPurpose | null) => void;
  };
}) {
  const refresh = usePacketRefresh();
  const slot = packet.label;
  const gap = isPacketGap(slot.state);
  const [panel, setPanel] = useState<Panel>(() => (sheet && gap ? 'pair' : null));
  const own = useLabelUploads({ targetOrderId: packet.orderId, targetOrderRef: packet.orderRef, onSettled: refresh });
  const uploads = sheet?.uploads ?? own;
  const picker = useFilePicker(LABEL_DROP_TYPES, uploads.submit);
  const several = slot.labels.length + slot.documents.length > 1;
  const purpose = labelBuyPurpose(packet);
  const buyOpen = sheet ? sheet.buying != null : panel === 'buy';
  const toggleBuy = () => {
    if (sheet) sheet.onBuy(buyOpen ? null : purpose);
    else setPanel(buyOpen ? null : 'buy');
  };

  const file = useMutation({
    mutationFn: (label: { id: number; rowVersion: number; matchedOrderId: number | null }) => fileLabelOnOrderHttp(label, packet.orderId),
    onSuccess: ({ repaired }) => {
      toast.success(
        `Label filed on ${packet.orderRef}${repaired > 0 ? ` · ${repaired} more of the buyer’s labels paired` : ''}`,
      );
      setPanel(null);
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });

  if (slot.state === 'not_required') {
    return (
      <SlotFrame name="Shipping label" state={slot.state} drop={null} keys={{}} testId="order-pane-label-slot" className="px-3 py-2">
        <SlotHeading title="Shipping label" state={slot.state} />
        <p className="mt-1 text-role-caption text-text-muted">Pickup order — no shipping label.</p>
      </SlotFrame>
    );
  }

  const heldVerb = (row: LabelPrintRow) =>
    row.state === 'APPLIED' || row.state === 'LINKED' || row.state === 'FAILED' ? null : (
      <Button
        variant="secondary"
        size="sm"
        radius="control"
        loading={file.isPending && file.variables?.id === row.id}
        disabled={file.isPending || (row.state === 'QUARANTINED' && !row.trackingNumber)}
        title={row.state === 'QUARANTINED' && !row.trackingNumber ? 'No tracking number was read — it cannot be filed.' : undefined}
        onClick={() => file.mutate({ id: row.id, rowVersion: row.rowVersion, matchedOrderId: row.state === 'QUARANTINED' ? null : packet.orderId })}
        data-testid="order-pane-label-file"
      >
        File on this order
      </Button>
    );

  return (
    <SlotFrame
      name="Shipping label"
      state={slot.state}
      drop={{
        types: LABEL_DROP_TYPES,
        hint: `a shipping label on ${packet.orderRef}`,
        refusal: 'shipping labels are PDFs.',
        onFiles: uploads.submit,
      }}
      keys={{ pair: () => setPanel('pair'), upload: picker.open }}
      testId="order-pane-label-slot"
      className="px-3 py-2"
    >
      {picker.input}
      <SlotHeading title="Shipping label" state={slot.state} />
      {!sheet && slot.labels.length + slot.documents.length > 0 ? (
        <ul className="mt-1 flex min-w-0 flex-col">
          {slot.labels.map((row, index) => (
            <SlotDocument
              key={`label:${row.id}`}
              testId="order-pane-label"
              title={`${several ? `Box ${index + 1} · ` : ''}${row.carrier ? `${row.carrier} label` : 'Shipping label'}`}
              href={labelPdfSrc(row.id)}
              facts={[
                row.trackingNumber ? <RecordFullId value={row.trackingNumber} label="tracking number" className="text-role-caption" /> : 'No tracking read',
                HELD_FACE[row.state] ?? null,
                printedFace(row.printCount),
              ]}
              actions={heldVerb(row)}
            />
          ))}
          {slot.documents.map((doc, index) => (
            <SlotDocument
              key={doc.key}
              testId="order-pane-label-document"
              title={`${several ? `Box ${slot.labels.length + index + 1} · ` : ''}${doc.title}`}
              href={doc.src}
              facts={[
                doc.trackingNumber ? <RecordFullId value={doc.trackingNumber} label="tracking number" className="text-role-caption" /> : 'No tracking',
                printedFace(doc.printCount),
              ]}
            />
          ))}
        </ul>
      ) : null}

      {gap && slot.suggestions.length > 0 ? (
        <div className="mt-2 flex min-w-0 flex-col" data-testid="order-pane-label-suggestions">
          <p className="text-role-caption font-semibold text-text-muted">Suggested labels</p>
          <ul className="flex min-w-0 flex-col">
            {slot.suggestions.map((suggestion) => (
              <SlotDocument
                key={suggestion.ingestionId}
                testId="order-pane-label-suggestion"
                title={suggestion.fileBasename}
                href={labelPdfSrc(suggestion.ingestionId)}
                facts={[
                  MATCH_FACE[suggestion.matchMethod] ?? 'Suggested',
                  suggestion.trackingNumber ? (
                    <RecordFullId value={suggestion.trackingNumber} label="tracking number" className="text-role-caption" />
                  ) : null,
                  formatMonthDayTimePST(suggestion.observedAt),
                ]}
                actions={
                  <Button
                    variant="primary"
                    size="sm"
                    radius="control"
                    loading={file.isPending && file.variables?.id === suggestion.ingestionId}
                    disabled={file.isPending}
                    onClick={() => file.mutate({ id: suggestion.ingestionId, rowVersion: suggestion.rowVersion, matchedOrderId: null })}
                    data-testid="order-pane-label-accept"
                  >
                    Accept
                  </Button>
                }
              />
            ))}
          </ul>
        </div>
      ) : null}

      {gap || sheet ? (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
          {gap ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                radius="control"
                icon={<Link2 />}
                aria-expanded={panel === 'pair'}
                aria-keyshortcuts="P"
                onClick={() => setPanel((open) => (open === 'pair' ? null : 'pair'))}
                data-testid="order-pane-label-pair"
              >
                Pair an uploaded label
              </Button>
              <Button
                variant="secondary"
                size="sm"
                radius="control"
                icon={<Upload />}
                aria-keyshortcuts="U"
                loading={uploads.pending}
                onClick={picker.open}
                data-testid="order-pane-label-upload"
              >
                Upload
              </Button>
            </>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            radius="control"
            icon={purpose === 'replacement' ? <Repeat /> : <ShoppingCart />}
            aria-expanded={buyOpen}
            aria-keyshortcuts={sheet && gap ? 'B' : undefined}
            onClick={toggleBuy}
            data-testid="order-pane-label-buy"
          >
            {LABEL_BUY_TITLE[purpose]}
          </Button>
        </div>
      ) : null}

      {panel === 'pair' ? (
        <UnpairedLabelPicker
          pending={file.isPending}
          onPick={(label) => file.mutate({ id: label.id, rowVersion: label.rowVersion, matchedOrderId: null })}
          onClose={() => setPanel(null)}
          autoFocus={!sheet}
        />
      ) : null}
      {sheet ? null : (
        <OrderLabelBuyDialog
          purpose={purpose}
          order={{
            orderRowId: packet.orderId,
            orderNumber: packet.orderRef,
            title: packet.lines[0]?.title ?? '',
            tracking: packet.shipment?.trackingNumber ?? null,
          }}
          open={panel === 'buy'}
          onOpenChange={(open) => setPanel(open ? 'buy' : null)}
          onChange={() => void refresh()}
        />
      )}
      <div className="mt-2 min-w-0">
        <LabelUploadTray uploads={uploads} />
      </div>
    </SlotFrame>
  );
}
