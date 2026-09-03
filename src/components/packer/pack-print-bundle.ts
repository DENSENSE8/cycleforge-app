/**
 * Pack papers / manuals print-bundle client helpers.
 *
 * Auto-print still fires from the sidebar scan column after ORDERS pack
 * (`printBundleSuggested`). Status + Reprint live in the middle
 * {@link PackPapersStatusCard} so a pointer click never sits next to the
 * focus-locked scan bar.
 *
 * When the server cannot reach the office agent (remote NAS_AGENT_URL without
 * `/print`), the packing Chrome on the agent Mac tries loopback
 * `http://127.0.0.1:8787/print` before opening a browser dialog.
 */

import { printPackBundleFallback } from '@/lib/print/printPackBundleFallback';

export type PrintBundleUiStatus =
  | 'idle'
  | 'printing'
  | 'dispatched'
  | 'fallback_browser'
  | 'missing'
  | 'partial'
  | 'failed'
  | 'idempotent_replay';

export interface PrintBundleUiState {
  status: PrintBundleUiStatus;
  missingTypes: string[];
  message: string;
  orderRowId: number | null;
  packerLogId: number | null;
  manualsResolved?: number;
}

const PACK_PRINT_BUNDLE_UI_EVENT = 'pack-print-bundle-ui';
export const PACKER_FOCUS_SCAN_EVENT = 'packer-focus-scan';

/** Local NAS media agent (same Mac as the packing Chrome). */
const LOCAL_AGENT_PRINT_URL = 'http://127.0.0.1:8787/print';

type FallbackDoc = {
  kind?: string;
  documentId?: number;
  productManualId?: number;
  documentType?: string;
  isPdf?: boolean;
};

function printBundleMessage(
  status: string,
  missingTypes: string[],
  manualsResolved = 0,
): string {
  const manualBit =
    manualsResolved > 0
      ? ` · ${manualsResolved} manual${manualsResolved === 1 ? '' : 's'}`
      : '';
  switch (status) {
    case 'dispatched':
      return `Papers sent to the bench printer${manualBit}.`;
    case 'fallback_browser':
      return `Opening print dialog for packing papers${manualBit}.`;
    case 'missing':
      return missingTypes.length
        ? `No papers on file (${missingTypes.join(', ')}). Buy/fetch at Labels first.`
        : 'No papers on file. Buy/fetch at Labels first.';
    case 'partial':
      return `Some papers printed${manualBit}; check Labels for the rest.`;
    case 'failed':
      return 'Print failed — tap Reprint or use Labels.';
    case 'idempotent_replay':
      return `Papers already printed for this pack${manualBit}.`;
    default:
      return '';
  }
}

function contentUrlForFallbackDoc(doc: FallbackDoc): string | null {
  if (Number(doc.documentId) > 0) return `/api/documents/${Number(doc.documentId)}/content`;
  if (doc.kind === 'manual' && Number(doc.productManualId) > 0) {
    return `/api/product-manuals/${Number(doc.productManualId)}/content`;
  }
  return null;
}

function documentTypeForFallbackDoc(doc: FallbackDoc): 'shipping_label' | 'packing_slip' | 'manual' {
  const t = String(doc.documentType || '').trim();
  if (t === 'shipping_label' || t === 'packing_slip' || t === 'manual') return t;
  return doc.kind === 'manual' ? 'manual' : 'packing_slip';
}

async function arrayBufferToBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * When Cycle Forge fell back to the browser dialog, try the office agent on
 * loopback (packing station Mac). Returns true when every fallback doc printed.
 */
export async function tryLocalAgentPrintFallback(docs: FallbackDoc[]): Promise<boolean> {
  if (typeof window === 'undefined' || docs.length === 0) return false;

  let probeOk = false;
  try {
    const probe = await fetch('http://127.0.0.1:8787/health', {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
    });
    probeOk = probe.ok;
  } catch {
    return false;
  }
  if (!probeOk) return false;

  for (const doc of docs) {
    const url = contentUrlForFallbackDoc(doc);
    if (!url) return false;
    const pdfRes = await fetch(url, { cache: 'no-store' });
    if (!pdfRes.ok) return false;
    const buf = await pdfRes.arrayBuffer();
    if (!buf.byteLength) return false;
    const pdfBase64 = await arrayBufferToBase64(buf);
    const documentType = documentTypeForFallbackDoc(doc);
    const printRes = await fetch(LOCAL_AGENT_PRINT_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        documentType,
        title: `Pack ${documentType}`,
        pdfBase64,
        source: 'cycleforge.pack.loopback',
      }),
    });
    const body = await printRes.json().catch(() => ({}));
    if (!printRes.ok || !body?.ok || !body?.dispatched) return false;
  }
  return true;
}

export async function triggerPackPrintBundle(input: {
  orderRowId: number;
  packerLogId: number | null;
  reprint?: boolean;
}): Promise<PrintBundleUiState> {
  const res = await fetch(`/api/orders/${input.orderRowId}/documents/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      packerLogId: input.packerLogId,
      reprint: Boolean(input.reprint),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      status: 'failed',
      missingTypes: [],
      message: String(data?.error || 'Print failed'),
      orderRowId: input.orderRowId,
      packerLogId: input.packerLogId,
    };
  }
  const pb = data?.printBundle ?? {};
  let status = String(pb.status || 'failed') as PrintBundleUiStatus;
  const missingTypes = Array.isArray(pb.missingTypes)
    ? pb.missingTypes.map(String)
    : [];
  const manualsResolved = Number(pb.manualsResolved ?? 0) || 0;
  const fallback = Array.isArray(pb.browserFallbackDocs)
    ? (pb.browserFallbackDocs as FallbackDoc[])
    : [];

  if (status === 'fallback_browser' && fallback.length > 0) {
    const localOk = await tryLocalAgentPrintFallback(fallback).catch(() => false);
    if (localOk) {
      status = 'dispatched';
      const jobIds = (Array.isArray(pb.jobs) ? pb.jobs : [])
        .map((j: { jobRow?: { id?: number | string }; id?: number | string }) =>
          Number(j?.jobRow?.id ?? j?.id),
        )
        .filter((n: number) => Number.isFinite(n) && n > 0);
      if (jobIds.length > 0) {
        void fetch(`/api/orders/${input.orderRowId}/documents/print/ack-local`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobIds }),
        }).catch(() => {});
      }
    } else {
      printPackBundleFallback(fallback);
    }
  }

  return {
    status,
    missingTypes,
    manualsResolved,
    message: printBundleMessage(status, missingTypes, manualsResolved),
    orderRowId: input.orderRowId,
    packerLogId: input.packerLogId,
  };
}

export function dispatchPackPrintBundleUi(detail: PrintBundleUiState | null) {
  window.dispatchEvent(new CustomEvent(PACK_PRINT_BUNDLE_UI_EVENT, { detail }));
}

export function emitPackerFocusScan(deferMs = 60) {
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent(PACKER_FOCUS_SCAN_EVENT));
  }, deferMs);
}

export function subscribePackPrintBundleUi(
  handler: (detail: PrintBundleUiState | null) => void,
): () => void {
  const listener = (e: Event) => {
    handler((e as CustomEvent<PrintBundleUiState | null>).detail ?? null);
  };
  window.addEventListener(PACK_PRINT_BUNDLE_UI_EVENT, listener);
  return () => window.removeEventListener(PACK_PRINT_BUNDLE_UI_EVENT, listener);
}
