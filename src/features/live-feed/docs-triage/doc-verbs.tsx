'use client';

/**
 * The docs sheet's verbs for one document — on its row in the work column
 * (`face="row"`) and on the viewer (`face="viewer"`). Every verb confirms
 * (`requestConfirm`), then toasts with Undo (operator 2026-10-06):
 *
 *   paperwork        Unpair (back to the library)       Undo re-pins it exactly
 *                    Remove (delete the file)           Undo uploads the same bytes, re-pinned
 *   slip, label doc  Unlink (to the Unlinked pool)      Undo re-links it
 *                    Delete                             Undo re-files the same bytes
 *   filed label      Unpair (tracking it wrote comes off; a scan-out is warned, its record stays)
 *                                                       Undo files it back on this order
 *                    Remove (unpair + delete)           Undo uploads the held PDF onto the order
 *   held label       File on this order
 *
 * Every write is the existing writer for its document (`useLinePaperwork`,
 * `order-paperwork-client`, the label-ingestion transport); every settle
 * re-reads the Orders view.
 */

import type { ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { FileCheck2, Trash2, Unlink } from 'lucide-react';
import { requestConfirm } from '@/design-system/components/confirm';
import { Button } from '@/design-system/primitives/Button';
import {
  fetchLabelUnpairCheck,
  fileLabelOnOrderHttp,
  undoLabelUnpairHttp,
  unpairLabelIngestionHttp,
} from '@/lib/label-ingestions/http-client';
import type { OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import { deleteDocumentKeepingBytes, relinkDocument, unlinkDocument } from '@/lib/orders/order-paperwork-client';
import { toast } from '@/lib/toast';
import { formatMonthDayTimePST } from '@/utils/date';
import { holdFile } from '@/features/labels-docs/orders/pane/held-file';
import { usePacketRefresh } from '@/features/labels-docs/orders/pane/use-packet-refresh';
import { useLinePaperwork } from '@/features/labels-docs/orders/pane/use-line-paperwork';
import type { LabelUploads } from '@/features/labels-docs/upload/use-label-uploads';
import type { LinkedItem } from './doc-selection';
import { labelUnpairCopy } from './verb-copy';

type Face = 'row' | 'viewer';

/** Run an Undo and report it; the Orders view re-reads either way. */
export function useUndo() {
  const refresh = usePacketRefresh();
  return (run: () => Promise<unknown>, done: string) => () => {
    void run()
      .then(
        () => toast.success(done),
        (error: unknown) => toast.error(error instanceof Error ? error.message : 'Undo failed.'),
      )
      .finally(() => void refresh());
  };
}

function Verb({
  face,
  icon,
  label,
  pending,
  disabled,
  title,
  onClick,
  testId,
}: {
  face: Face;
  icon: ReactNode;
  label: string;
  pending: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  testId: string;
}) {
  return (
    <Button
      type="button"
      variant={face === 'viewer' ? 'secondary' : 'ghost'}
      size="sm"
      radius="control"
      icon={icon}
      loading={pending}
      disabled={disabled}
      title={title}
      onClick={onClick}
      data-testid={`${testId}-${face}`}
    >
      {label}
    </Button>
  );
}

/** The verbs of one document on file. */
export function DocVerbs({ item, packet, uploads, face }: { item: LinkedItem; packet: OrderPacket; uploads: LabelUploads; face: Face }) {
  if (item.kind === 'label') return <LabelVerbs item={item} packet={packet} uploads={uploads} face={face} />;
  if (item.kind === 'paperwork') return <PaperworkVerbs item={item} face={face} />;
  return <DocumentVerbs item={item} packet={packet} face={face} />;
}

function PaperworkVerbs({ item, face }: { item: Extract<LinkedItem, { kind: 'paperwork' }>; face: Face }) {
  const writes = useLinePaperwork(item.line);
  const { doc, line } = item;
  const manualId = doc.manualId;
  if (manualId == null) return null;
  const anchor = doc.association.source;
  const reach = anchor === 'sku' && writes.reach != null ? ` SKU ${line.sku ?? ''} is on ${writes.reach} open order${writes.reach === 1 ? '' : 's'}.` : '';

  const unpair = async () => {
    const ok = await requestConfirm({
      title: 'Unpair it everywhere?',
      description: `${doc.title} comes off every order, item number and SKU it is pinned to and goes back to the library.${reach}${anchor === 'order' ? ' Only this order resolves it today.' : ''}`,
      confirmLabel: 'Unpair',
    });
    if (ok) writes.unpair.mutate({ manualId, title: doc.title, anchor });
  };
  const remove = async () => {
    if (!doc.src) return;
    const ok = await requestConfirm({
      title: 'Delete this file?',
      description: `${doc.title} is deleted from the library and comes off every order, item number and SKU it is pinned to.${reach} Undo uploads the same file again.`,
      confirmLabel: 'Delete file',
      tone: 'danger',
    });
    if (ok) writes.remove.mutate({ manualId, title: doc.title, src: doc.src, anchor });
  };

  return (
    <>
      <Verb face={face} icon={<Unlink />} label="Unpair" pending={writes.unpair.isPending} disabled={writes.pending} onClick={() => void unpair()} testId="docs-paperwork-unpair" />
      <Verb
        face={face}
        icon={<Trash2 />}
        label="Remove"
        pending={writes.remove.isPending}
        disabled={writes.pending || !doc.src}
        title={doc.src ? 'Delete the file' : 'Stored on Drive only — there is no file here to delete and put back.'}
        onClick={() => void remove()}
        testId="docs-paperwork-remove"
      />
    </>
  );
}

function DocumentVerbs({ item, packet, face }: { item: Extract<LinkedItem, { kind: 'slip' | 'label-document' }>; packet: OrderPacket; face: Face }) {
  const refresh = usePacketRefresh();
  const undo = useUndo();
  const documentId = item.doc.documentId;
  const documentType = item.kind === 'slip' ? 'packing_slip' : 'shipping_label';
  const noun = item.kind === 'slip' ? 'packing slip' : 'shipping label';
  const Noun = item.kind === 'slip' ? 'Packing slip' : 'Shipping label';
  const target = { orderId: packet.orderId, documentType } as const;

  const unlink = useMutation({
    mutationFn: async (id: number) => {
      const ok = await requestConfirm({
        title: `Unlink this ${noun}?`,
        description: `${item.title} comes off ${packet.orderRef} and waits with the unlinked documents — the file is kept.`,
        confirmLabel: 'Unlink',
      });
      if (ok) await unlinkDocument(id);
      return ok;
    },
    onSuccess: (ok, id) => {
      if (ok) toast.undo(`${Noun} unlinked from ${packet.orderRef}`, { onUndo: undo(() => relinkDocument({ ...target, documentId: id }), `${Noun} linked again`) });
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: number) => {
      const ok = await requestConfirm({
        title: `Delete this ${noun}?`,
        description: `${item.title} is deleted from ${packet.orderRef}. Undo files the same file again.`,
        confirmLabel: 'Delete',
        tone: 'danger',
      });
      return ok ? deleteDocumentKeepingBytes({ ...target, documentId: id }) : null;
    },
    onSuccess: (held) => {
      if (held) toast.undo(`${Noun} deleted`, { onUndo: undo(() => held.restore(), `${Noun} restored on ${packet.orderRef}`) });
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });

  if (documentId == null) return null;
  const busy = unlink.isPending || remove.isPending;
  return (
    <>
      <Verb face={face} icon={<Unlink />} label="Unlink" pending={unlink.isPending} disabled={busy} onClick={() => unlink.mutate(documentId)} testId={`docs-${item.kind}-unlink`} />
      <Verb face={face} icon={<Trash2 />} label="Delete" pending={remove.isPending} disabled={busy} onClick={() => remove.mutate(documentId)} testId={`docs-${item.kind}-delete`} />
    </>
  );
}

function LabelVerbs({ item, packet, uploads, face }: { item: Extract<LinkedItem, { kind: 'label' }>; packet: OrderPacket; uploads: LabelUploads; face: Face }) {
  const refresh = usePacketRefresh();
  const undo = useUndo();
  const { row } = item;

  const unpair = useMutation({
    mutationFn: async ({ remove }: { remove: boolean }) => {
      const check = await fetchLabelUnpairCheck(row.id);
      const ok = await requestConfirm(labelUnpairCopy(check, remove, packet.orderRef, formatMonthDayTimePST));
      if (!ok) return null;
      // Remove: hold the PDF first — its Undo uploads these very bytes onto the order again.
      const held = remove ? await holdFile(item.src, row.fileBasename || `label-${row.id}`) : null;
      const { ingestion } = await unpairLabelIngestionHttp(row.id, check.rowVersion, remove ? { remove: true } : undefined);
      return { ingestion, held };
    },
    onSuccess: (done) => {
      if (!done) return;
      const { held, ingestion } = done;
      if (held) {
        toast.undo(`Label removed from ${packet.orderRef}`, { onUndo: () => uploads.submit([held]) });
      } else if (ingestion) {
        toast.undo(`Label unpaired from ${packet.orderRef} — it waits with the unpaired labels`, {
          onUndo: undo(
            () => undoLabelUnpairHttp(ingestion.id, ingestion.rowVersion),
            `Label back on ${packet.orderRef}`,
          ),
        });
      }
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });

  const file = useMutation({
    mutationFn: () => fileLabelOnOrderHttp({ id: row.id, rowVersion: row.rowVersion, matchedOrderId: row.state === 'QUARANTINED' ? null : packet.orderId }, packet.orderId),
    onSuccess: ({ repaired }) => toast.success(`Label filed on ${packet.orderRef}${repaired > 0 ? ` · ${repaired} more of the buyer’s labels paired` : ''}`),
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });

  if (!item.filed) {
    if (row.state === 'FAILED') return null;
    const untracked = row.state === 'QUARANTINED' && !row.trackingNumber;
    return (
      <Verb
        face={face}
        icon={<FileCheck2 />}
        label="File on this order"
        pending={file.isPending}
        disabled={untracked}
        title={untracked ? 'No tracking number was read — upload the page again to type it or file it without tracking.' : undefined}
        onClick={() => file.mutate()}
        testId="docs-label-file"
      />
    );
  }
  const busy = unpair.isPending;
  return (
    <>
      <Verb
        face={face}
        icon={<Unlink />}
        label="Unpair"
        pending={busy && unpair.variables?.remove === false}
        disabled={busy}
        onClick={() => unpair.mutate({ remove: false })}
        testId="docs-label-unpair"
      />
      <Verb
        face={face}
        icon={<Trash2 />}
        label="Remove"
        pending={busy && unpair.variables?.remove === true}
        disabled={busy}
        onClick={() => unpair.mutate({ remove: true })}
        testId="docs-label-remove"
      />
    </>
  );
}
