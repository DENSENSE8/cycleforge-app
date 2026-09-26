'use client';

/**
 * The carton record's verbs — handed to the record action strip under the
 * list's search bar (owner 2026-09-25: record verbs live ONLY in that strip,
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Camera, Copy, Package, Printer, Ticket, Trash2 } from '@/components/Icons';
import { evidenceVerbClass } from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { ReceivingClaimPanel } from '@/components/receiving/workspace/ReceivingClaimPanel';
import { MovePhotosBetweenPoPanel } from '@/components/receiving/workspace/line-edit/MovePhotosBetweenPoPanel';
import { buildRecordTaskVerbs } from '@/components/tasks/RecordTaskActions';
import type { RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { dispatchReceivingOpenPairingPo } from '@/utils/events';
import { formatReceivingCopyRow } from '@/lib/receiving/receiving-copy-row';
import { printReceivingLineLabels } from '@/lib/receiving/print-receiving-line-labels';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { openInUnboxHref } from '@/lib/receiving/surface-path';
import { removeReceivingRailByCarton } from '@/lib/queries/receiving-queries';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import type { CartonRecord } from './use-carton-record';

const ICON_CLASS = 'h-3.5 w-3.5';

interface CartonVerbHandlers {
  openInUnbox: (pairing?: boolean) => void;
  deleteCarton: () => Promise<void>;
}

/** The carton's strip verbs, lead verb first. Pure over the record + handlers. */
function buildCartonVerbs(record: CartonRecord, handlers: CartonVerbHandlers): RecordActionVerb[] {
  const { itemLines, lines, unfound, readiness, receivingId, recordLabel, poNumber } = record;
  const printable = itemLines.some((line) => (line.sku || '').trim());
  const onBench = readiness?.cta === 'continue_unbox' || readiness?.cta === 'match_po';

  const resolve: RecordActionVerb = {
    id: 'resolve',
    label: 'Resolve unfound',
    icon: <Package className={ICON_CLASS} />,
    placement: 'primary',
    run: () => handlers.openInUnbox(true),
  };
  const unbox: RecordActionVerb = {
    id: 'unbox',
    label: 'Open in Unbox',
    icon: <Package className={ICON_CLASS} />,
    placement: 'primary',
    run: () => handlers.openInUnbox(),
  };
  const print: RecordActionVerb = {
    id: 'print',
    label: 'Print labels',
    icon: <Printer className={ICON_CLASS} />,
    placement: 'primary',
    disabled: !printable || unfound,
    disabledReason: unfound ? 'Pair the carton to a purchase order first' : 'No item on this carton has a SKU',
    run: () => printReceivingLineLabels(itemLines),
  };
  const lead = unfound ? [resolve, print] : onBench ? [unbox, print] : [print, unbox];

  return [
    ...lead,
    {
      id: 'claim',
      label: 'Claim',
      icon: <Ticket className={ICON_CLASS} />,
      placement: 'primary',
      disabled: itemLines.length === 0,
      disabledReason: 'No item lines to file a claim against',
      display: (done) => <CartonClaimDisplay record={record} onDone={done} />,
    },
    {
      id: 'move-photos',
      label: 'Move photos',
      icon: <Camera className={ICON_CLASS} />,
      placement: 'primary',
      display: (done) => (
        <MovePhotosBetweenPoPanel open chrome="display" receivingId={receivingId} onClose={done} onMoved={record.refresh} />
      ),
    },
    {
      id: 'copy',
      label: 'Copy details',
      icon: <Copy className={ICON_CLASS} />,
      placement: 'overflow',
      run: () => {
        const text = lines.map(formatReceivingCopyRow).filter(Boolean).join('\n');
        void navigator.clipboard?.writeText(text).then(
          () => toast.success(`Copied ${lines.length} line${lines.length === 1 ? '' : 's'}`),
          () => toast.error('Copy failed'),
        );
      },
    },
    ...buildRecordTaskVerbs({ entityType: 'receiving', entityId: receivingId, label: poNumber ? `PO ${poNumber}` : recordLabel }),
    {
      id: 'delete',
      label: 'Delete carton',
      icon: <Trash2 className={ICON_CLASS} />,
      tone: 'danger',
      placement: 'isolated',
      run: handlers.deleteCarton,
    },
  ];
}

/**
 * The strip's verbs for the open carton — `[]` when nothing is open. Called
 * by the list host (it owns the strip); shares the record view's data read.
 */
export function useCartonVerbs(record: CartonRecord | null, onClose: () => void): RecordActionVerb[] {
  const router = useRouter();
  const queryClient = useQueryClient();
  const live = record?.live ?? null;
  const receivingId = record?.receivingId ?? null;
  const recordLabel = record?.recordLabel ?? '';

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

  // Deletes the whole carton (`receiving_carton`) on the strip's second press
  // (no confirm dialog on top of it) — rail mirror, the list
  // query and the shared `receiving-entry-deleted` event all refresh.
  const deleteCarton = useCallback(async () => {
    if (receivingId == null) return;
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
  }, [receivingId, recordLabel, queryClient, onClose]);

  return useMemo(
    () => (record ? buildCartonVerbs(record, { openInUnbox, deleteCarton }) : []),
    [record, openInUnbox, deleteCarton],
  );
}

/** Claim display: pick the item (when the carton has several), then the claim wizard for that line. */
function CartonClaimDisplay({ record, onDone }: { record: CartonRecord; onDone: () => void }) {
  const { itemLines, live } = record;
  const [line, setLine] = useState<ReceivingLineRow | null>(
    itemLines.length === 1 ? itemLines[0]! : null,
  );
  if (!line) {
    return (
      <div className="flex flex-col gap-2 p-3" data-testid="carton-claim-pick">
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
