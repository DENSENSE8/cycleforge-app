/** An EXISTING repair, brought into the cart as a linked line. */

import type { KioskVisitRow } from '@/lib/counter/list-kiosk-visits';
import type { KioskRepairHeader } from '@/lib/counter/read-repair-ticket';
import type { VisitRepairProvenance } from '@/lib/counter/visit-provenance';
import { isRepairPayload, type KioskCartLine, type RepairPayload } from './cart-line';

/** The facts of a standalone repair the cart needs, whichever door it came through. */
export interface LinkableRepairRecord {
  repairId: number;
  ticketNumber: string | null;
  productTitle: string | null;
  serialNumber: string | null;
  /** The ticket's quote. Null = never quoted, which is not the same as $0. */
  priceCents: number | null;
  customerName: string | null;
  customerPhone: string | null;
}

/**
 * A History search row as a linkable record — or null when the row is a
 * counter VISIT. A visit's repairs are already on a transaction; linking one
 * would move it off the receipt that printed it, which the server refuses.
 */
export function linkableRepairFromVisitRow(row: KioskVisitRow): LinkableRepairRecord | null {
  if (row.source !== 'repair' || row.repairId == null) return null;
  return {
    repairId: row.repairId,
    ticketNumber: row.ticketNumber,
    productTitle: row.subtitle,
    serialNumber: row.serialNumber,
    priceCents: row.totalCents,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
  };
}

/** An opened standalone ticket (History detail) as a linkable record. */
export function linkableRepairFromHistory(
  repair: KioskRepairHeader,
  device: VisitRepairProvenance | null,
): LinkableRepairRecord {
  return {
    repairId: repair.repairId,
    ticketNumber: repair.ticketNumber,
    productTitle: device?.productTitle || null,
    serialNumber: device?.serialNumber || null,
    priceCents: repair.priceCents,
    customerName: repair.customer?.name ?? null,
    customerPhone: repair.customer?.phone ?? null,
  };
}

/** The cart line a linked repair becomes — the input `addRepair` takes. */
export function linkedRepairLine(record: LinkableRepairRecord): {
  title: string;
  unitAmountCents: number;
  payload: RepairPayload;
} {
  const ticket = record.ticketNumber?.trim() || `RS-${record.repairId}`;
  const title = record.productTitle?.trim() || ticket;
  const cents =
    record.priceCents != null && Number.isFinite(record.priceCents)
      ? Math.max(0, Math.trunc(record.priceCents))
      : 0;
  return {
    title,
    unitAmountCents: cents,
    payload: {
      productModel: title,
      serialNumber: record.serialNumber?.trim() ?? '',
      // The quote as the book's TEXT column would print it; empty when the
      // ticket was never quoted rather than claiming $0.00.
      price: record.priceCents != null ? (cents / 100).toFixed(2) : '',
      sourceSku: null,
      linkedRepairId: record.repairId,
      linkedTicketNumber: ticket,
    },
  };
}

/** The slice of the kiosk session {@link addLinkedRepair} reads and writes. */
export interface LinkedRepairCart {
  lines: readonly KioskCartLine[];
  customerPhone: string;
  customerName: string;
  addRepair(input: { title: string; unitAmountCents: number; payload: RepairPayload }): unknown;
  setCustomer(fields: { phone?: string; name?: string }): void;
}

/** Put a linked repair on the cart. */
export function addLinkedRepair(
  record: LinkableRepairRecord,
  cart: LinkedRepairCart,
): 'added' | 'already' {
  const twin = cart.lines.some(
    (line) =>
      line.type === 'REPAIR' &&
      isRepairPayload(line.payload) &&
      line.payload.linkedRepairId === record.repairId,
  );
  if (twin) return 'already';

  cart.addRepair(linkedRepairLine(record));
  if (!cart.customerPhone.trim() && record.customerPhone?.trim()) {
    cart.setCustomer({
      phone: record.customerPhone.trim(),
      ...(cart.customerName.trim() || !record.customerName?.trim()
        ? {}
        : { name: record.customerName.trim() }),
    });
  }
  return 'added';
}
