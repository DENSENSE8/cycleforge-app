'use client';

import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';

/** One SKU quantity moving between two location barcodes through `POST /api/transfers`. */
export interface StockTransfer {
  fromBarcode: string;
  toBarcode: string;
  sku: string;
  qty: number;
  notes?: string;
}

export interface StockTransferReceipt {
  /** Canonical barcodes as stored — a typed code may differ in case or separators. */
  fromBarcode: string;
  toBarcode: string;
  sku: string;
  qty: number;
}

type TransferResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  qty?: number;
  sku?: string;
  from_bin?: { barcode?: string | null } | null;
  to_bin?: { barcode?: string | null } | null;
};

/** The one browser writer for stock moves. Throws the server's refusal text. */
export async function postStockTransfer(transfer: StockTransfer): Promise<StockTransferReceipt> {
  const commandId = safeRandomUUID();
  const response = await fetch('/api/transfers', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': commandId },
    body: JSON.stringify({
      fromBinBarcode: transfer.fromBarcode,
      toBinBarcode: transfer.toBarcode,
      sku: transfer.sku,
      qty: Math.floor(transfer.qty),
      clientEventId: commandId,
      ...(transfer.notes ? { notes: transfer.notes } : {}),
    }),
  });
  const body = (await response.json().catch(() => null)) as TransferResponse | null;
  if (!response.ok || !body?.success) {
    throw new Error(body?.message || body?.error || `Could not move stock (${response.status})`);
  }
  return {
    fromBarcode: body.from_bin?.barcode?.trim() || transfer.fromBarcode,
    toBarcode: body.to_bin?.barcode?.trim() || transfer.toBarcode,
    sku: body.sku || transfer.sku,
    qty: Number(body.qty) || Math.floor(transfer.qty),
  };
}

/**
 * The move receipt: `Moved N to CODE` with Undo. Undo is a reverse transfer
 * under a new idempotency key, so the ledger keeps both rows.
 */
export function announceStockTransfer(
  receipt: StockTransferReceipt,
  { onSettled }: { onSettled?: () => void | Promise<unknown> } = {},
): void {
  toast.undo(`Moved ${receipt.qty} to ${receipt.toBarcode}`, {
    onUndo: () => {
      void postStockTransfer({
        fromBarcode: receipt.toBarcode,
        toBarcode: receipt.fromBarcode,
        sku: receipt.sku,
        qty: receipt.qty,
        notes: 'Undo move',
      })
        .then(() => toast.success(`Returned ${receipt.qty} to ${receipt.fromBarcode}`))
        .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not undo the move'))
        .finally(() => void onSettled?.());
    },
  });
}
