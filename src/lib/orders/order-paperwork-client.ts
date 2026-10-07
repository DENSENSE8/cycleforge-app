'use client';

/** One order's paperwork, client side: */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import type {
  OutboundDocument,
  OutboundDocumentsResponse,
  OutboundDocumentType,
} from '@/lib/documents/types';
import type { OrderLabelSummary } from '@/lib/shipping/order-label-summary';
import type { PaperworkPairing, PaperworkSource } from '@/lib/manuals/paperwork-pairing';

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
  /** Most specific source it resolves under (order > item # > SKU). */
  source: PaperworkSource | null;
  pairedBy: PaperworkSource[];
  pairing: PaperworkPairing;
  updatedAt: string;
}

export interface OrderManualsResponse {
  success: boolean;
  orderId: number;
  itemNumber: string | null;
  sku: string | null;
  skuCatalogId: number | null;
  defaultPairTo: PaperworkSource;
  /** Precedence order: this order, item number, SKU. */
  manuals: OrderManual[];
}

export const orderDocumentsKey = (orderId: number) => ['order-documents', orderId] as const;
const orderManualsKey = (orderId: number) => ['order-manuals', orderId] as const;
export const orderLabelSummaryKey = (orderId: number) => ['order-label-summary', orderId] as const;

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

/** `GET /api/orders/[id]/label-purchase` — the order's label status + current purchase. */
export function useOrderLabelSummary(orderId: number) {
  return useQuery({
    queryKey: orderLabelSummaryKey(orderId),
    queryFn: async () =>
      readJson<OrderLabelSummary>(
        await fetch(`/api/orders/${orderId}/label-purchase`, { credentials: 'same-origin' }),
        'Could not load the shipping label.',
      ),
    enabled: Number.isFinite(orderId) && orderId > 0,
    staleTime: 30_000,
  });
}

/** The document a purchase stored, else the newest of that type on the order. */
export function pickOrderDocument(
  documents: readonly OutboundDocument[],
  type: OutboundDocumentType,
  preferId: number | null,
): OutboundDocument | null {
  if (preferId != null) {
    const exact = documents.find((d) => d.id === preferId);
    if (exact) return exact;
  }
  const ofType = documents.filter((d) => d.documentType === type);
  if (ofType.length === 0) return null;
  return ofType.reduce((a, b) => (Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a));
}

/** `GET /api/orders/[id]/manuals` as query options — `useOrderManuals` and imperative `fetchQuery` reads share one cache. */
export function orderManualsQuery(orderId: number) {
  return {
    queryKey: orderManualsKey(orderId),
    queryFn: async () =>
      readJson<OrderManualsResponse>(
        await fetch(`/api/orders/${orderId}/manuals`, { credentials: 'same-origin' }),
        'Could not load manuals.',
      ),
    enabled: Number.isFinite(orderId) && orderId > 0,
    staleTime: 30_000,
  };
}

export function useOrderManuals(orderId: number) {
  return useQuery(orderManualsQuery(orderId));
}

function formFor(file: File, fields: Record<string, string>): FormData {
  const form = new FormData();
  form.set('file', file);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

/** One outbound document (a packing slip, an invoice) onto one order — the imperative write behind `upload`. */
export async function uploadOrderDocument(orderId: number, orderRef: string, type: OutboundDocumentType, file: File) {
  const res = await fetch(`/api/orders/${orderId}/documents/upload`, {
    method: 'POST',
    credentials: 'same-origin',
    body: formFor(file, { documentType: type, orderRef }),
  });
  return readJson<{ document: OutboundDocument }>(res, 'Upload failed.');
}

export async function deleteDocument(documentId: number) {
  const res = await fetch(`/api/documents/${documentId}`, { method: 'DELETE', credentials: 'same-origin' });
  await readJson(res, 'Could not delete the document.');
}

type SlipOrLabel = 'packing_slip' | 'shipping_label';

/** Move a slip / label without an ingestion to the UNLINKED pool; the file stays. Undo = `relinkDocument`. */
export async function unlinkDocument(documentId: number): Promise<void> {
  const res = await fetch(`/api/documents/${documentId}/unlink`, { method: 'POST', credentials: 'same-origin' });
  await readJson(res, 'Could not unlink the document.');
}

/** Re-file an existing document row on an order — the attach-existing-documentId path (POST /api/orders/[id]/documents). */
export async function relinkDocument(input: { orderId: number; documentId: number; documentType: SlipOrLabel }): Promise<void> {
  const res = await fetch(`/api/orders/${input.orderId}/documents`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentType: input.documentType, documentId: input.documentId }),
  });
  await readJson(res, 'Could not re-link the document.');
}

function filenameFromDisposition(header: string | null): string | null {
  const match = header?.match(/filename="([^"]+)"/);
  return match ? match[1] : null;
}

/** Hard delete that keeps the bytes client-side so `restore()` can re-file them on the order. */
export async function deleteDocumentKeepingBytes(input: {
  documentId: number;
  orderId: number;
  documentType: SlipOrLabel;
}): Promise<{ restore(): Promise<void> }> {
  const content = await fetch(`/api/documents/${input.documentId}/content`, { credentials: 'same-origin' });
  if (!content.ok) throw new Error('Could not read the document before deleting it.');
  const blob = await content.blob();
  const filename = filenameFromDisposition(content.headers.get('content-disposition')) ?? `document-${input.documentId}`;
  const file = new File([blob], filename, { type: blob.type || content.headers.get('content-type') || 'application/pdf' });
  await deleteDocument(input.documentId);
  return {
    async restore() {
      await uploadOrderDocument(input.orderId, String(input.orderId), input.documentType, file);
    },
  };
}

export async function replaceDocumentBytes(documentId: number, file: File) {
  const res = await fetch(`/api/documents/${documentId}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    body: formFor(file, {}),
  });
  return readJson<{ document: OutboundDocument }>(res, 'Could not replace the document.');
}

/** What a manual write answers: the manual now, and the pinning it had before the write (the undo target). */
export interface OrderManualWrite {
  manual: OrderManual;
  before: PaperworkPairing;
}

/** Upload one paperwork file onto an order line, pinned at `pairTo` (server default when absent) as `type`. */
export async function uploadOrderManual(
  orderId: number,
  file: File,
  options: { pairTo?: PaperworkSource; type?: string } = {},
): Promise<{ manual: OrderManual }> {
  const fields: Record<string, string> = { displayName: file.name.replace(/\.[a-z0-9]+$/i, '') };
  if (options.pairTo) fields.pairTo = options.pairTo;
  if (options.type) fields.type = options.type;
  const res = await fetch(`/api/orders/${orderId}/manuals`, {
    method: 'POST',
    credentials: 'same-origin',
    body: formFor(file, fields),
  });
  return readJson<{ manual: OrderManual }>(res, 'Upload failed.');
}

/** Pair a library row to an order line: ADDS the `pairTo` key, keeps its other keys. */
export async function pairOrderManual(orderId: number, manualId: number, pairTo: PaperworkSource): Promise<OrderManualWrite> {
  const res = await fetch(`/api/orders/${orderId}/manuals`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manualId, pairTo }),
  });
  return readJson<OrderManualWrite>(res, 'Could not pair it.');
}

export type OrderManualPatch = {
  displayName?: string;
  type?: string | null;
  /** The COMPLETE new pinning. */
  pairing?: Pick<PaperworkPairing, 'orderId' | 'itemNumber' | 'sku'>;
};

/** Rename / retype / re-pair a manual that resolves for the order line. */
export async function patchOrderManual(orderId: number, manualId: number, patch: OrderManualPatch): Promise<OrderManualWrite> {
  const res = await fetch(`/api/orders/${orderId}/manuals/${manualId}`, {
    method: 'PATCH',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return readJson<OrderManualWrite>(res, 'Could not save it.');
}

/** `unpair` clears every key (back to the library, unassigned); `delete` deactivates it. Answers the prior pinning. */
export async function removeOrderManualHttp(
  orderId: number,
  manualId: number,
  mode: 'unpair' | 'delete',
): Promise<{ before: PaperworkPairing }> {
  const res = await fetch(`/api/orders/${orderId}/manuals/${manualId}?mode=${mode}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });
  return readJson<{ before: PaperworkPairing }>(
    res,
    mode === 'delete' ? 'Could not delete the manual.' : 'Could not unpair the manual.',
  );
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
    void queryClient.invalidateQueries({ queryKey: orderLabelSummaryKey(orderId) });
    onChanged?.();
  };
  const fail = (error: Error) => toast.error(error.message);

  const upload = useMutation({
    mutationFn: async ({
      kind,
      file,
      pairTo,
      type,
    }: {
      kind: PaperworkKind;
      file: File;
      /** Paperwork only: which key the new row pins (server default when absent). */
      pairTo?: PaperworkSource;
      type?: string;
    }) => {
      if (kind === 'manual') {
        await uploadOrderManual(orderId, file, { pairTo, type });
        return;
      }
      await uploadOrderDocument(orderId, orderRef, kind, file);
    },
    onSuccess: (_data, { file }) => {
      toast.success(`Uploaded ${file.name}`);
      refresh();
    },
    onError: fail,
  });

  const replaceDocument = useMutation({
    mutationFn: async ({ doc, file }: { doc: OutboundDocument; file: File }) => {
      await replaceDocumentBytes(doc.id, file);
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
    mutationFn: async ({ manualId, pairTo }: { manualId: number; pairTo: PaperworkSource }) => {
      await pairOrderManual(orderId, manualId, pairTo);
    },
    onSuccess: () => {
      toast.success('Paired');
      refresh();
    },
    onError: fail,
  });

  /** Rename / retype / re-pair (`pairing` is the complete new pinning). */
  const updateManual = useMutation({
    mutationFn: async ({ manualId, ...patch }: { manualId: number } & OrderManualPatch) => {
      await patchOrderManual(orderId, manualId, patch);
    },
    onSuccess: (_data, { pairing }) => {
      if (pairing) toast.success('Pairing saved');
      refresh();
    },
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
      await removeOrderManualHttp(orderId, manualId, mode);
    },
    onSuccess: (_data, { mode }) => {
      toast.success(mode === 'delete' ? 'Deleted from the library' : 'Unpaired — back in the library');
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
    updateManual,
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
