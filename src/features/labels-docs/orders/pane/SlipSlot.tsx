'use client';

/**
 * Packing slip slot — one per order. Filled: the order's slips, Printed ×N.
 * Missing: Upload (PDF / PNG / JPEG through the order's own slip writer,
 * `uploadOrderDocument` — toast with Undo, which deletes the slip just filed)
 * and Fetch from the channel (the order's platform fetch,
 * `useOrderPaperworkActions().fetchFromPlatform`). An order marked "needs no
 * paperwork" shows Not required.
 */

import { useMutation } from '@tanstack/react-query';
import { FileText, Upload } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import type { OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import { deleteDocument, uploadOrderDocument, useOrderPaperworkActions } from '@/lib/orders/order-paperwork-client';
import { toast } from '@/lib/toast';
import { PAPERWORK_UPLOAD_TYPES, printedFace } from './slot-faces';
import { SlotDocument, SlotFrame, SlotHeading, useFilePicker } from './SlotFrame';
import { usePacketRefresh } from './use-packet-refresh';

export function SlipSlot({ packet }: { packet: OrderPacket }) {
  const refresh = usePacketRefresh();
  const slot = packet.slip;
  const fetchFromPlatform = useOrderPaperworkActions(packet.orderId, packet.orderRef, () => void refresh()).fetchFromPlatform;

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const filed: number[] = [];
      for (const file of files) filed.push((await uploadOrderDocument(packet.orderId, packet.orderRef, 'packing_slip', file)).document.id);
      return filed;
    },
    onSuccess: (filed) => {
      toast.undo(`${filed.length === 1 ? 'Packing slip' : `${filed.length} packing slips`} added to ${packet.orderRef}`, {
        onUndo: () => {
          void Promise.all(filed.map((id) => deleteDocument(id))).then(
            () => toast.success('Packing slip removed'),
            (error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not remove the packing slip.'),
          ).finally(() => void refresh());
        },
      });
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: refresh,
  });
  const picker = useFilePicker(PAPERWORK_UPLOAD_TYPES, (files) => upload.mutate(files));
  const missing = slot.state === 'missing' || slot.state === 'review';

  return (
    <SlotFrame
      name="Packing slip"
      state={slot.state}
      drop={{
        types: PAPERWORK_UPLOAD_TYPES,
        hint: `a packing slip on ${packet.orderRef}`,
        refusal: 'packing slips are PDF, PNG or JPEG.',
        onFiles: (files) => upload.mutate(files),
      }}
      keys={{ upload: picker.open }}
      testId="order-pane-slip-slot"
      className="px-3 py-2"
    >
      {picker.input}
      <SlotHeading title="Packing slip" state={slot.state} />
      {slot.state === 'not_required' && slot.documents.length === 0 ? (
        <p className="mt-1 text-role-caption text-text-muted">This order needs no paperwork.</p>
      ) : null}
      {slot.documents.length > 0 ? (
        <ul className="mt-1 flex min-w-0 flex-col">
          {slot.documents.map((doc) => (
            <SlotDocument
              key={doc.key}
              testId="order-pane-slip"
              title={doc.title}
              href={doc.src}
              facts={[doc.src ? printedFace(doc.printCount) : 'No stored file — not printable']}
            />
          ))}
        </ul>
      ) : null}
      {missing ? (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            radius="control"
            icon={<Upload />}
            aria-keyshortcuts="U"
            loading={upload.isPending}
            onClick={picker.open}
            data-testid="order-pane-slip-upload"
          >
            Upload
          </Button>
          <Button
            variant="ghost"
            size="sm"
            radius="control"
            icon={<FileText />}
            loading={fetchFromPlatform.isPending}
            onClick={() => fetchFromPlatform.mutate(['packing_slip'])}
            data-testid="order-pane-slip-fetch"
          >
            Fetch from channel
          </Button>
        </div>
      ) : null}
    </SlotFrame>
  );
}
