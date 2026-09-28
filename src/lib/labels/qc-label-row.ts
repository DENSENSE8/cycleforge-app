/**
 * One QC label record — a serial unit that carries a printed QC / pre-box
 * label (template `product`). Client-safe: the ledger and the loader share it.
 */

export interface QcLabelRow {
  serial_unit_id: number;
  unit_uid: string | null;
  serial_number: string | null;
  sku: string | null;
  /** Resolved through `resolveSkuIdentityTitle` by the loader. */
  title: string;
  condition_grade: string | null;
  current_status: string;
  location: string | null;
  /** Latest QC lineage row (not order-bound): who tested, when. */
  tested_by_name: string | null;
  tested_at: string | null;
  first_printed_at: string;
  last_printed_at: string;
  print_count: number;
  reprint_count: number;
  last_printed_by_name: string | null;
  /** The unit's open (non-released) allocation. */
  order_id: number | null;
  order_label: string | null;
  allocation_state: string | null;
  /** The order carries this serial (`tech_serial_numbers.order_id`) — the loop closed at pick. */
  serial_on_order: boolean;
}

/** Where the labelled unit is in the outbound loop. */
export type QcLabelStage = 'stock' | 'allocated' | 'picked' | 'shipped' | 'held';

const SELLABLE = new Set(['STOCKED', 'TESTED', 'GRADED', 'LABELED', 'RECEIVED']);

export function qcLabelStage(row: Pick<QcLabelRow, 'current_status' | 'allocation_state'>): QcLabelStage {
  if (row.current_status === 'SHIPPED' || row.allocation_state === 'SHIPPED') return 'shipped';
  if (row.allocation_state === 'PICKED' || row.allocation_state === 'PACKED') return 'picked';
  if (row.allocation_state === 'ALLOCATED' || row.allocation_state === 'PICKING') return 'allocated';
  return SELLABLE.has(row.current_status) ? 'stock' : 'held';
}

/** The sticker's scannable identity: the minted unit id, else the `U-{serial}` handle. */
export function qcLabelHandle(row: Pick<QcLabelRow, 'unit_uid' | 'serial_number' | 'serial_unit_id'>): string {
  return row.unit_uid?.trim() || (row.serial_number?.trim() ? `U-${row.serial_number.trim()}` : `U-${row.serial_unit_id}`);
}
