/**
 * Pure Amazon order-item helpers — safe for client + server.
 * I/O lives in `order-item-refresh.ts`.
 */
import { getOrderPlatformLabel } from '@/utils/order-platform';

/** Minimal item shape for ASIN/title/SKU extraction (matches SP-API OrderItem). */
export type AmazonOrderItemFacts = {
  ASIN?: string;
  SellerSKU?: string;
  Title?: string;
};

function representativeFacts(items: AmazonOrderItemFacts[]): AmazonOrderItemFacts | null {
  return items.find((i) => i.SellerSKU || i.Title) || items[0] || null;
}

export function isAmazonOrderForItemRefresh(
  orderId: string | null | undefined,
  accountSource: string | null | undefined,
): boolean {
  const oid = String(orderId || '').trim();
  const src = String(accountSource || '').trim().toLowerCase();
  if (!oid) return false;
  const label = getOrderPlatformLabel(oid, accountSource).toLowerCase();
  if (label === 'amazon' || label === 'fba') return true;
  if (/^\d{3}-\d+-\d+$/.test(oid)) return true;
  if (src.includes('amazon') || src === 'fba') return true;
  return false;
}

export function asinFromOrderItems(items: AmazonOrderItemFacts[]): string | null {
  const asin = String(representativeFacts(items)?.ASIN || '').trim().toUpperCase();
  return asin || null;
}

export function titleFromOrderItems(items: AmazonOrderItemFacts[]): string | null {
  const title = String(representativeFacts(items)?.Title || '').trim();
  return title || null;
}

export function skuFromOrderItems(items: AmazonOrderItemFacts[]): string | null {
  const sku = String(representativeFacts(items)?.SellerSKU || '').trim();
  return sku || null;
}
