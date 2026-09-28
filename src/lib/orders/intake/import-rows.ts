/**
 * The import lists' row facts — ONE reader for a Square invoice and an Ecwid
 * order, so the desk (`CheckoutSquareImport` / `CheckoutEcwidImport`) and the
 * phone (`MobileImportList`) show the same words in the same places:
 * #number · buyer / N items · titles / status / amount / "In CycleForge · #".
 */

import type { EcwidOrderImport } from '@/lib/orders/ecwid-order-import';
import { formatCents } from '@/lib/orders/manual-order-draft';
import type { SquareInvoiceImport } from '@/lib/orders/square-invoice-import-core';

export type ImportRowTone = 'success' | 'warning' | 'muted';

export interface ImportRowFacts {
  key: string;
  number: string;
  who: string;
  what: string;
  amount: string;
  status: { label: string; tone: ImportRowTone } | null;
  /** The CycleForge order number this record already lives under. */
  importedAs: string | null;
}

/** "3 items · Bose 151, Wall bracket". */
export function importItemsLine(lines: ReadonlyArray<{ title: string; quantity: number }>, fallback = 'No lines'): string {
  const n = lines.reduce((sum, l) => sum + l.quantity, 0);
  return `${n} item${n === 1 ? '' : 's'} · ${lines.map((l) => l.title).join(', ') || fallback}`;
}

const SQUARE_STATUS_TONE: Readonly<Record<string, ImportRowTone>> = {
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
};

export function squareInvoiceRow(inv: SquareInvoiceImport): ImportRowFacts {
  return {
    key: inv.invoiceId,
    number: inv.invoiceNumber,
    who: inv.customer.name || 'No customer name',
    what: importItemsLine(inv.lines, inv.title || 'No lines'),
    amount: formatCents(inv.totalCents, inv.currency),
    status: { label: inv.status.replace(/_/g, ' ').toLowerCase(), tone: SQUARE_STATUS_TONE[inv.status] ?? 'muted' },
    importedAs: inv.importedAs ?? null,
  };
}

export function ecwidOrderRow(order: EcwidOrderImport, currency: string): ImportRowFacts {
  return {
    key: order.orderNumber,
    number: order.orderNumber,
    who: order.customer.name || 'No buyer name',
    what: importItemsLine(order.lines),
    amount: order.totalCents != null ? formatCents(order.totalCents, order.currency || currency) : '—',
    // No ship-to → it imports as a pickup; say so before the tap.
    status: order.hasShipTo ? null : { label: 'pickup', tone: 'muted' },
    importedAs: order.importedAs ?? null,
  };
}
