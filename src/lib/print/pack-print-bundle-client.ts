/** Pack papers / manuals print-bundle client helpers. */

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
  const status = String(pb.status || 'failed') as PrintBundleUiStatus;
  const missingTypes = Array.isArray(pb.missingTypes)
    ? pb.missingTypes.map(String)
    : [];
  const manualsResolved = Number(pb.manualsResolved ?? 0) || 0;
  const fallback = Array.isArray(pb.browserFallbackDocs) ? pb.browserFallbackDocs : [];
  if (fallback.length > 0) {
    printPackBundleFallback(fallback);
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
