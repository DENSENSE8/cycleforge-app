/** The carton hub's read model (`/m/r/[id]`, the mobile exoskeleton): */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { workflowStage } from '@/lib/receiving/workflow-stages';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';

export interface CartonHubSerial {
  id: number;
  serial_number: string;
  current_status?: string | null;
  current_location?: string | null;
}

export interface CartonHubLine {
  id: number;
  sku: string | null;
  item_name: string | null;
  catalog_product_title?: string | null;
  zoho_item_title?: string | null;
  quantity_expected: number | null;
  quantity_received: number;
  workflow_status: string | null;
  qa_status?: string | null;
  condition_grade?: string | null;
  zoho_purchaseorder_id?: string | null;
  zoho_purchaseorder_number?: string | null;
  receiving_type?: string | null;
  intake_type?: string | null;
  serials?: CartonHubSerial[];
}

export interface CartonHubCarton {
  id: number;
  tracking: string | null;
  carrier: string | null;
  source: string | null;
  source_platform: string | null;
  intake_type: string | null;
  is_return: boolean | null;
  return_platform: string | null;
  return_reason: string | null;
  target_channel: string | null;
  qa_status: string | null;
  condition_grade: string | null;
  zoho_purchaseorder_id: string | null;
  zoho_purchaseorder_number: string | null;
  received_at: string | null;
  received_by_name?: string | null;
  unboxed_at: string | null;
  unboxed_by_name?: string | null;
  created_at: string | null;
}

export interface CartonHubEvent {
  id: number;
  occurred_at: string;
  event_type: string;
  actor_name: string | null;
  station: string | null;
  bin_name: string | null;
  serial_number: string | null;
  sku: string | null;
  notes: string | null;
}

export interface CartonHubData {
  receiving: CartonHubCarton;
  purchase_orders: Array<{
    zoho_purchaseorder_id: string;
    zoho_purchaseorder_number: string | null;
    line_count: number;
  }>;
  lines: CartonHubLine[];
  totals: { expected: number; received: number; lines: number; lines_complete: number };
  events: CartonHubEvent[];
}

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** A line's title through the SKU identity law — the Zoho item name governs. */
export function cartonLineTitle(line: CartonHubLine): string {
  return (
    resolveSkuIdentityTitle({
      zoho_item_title: line.zoho_item_title,
      catalog_product_title: line.catalog_product_title,
      item_name: line.item_name,
      sku: line.sku,
    }) || `Line L-${line.id}`
  );
}

/**
 * The carton's stage is its SLOWEST line's: a carton with one line still
 * expected is not "received" because the others are. No lines → Expected.
 */
export function cartonStage(lines: readonly Pick<CartonHubLine, 'workflow_status'>[]): string {
  let slowest: string | null = null;
  for (const line of lines) {
    const status = line.workflow_status || 'EXPECTED';
    if (slowest === null || workflowStage(status).order < workflowStage(slowest).order) slowest = status;
  }
  return slowest ?? 'EXPECTED';
}

/** The PO numbers on the carton, deduped, in line order. */
export function cartonPoNumbers(data: Pick<CartonHubData, 'purchase_orders' | 'receiving'>): string[] {
  const numbers = data.purchase_orders
    .map((po) => (po.zoho_purchaseorder_number || po.zoho_purchaseorder_id || '').trim())
    .filter(Boolean);
  const own = (data.receiving.zoho_purchaseorder_number || '').trim();
  if (numbers.length === 0 && own) numbers.push(own);
  return [...new Set(numbers)];
}

/**
 * The card title — the most recognisable name for the box: its one item when
 * it holds one, else its PO, else how many items it holds.
 */
export function cartonTitle(data: CartonHubData): string {
  const titles = [...new Set(data.lines.map(cartonLineTitle))];
  if (titles.length === 1) return titles[0];
  const pos = cartonPoNumbers(data);
  if (pos.length > 0) return `PO ${pos.join(', ')}`;
  if (titles.length > 1) return `${plural(titles.length, 'item')} in this carton`;
  return 'Receiving carton';
}

/** The receive lane's inputs, built from the carton read (see complete-carton). */
export function cartonUnboxRow(
  data: CartonHubData,
): Pick<
  ReceivingLineRow,
  'receiving_id' | 'receiving_source' | 'zoho_purchaseorder_id' | 'intake_type' | 'receiving_type' | 'carton_intake_type'
> {
  const first = data.lines[0];
  return {
    receiving_id: data.receiving.id,
    receiving_source: data.receiving.source,
    zoho_purchaseorder_id: data.receiving.zoho_purchaseorder_id ?? first?.zoho_purchaseorder_id ?? null,
    intake_type: first?.intake_type ?? null,
    receiving_type: first?.receiving_type ?? null,
    carton_intake_type: data.receiving.intake_type,
  };
}

/**
 * Why Unbox can't run on this carton, or null when it can. The route is the
 * final word (photo policy, claims); this only refuses what the read already
 * shows — there is nothing to receive.
 */
export function cartonUnboxBlock(data: CartonHubData): string | null {
  if (data.lines.length === 0) return 'No lines on this carton yet — nothing to unbox.';
  const open = data.lines.filter(
    (line) => workflowStage(line.workflow_status).order < workflowStage('UNBOXED').order,
  );
  if (open.length === 0) return 'Every line on this carton is already unboxed.';
  return null;
}

/** `2026-09-24 15:43:00` (server wall clock) → `Sep 24, 3:43 PM`; blank → null. */
export function formatCartonStamp(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
