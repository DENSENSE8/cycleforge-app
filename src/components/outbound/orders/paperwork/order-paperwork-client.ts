'use client';

/**
 * One order's paperwork, client side: the packing slips + shipping labels on
 * the order (`documents`) and the manuals paired to its item number / SKU
 * (`product_manuals`). Reads share the `['order-documents', id]` key the
 * shipping panel and pack print already use, so every surface agrees.
 *
 * Writes:
 *   documents — upload (multipart → GCS), replace (upload the new file, then
 *               unlink the old), delete, fetch from the platform.
 *   manuals   — upload new (paired to the order's item + SKU), pair an
 *               existing library manual, rename, replace the file, unpair,
 *               delete from the library.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import type {
  OutboundDocument,
  OutboundDocumentsResponse,
  OutboundDocumentType,
} from '@/lib/documents/types';

export type PaperworkKind = OutboundDocumentType | 'manual';

/** `GET /api/orders/[id]/manuals` row. */
export interface OrderManual {
  id: number;
  displayName: string;
  type: string | null;
  fileName: string | null;
  /** Same-origin bytes (`/api/product-manuals/{id}/content`), when stored. */
  contentUrl: string | null;
  /** Google preview for Drive-only manuals. */
  externalUrl: string | null;
  pairedBy: Array<'catalog' | 'item_number' | 'sku'>;
  updatedAt: string;
}

export interface OrderManualsResponse {
  success: boolean;
  itemNumber: string | null;
  sku: string | null;
  skuCatalogId: number | null;
  manuals: OrderManual[];
}

export const orderDocumentsKey = (orderId: number) => ['order-documents', orderId] as const;
export const orderManualsKey = (orderId: number) => ['order-manuals', orderId] as const;

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body?.error || fallback);
  return body;
}

export function useOrderDocuments(orderId: number) {
  return useQuery({
    queryKey: orderDocumentsKey(orderId),
    queryFn: async () =>
      readJson<OutboundDocumentsResponse>(
        await fetch(`/api/orders/${orderId}/documents`, { credentials: 'same-origin' }),
        'Could not load documents.',
      ),
    enabled: Number.isFinite(orderId) && orderId > 0,
    staleTime: 30_000,
    refetchInterval: (query) =>
      query.state.data?.packingSlipIngest?.status === 'processing' ? 2_000 : false,
  });
}

export function useOrderManuals(orderId: number) {
  return useQuery({
    queryKey: orderManualsKey(orderId),
    queryFn: async () =>
      readJson<OrderManualsResponse>(
        await fetch(`/api/orders/${orderId}/manuals`, { credentials: 'same-origin' }),
        'Could not load manuals.',
      ),
    enabled: Number.isFinite(orderId) && orderId > 0,
    staleTime: 30_000,
  });
}

function formFor(file: File, fields: Record<string, string>): FormData {
  const form = new FormData();
  form.set('file', file);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

async function uploadDocument(orderId: number, orderRef: string, type: OutboundDocumentType, file: File) {
  const res = await fetch(`/api/orders/${orderId}/documents/upload`, {
    method: 'POST',
    credentials: 'same-origin',
    body: formFor(file, { documentType: type, orderRef }),
  });
  return readJson<{ document: OutboundDocument }>(res, 'Upload failed.');
}

async function deleteDocument(documentId: number) {
  const res = await fetch(`/api/documents/${documentId}`, { method: 'DELETE', credentials: 'same-origin' });
  await readJson(res, 'Could not delete the document.');
}

/**
 * Every paperwork write for one order, with the cache refresh and the toast
 * each one owes. `onChanged` lets the host re-read facts it owns (the release
 * gates, the ledger row).
 */
export function useOrderPaperworkActions(orderId: number, orderRef: string, onChanged?: () => void) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orderDocumentsKey(orderId) });
    void queryClient.invalidateQueries({ queryKey: orderManualsKey(orderId) });
    onChanged?.();
  };
  const fail = (error: Error) => toast.error(error.message);

  const upload = useMutation({
    mutationFn: async ({ kind, file }: { kind: PaperworkKind; file: File }) => {
      if (kind === 'manual') {
        const res = await fetch(`/api/orders/${orderId}/manuals`, {
          method: 'POST',
          credentials: 'same-origin',
          body: formFor(file, { displayName: file.name.replace(/\.[a-z0-9]+$/i, '') }),
        });
        await readJson(res, 'Manual upload failed.');
        return;
      }
      await uploadDocument(orderId, orderRef, kind, file);
    },
    onSuccess: (_data, { file }) => {
      toast.success(`Uploaded ${file.name}`);
      refresh();
    },
    onError: fail,
  });

  const replaceDocument = useMutation({
    mutationFn: async ({ doc, file }: { doc: OutboundDocument; file: File }) => {
      const next = await uploadDocument(orderId, orderRef, doc.documentType, file);
      if (next.document.id !== doc.id) await deleteDocument(doc.id);
    },
    onSuccess: (_data, { file }) => {
      toast.success(`Replaced with ${file.name}`);
      refresh();
    },
    onError: fail,
  });

  const removeDocument = useMutation({
    mutationFn: async (doc: OutboundDocument) => deleteDocument(doc.id),
    onSuccess: () => {
      toast.success('Document deleted');
      refresh();
    },
    onError: fail,
  });

  const fetchFromPlatform = useMutation({
    mutationFn: async (types: OutboundDocumentType[]) => {
      const res = await fetch(`/api/orders/${orderId}/documents/fetch`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ types }),
      });
      return readJson<{ fetched?: unknown[]; failed?: Array<{ error?: string; message?: string }> }>(
        res,
        'Could not fetch from the platform.',
      );
    },
    onSuccess: (data) => {
      const fetched = data.fetched?.length ?? 0;
      const failure = data.failed?.[0];
      if (fetched > 0) toast.success(`Fetched ${fetched} document${fetched === 1 ? '' : 's'}`);
      else toast.error(failure?.error || failure?.message || 'The platform returned no document.');
      refresh();
    },
    onError: fail,
  });

  const pairManual = useMutation({
    mutationFn: async (manualId: number) => {
      const res = await fetch(`/api/orders/${orderId}/manuals`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualId }),
      });
      await readJson(res, 'Could not pair the manual.');
    },
    onSuccess: () => {
      toast.success('Manual paired to this item');
      refresh();
    },
    onError: fail,
  });

  const renameManual = useMutation({
    mutationFn: async ({ manualId, displayName }: { manualId: number; displayName: string }) => {
      const res = await fetch(`/api/orders/${orderId}/manuals/${manualId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });
      await readJson(res, 'Could not rename the manual.');
    },
    onSuccess: refresh,
    onError: fail,
  });

  const replaceManual = useMutation({
    mutationFn: async ({ manualId, file }: { manualId: number; file: File }) => {
      const res = await fetch(`/api/orders/${orderId}/manuals/${manualId}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        body: formFor(file, {}),
      });
      await readJson(res, 'Could not replace the manual file.');
    },
    onSuccess: (_data, { file }) => {
      toast.success(`Replaced with ${file.name}`);
      refresh();
    },
    onError: fail,
  });

  const removeManual = useMutation({
    mutationFn: async ({ manualId, mode }: { manualId: number; mode: 'unpair' | 'delete' }) => {
      const res = await fetch(`/api/orders/${orderId}/manuals/${manualId}?mode=${mode}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      await readJson(res, mode === 'delete' ? 'Could not delete the manual.' : 'Could not unpair the manual.');
    },
    onSuccess: (_data, { mode }) => {
      toast.success(mode === 'delete' ? 'Manual deleted from the library' : 'Manual unpaired from this item');
      refresh();
    },
    onError: fail,
  });

  return {
    upload,
    replaceDocument,
    removeDocument,
    fetchFromPlatform,
    pairManual,
    renameManual,
    replaceManual,
    removeManual,
  };
}

/** `?download=1` twin of a same-origin content URL. */
export function downloadHref(src: string): string {
  return `${src}${src.includes('?') ? '&' : '?'}download=1`;
}

/** One ZIP of every order document + paired manual. */
export function downloadAllHref(input: {
  documentIds: readonly number[];
  manualIds: readonly number[];
  title: string;
}): string | null {
  if (input.documentIds.length + input.manualIds.length === 0) return null;
  const params = new URLSearchParams();
  if (input.documentIds.length > 0) params.set('ids', input.documentIds.join(','));
  if (input.manualIds.length > 0) params.set('manualIds', input.manualIds.join(','));
  params.set('title', input.title);
  return `/api/documents/download-zip?${params}`;
}

/** Print a same-origin document: load it in a hidden frame, then print that frame. */
export function printDocument(src: string): void {
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.src = src;
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      window.open(src, '_blank', 'noopener,noreferrer');
    }
    window.setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}
