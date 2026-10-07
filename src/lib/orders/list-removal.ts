/**
 * Remove from list — an operator takes an order off the To-ship list
 * (Allocate's queues and the Live feed's open stages) with a reason, and can
 * put it back. Stored in `order_list_removals` (one active removal per order);
 * the To-ship scope (`sqlOrderInWarehouseToShip`) skips an order with an
 * active removal, so every list that reads that scope agrees. Client-safe.
 *
 * The reasons are the ways an order leaves a fulfillment queue without a dock
 * scan-out (operator 2026-10-06). `buyer_cancelled` also writes
 * `orders.status = 'buyer_cancelled'` so search keeps saying "Buyer cancel".
 * `delivered` also stamps the shipment `is_delivered` so carrier-status
 * surfaces (Shipped board, tracking lookups) agree with the operator's word.
 */

export const LIST_REMOVAL_REASONS = [
  { id: 'buyer_cancelled', label: 'Buyer cancelled', hint: 'The buyer cancelled before it shipped' },
  { id: 'shipped_elsewhere', label: 'Already shipped', hint: 'Left the building without a dock scan-out' },
  { id: 'delivered', label: 'Delivered', hint: 'The carrier shows it delivered' },
  { id: 'customer_picked_up', label: 'Customer picked up', hint: 'The buyer took it in person — nothing ships' },
  { id: 'duplicate', label: 'Duplicate order', hint: 'The same order is on the list twice' },
  { id: 'refunded', label: 'Refunded before shipping', hint: 'The buyer was refunded; nothing ships' },
  { id: 'seller_cancelled', label: 'Cancelled by us', hint: 'We cancelled it (out of stock, cannot fulfil)' },
  { id: 'marketplace_fulfilled', label: 'Fulfilled by the marketplace', hint: 'FBA / WFS or the platform shipped it' },
  { id: 'replaced', label: 'Replaced by another order', hint: 'A reshipment or a new order replaces it' },
  { id: 'test_order', label: 'Test order', hint: 'Not a real sale' },
  { id: 'other', label: 'Other', hint: 'Say why in the note' },
] as const;

export type ListRemovalReason = (typeof LIST_REMOVAL_REASONS)[number]['id'];

export const LIST_REMOVAL_REASON_IDS = LIST_REMOVAL_REASONS.map((reason) => reason.id) as [ListRemovalReason, ...ListRemovalReason[]];

/** `other` needs the note to say why. */
export const LIST_REMOVAL_NOTE_REQUIRED: ReadonlySet<ListRemovalReason> = new Set(['other']);

export const LIST_REMOVAL_NOTE_MAX = 500;

export function listRemovalReasonLabel(reason: string): string {
  return LIST_REMOVAL_REASONS.find((entry) => entry.id === reason)?.label ?? reason;
}

/** `POST /api/orders/list-removal` (remove) and `DELETE` (restore). */
export const LIST_REMOVAL_API = '/api/orders/list-removal';

/**
 * The order has an active removal — the To-ship scope's exclusion. `o` = the
 * orders alias; the probe is `ux_order_list_removals_active`.
 */
export function sqlOrderRemovedFromList(orderAlias = 'o'): string {
  return `EXISTS (
        SELECT 1 FROM order_list_removals olr
         WHERE olr.organization_id = ${orderAlias}.organization_id
           AND olr.order_id = ${orderAlias}.id
           AND olr.restored_at IS NULL
      )`;
}
