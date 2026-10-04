/**
 * Client-safe wire types for "what we sent the customer" on a support ticket
 * (`support_ticket_items`, migration 2026-10-03_items_sent_support_ticket_items).
 * No DB / server imports.
 */

import { parseProductTokens, stripSentProductLines, type TicketItemRole } from './product-token';

/**
 * One catalog product as every support surface paints it — identity title
 * (`resolveSkuIdentityTitle`), photo, SKU, stock. Read at view time (P6).
 */
export interface SupportProductFace {
  skuCatalogId: number;
  sku: string;
  title: string;
  imageUrl: string | null;
  onHand: number;
  /** The bin holding the most units, `null` when none is stocked. */
  bin: string | null;
}

/** Where a picker list came from — the eyebrow the list paints. */
export type SupportProductSource = 'search' | 'ticket' | 'recent' | 'ids' | 'sku';

export interface SupportProductsResponse {
  products: SupportProductFace[];
  source: SupportProductSource;
}

/** One logged item: the structured fact plus the product's live face. */
export interface SupportTicketItem {
  id: number;
  /** Provider (Zendesk) ticket number — the id every ticket surface holds. */
  ticketId: number;
  role: TicketItemRole;
  qty: number;
  note: string | null;
  /** The helpdesk comment the pick rode on; the thread paints the card under it. */
  zendeskCommentId: number | null;
  orderId: number | null;
  shippingLabelPurchaseId: number | null;
  staffId: number | null;
  staffName: string | null;
  createdAt: string;
  product: SupportProductFace;
}

export interface SupportTicketItemsResponse {
  items: SupportTicketItem[];
}

/** POST body item — `clientEventId` makes a retried send a no-op. */
export interface SupportTicketItemCreate {
  skuCatalogId: number;
  role: TicketItemRole;
  qty: number;
  note?: string | null;
  clientEventId: string;
}

export function supportTicketItemsUrl(ticketId: number): string {
  return `/api/support/tickets/${ticketId}/items`;
}

/**
 * What one thread comment paints for "Product sent to customer".
 *
 * Two shapes reach the thread: our optimistic echo still carries the raw
 * `[[product:…]]` tokens (the markdown renderer paints those as cards), while
 * the helpdesk-mirrored comment carries only the readable email line — Zendesk
 * derives `body` from `html_body`. For the second, the card comes from the log
 * row bound to this comment (`zendeskCommentId`) and its readable line is
 * removed so the product shows once.
 */
export function ticketItemsForComment(
  body: string,
  commentId: number | null | undefined,
  items: readonly SupportTicketItem[],
): { body: string; items: SupportTicketItem[] } {
  if (commentId == null || items.length === 0) return { body, items: [] };
  const bound = items.filter((it) => it.zendeskCommentId === commentId);
  if (bound.length === 0) return { body, items: [] };
  const tokenIds = new Set(parseProductTokens(body).map((t) => t.skuCatalogId));
  const cards = bound.filter((it) => !tokenIds.has(it.product.skuCatalogId));
  return {
    body: stripSentProductLines(body, cards.map((it) => ({ role: it.role, qty: it.qty, sku: it.product.sku }))),
    // Oldest first, the order they were picked.
    items: [...cards].sort((a, b) => a.id - b.id),
  };
}