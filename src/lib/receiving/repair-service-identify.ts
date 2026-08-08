/**
 * Repair-service identify — shared helpers for Arrival Pairing · Unbox Classify
 * · Linkage Store. The UI host is {@link RepairServiceIdentify}; this module
 * owns linked-state detection and the carton Order # display contract.
 *
 * Soft-join only: carton/line ↔ Ecwid -RS order ↔ repair_service ticket share
 * order id / tracking / SKU — no FK.
 *
 * Out of scope: mobile Arrival classify identify (desktop Pairing / Unbox
 * Classify + Linkage only). Wire MobileCartonSheet when mobile is in scope.
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { getReceivingPoIdentityParts } from '@/lib/receiving/po-group-title';

/** True when the carton/line already carries an Ecwid repair-service order link. */
export function isRepairServiceLinked(
  row: Pick<
    ReceivingLineRow,
    | 'source_platform'
    | 'source_platform_pill'
    | 'zoho_purchaseorder_id'
    | 'zoho_purchaseorder_number'
    | 'source_order_id'
    | 'receiving_type'
  >,
): boolean {
  if (row.zoho_purchaseorder_id) return false;
  const platform = (
    row.source_platform ||
    row.source_platform_pill ||
    ''
  )
    .trim()
    .toLowerCase();
  if (platform !== 'ecwid') return false;
  const orderId = (
    row.zoho_purchaseorder_number ||
    row.source_order_id ||
    ''
  ).trim();
  return orderId.length > 0;
}

/** Linked Ecwid order # for chip copy, or null when unpaired. */
export function repairServiceLinkedOrderId(
  row: Pick<
    ReceivingLineRow,
    'zoho_purchaseorder_number' | 'source_order_id' | 'source_platform' | 'source_platform_pill'
  >,
): string | null {
  const platform = (
    row.source_platform ||
    row.source_platform_pill ||
    ''
  )
    .trim()
    .toLowerCase();
  if (platform !== 'ecwid') return null;
  const orderId = (
    row.zoho_purchaseorder_number ||
    row.source_order_id ||
    ''
  ).trim();
  return orderId || null;
}

/**
 * Display contract (D4): after repair identify, identity must read Order + #,
 * never Unfound / empty PO face.
 */
export function repairServiceIdentityShowsOrder(
  row: ReceivingLineRow,
  resolvePlatformLabel: (raw: string) => string = () => '',
): boolean {
  if (!isRepairServiceLinked(row)) return false;
  const parts = getReceivingPoIdentityParts(row, resolvePlatformLabel);
  return parts.idPrefix === 'Order' && parts.poValue.trim().length > 0;
}
