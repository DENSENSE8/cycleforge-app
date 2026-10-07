'use client';

/**
 * Every product-paperwork write for one order line, each reversible: pair
 * from the library, upload, repin, unpair, remove (delete the file), and the
 * SKU's Not required. Writes
 * go through the order-manual writers (`order-paperwork-client`) and the SKU
 * writer (`sku-paperwork-client`); each success toasts with Undo that runs the
 * inverse writer, and every settle re-reads the Orders view.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import type { OrderPacketLine } from '@/lib/label-prints/order-packet-contracts';
import type { PaperworkPairing, PaperworkSource } from '@/lib/manuals/paperwork-pairing';
import { fetchSkuPaperworkReach, setSkuPaperworkRequired } from '@/lib/manuals/sku-paperwork-client';
import {
  pairOrderManual,
  patchOrderManual,
  removeOrderManualHttp,
  uploadOrderManual,
  type OrderManualPatch,
} from '@/lib/orders/order-paperwork-client';
import { toast } from '@/lib/toast';
import { holdFile } from './held-file';
import { usePacketRefresh } from './use-packet-refresh';

export const skuPaperworkReachKey = (skuCatalogId: number) => ['sku-paperwork-reach', skuCatalogId] as const;

/**
 * Put a manual back exactly as it was pinned. `anchor` is a key this line
 * carries that the old pinning had, so the row resolves for the line again
 * before the exact pinning is written; an empty old pinning is the library
 * (unpaired).
 */
export async function restorePairing(lineId: number, manualId: number, before: PaperworkPairing, anchor: PaperworkSource) {
  if (before.orderId == null && !before.itemNumber && !before.sku) {
    await removeOrderManualHttp(lineId, manualId, 'unpair');
    return;
  }
  await pairOrderManual(lineId, manualId, anchor);
  await patchOrderManual(lineId, manualId, {
    pairing: { orderId: before.orderId, itemNumber: before.itemNumber, sku: before.sku },
  });
}

export function useLinePaperwork(line: OrderPacketLine) {
  const refresh = usePacketRefresh();
  const lineId = line.orderLineId;
  const skuCatalogId = line.skuCatalogId;

  const reach = useQuery({
    queryKey: skuPaperworkReachKey(skuCatalogId ?? 0),
    queryFn: () => fetchSkuPaperworkReach(skuCatalogId!),
    enabled: skuCatalogId != null,
    staleTime: 60_000,
  });

  /** Run an undo and report it; the Orders view re-reads either way. */
  const undo = (run: () => Promise<unknown>, done: string) => () => {
    void run()
      .then(
        () => toast.success(done),
        (error: unknown) => toast.error(error instanceof Error ? error.message : 'Undo failed.'),
      )
      .finally(() => void refresh());
  };
  const fail = (error: Error) => toast.error(error.message);

  const pair = useMutation({
    mutationFn: ({ manualId, scope }: { manualId: number; scope: PaperworkSource }) => pairOrderManual(lineId, manualId, scope),
    onSuccess: ({ manual, before }, { manualId, scope }) => {
      toast.undo(`Paired ${manual.displayName}`, {
        onUndo: undo(() => restorePairing(lineId, manualId, before, scope), 'Pairing undone'),
      });
    },
    onError: fail,
    onSettled: refresh,
  });

  const upload = useMutation({
    mutationFn: async ({ files, scope, type }: { files: File[]; scope: PaperworkSource; type: string }) => {
      const added: number[] = [];
      for (const file of files) added.push((await uploadOrderManual(lineId, file, { pairTo: scope, type })).manual.id);
      return added;
    },
    onSuccess: (added) => {
      toast.undo(`Added ${added.length === 1 ? '1 file' : `${added.length} files`} to ${line.sku ?? line.title}`, {
        onUndo: undo(() => Promise.all(added.map((id) => removeOrderManualHttp(lineId, id, 'delete'))), 'Upload removed'),
      });
    },
    onError: fail,
    onSettled: refresh,
  });

  const repin = useMutation({
    mutationFn: ({ manualId, patch }: { manualId: number; patch: OrderManualPatch; anchor: PaperworkSource }) =>
      patchOrderManual(lineId, manualId, patch),
    onSuccess: ({ manual, before }, { manualId, anchor }) => {
      toast.undo(`Repinned ${manual.displayName}`, {
        onUndo: undo(() => restorePairing(lineId, manualId, before, anchor), 'Repin undone'),
      });
    },
    onError: fail,
    onSettled: refresh,
  });

  const unpair = useMutation({
    mutationFn: ({ manualId }: { manualId: number; title: string; anchor: PaperworkSource }) =>
      removeOrderManualHttp(lineId, manualId, 'unpair'),
    onSuccess: ({ before }, { manualId, title, anchor }) => {
      toast.undo(`Unpaired ${title} — back in the library`, {
        onUndo: undo(() => restorePairing(lineId, manualId, before, anchor), 'Unpair undone'),
      });
    },
    onError: fail,
    onSettled: refresh,
  });

  /**
   * Delete the file (`mode=delete`). Its bytes are read first, so Undo files
   * the same bytes on this line again and re-pins them exactly as before.
   */
  const remove = useMutation({
    mutationFn: async ({ manualId, title, src }: { manualId: number; title: string; src: string; anchor: PaperworkSource }) => {
      const file = await holdFile(src, title);
      const { before } = await removeOrderManualHttp(lineId, manualId, 'delete');
      return { file, before };
    },
    onSuccess: ({ file, before }, { title, anchor }) => {
      toast.undo(`Deleted ${title}`, {
        onUndo: undo(async () => {
          const { manual } = await uploadOrderManual(lineId, file, { pairTo: anchor });
          await restorePairing(lineId, manual.id, before, anchor);
        }, `${title} restored`),
      });
    },
    onError: fail,
    onSettled: refresh,
  });

  const notRequired = useMutation({
    mutationFn: async (next: boolean) => {
      if (skuCatalogId == null) throw new Error('This line has no catalog SKU.');
      await setSkuPaperworkRequired(skuCatalogId, next);
    },
    onSuccess: (_data, next) => {
      const sku = line.sku ?? 'this SKU';
      toast.undo(next ? `${sku} needs no product paperwork` : `${sku} needs product paperwork again`, {
        onUndo: undo(() => setSkuPaperworkRequired(skuCatalogId!, !next), next ? `${sku} needs product paperwork again` : `${sku} needs no product paperwork`),
      });
    },
    onError: fail,
    onSettled: refresh,
  });

  return {
    /** Open orders a SKU-scope write reaches; null while unknown or when the line has no catalog SKU. */
    reach: reach.data?.openOrders ?? null,
    pair,
    upload,
    repin,
    unpair,
    remove,
    notRequired,
    pending: pair.isPending || upload.isPending || repin.isPending || unpair.isPending || remove.isPending || notRequired.isPending,
  };
}
