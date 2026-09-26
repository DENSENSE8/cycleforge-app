/** Repair bench-action vocabulary shared by the API (`/api/repair/actions`), the mobile action sheet, and the action timeline — one set of… */
import type { RepairActionType } from '@/lib/repair-action-type-tone';
import { isProvisionalSku } from '@/lib/inventory/provisional-sku';

/** Where an installed part came from (`repair_actions.donor_source`). */
export const REPAIR_DONOR_SOURCES = ['new_stock', 'donor_unit', 'customer_part'] as const;
export type RepairDonorSource = (typeof REPAIR_DONOR_SOURCES)[number];

export const REPAIR_DONOR_SOURCE_COPY: Record<RepairDonorSource, { label: string; refLabel: string | null }> = {
  new_stock: { label: 'New stock', refLabel: null },
  donor_unit: { label: 'Donor unit', refLabel: 'Donor unit serial or SKU' },
  customer_part: { label: 'Customer part', refLabel: null },
};

/** Which side of the work a bench shot shows. */
export type BenchPhotoSide = 'before' | 'after';

/**
 * `photo_type` for before/after shots taken while logging work. They are plain
 * repair photos (entity REPAIR_SERVICE, keyed to the repair id — REPAIR_SERVICE
 * accepts any photo_type in the write matrix); the type only says which side.
 */
export const BENCH_PHOTO_TYPE: Record<BenchPhotoSide, string> = {
  before: 'bench_before',
  after: 'bench_after',
};

export interface RepairActionRecord {
  id: number;
  repair_id: number;
  action_type: string;
  part_name: string | null;
  /** `old_*` = the part removed / worked on; `new_*` = the part installed / needed. */
  old_sku: string | null;
  new_sku: string | null;
  old_serial: string | null;
  new_serial: string | null;
  /** Legacy typed minutes; new entries carry `session_id` instead. */
  duration_min: number | null;
  notes: string | null;
  staff_id: number | null;
  staff_name: string | null;
  created_at: string;
  /** The bench session this entry was logged in. */
  session_id: number | null;
  donor_source: RepairDonorSource | null;
  donor_ref: string | null;
  /** Board reference designator, e.g. `C12`. */
  component_ref: string | null;
  component_value: string | null;
  component_qty: number | null;
  /** The −N `sku_stock_ledger` row when the installed part was taken from stock. */
  stock_ledger_id: number | null;
  /** The bin the part was taken from (`bin_contents` moved with the ledger), and how many. */
  stock_location_id: number | null;
  stock_qty: number | null;
  /** That bin's operator handle (name, else barcode). */
  stock_bin_label: string | null;
  /** Bench log → helpdesk ticket note (see `repair-action-ticket-note.ts`). */
  ticket_post_status: 'pending' | 'posted' | 'failed' | null;
  ticket_post_ticket_id: number | null;
  ticket_comment_id: number | null;
  ticket_post_error: string | null;
  ticket_post_attempted_at: string | null;
}

/** Whether an action may take its installed part out of stock: */
export function canConsumeStock(input: {
  actionType: string;
  donorSource: RepairDonorSource | null;
  newSku: string | null;
}): boolean {
  const sku = input.newSku?.trim() ?? '';
  return (
    input.actionType === 'replaced' &&
    input.donorSource === 'new_stock' &&
    sku.length > 0 &&
    !isProvisionalSku(sku)
  );
}

/** Operator wording: `label` names the bench act, `sub` says what it covers. */
export const REPAIR_ACTION_COPY: Record<RepairActionType, { label: string; sub: string }> = {
  repaired: { label: 'Repaired a component', sub: 'Soldered or repaired a component' },
  replaced: { label: 'Replaced a part', sub: 'Swapped in a new or donor part' },
  cleaned: { label: 'Cleaned', sub: 'Contacts, ports, or the mechanism' },
  tested: { label: 'Tested', sub: 'Verified working after the work' },
  awaiting_part: { label: 'Waiting on a part', sub: 'Part ordered — bench paused' },
  no_fix: { label: 'No fix', sub: 'Cannot be repaired' },
};

export function repairActionLabel(type: string): string {
  return REPAIR_ACTION_COPY[type as RepairActionType]?.label ?? type;
}

/**
 * A saved action that usually means the customer should hear something next.
 * Only a suggestion — the page offers "Draft customer update", never a send.
 */
export function actionSuggestsCustomerUpdate(type: string): boolean {
  return type === 'repaired' || type === 'tested';
}
