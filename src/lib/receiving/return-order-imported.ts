/**
 * One copy + one line fill for "this serial/order imported as a return."
 * Scan-serial, import-sales-order, and unmatched-items all use this — no
 * third toast wording, no second item_name mapping.
 */

type ReturnOrderImported = {
  orderId: string;
  productTitle?: string | null;
  sku?: string | null;
  platform?: string | null;
};

type ReturnOrderLineFill = {
  receiving_type: 'RETURN';
  source_order_id: string;
  zoho_purchaseorder_number: string;
  item_name?: string;
  sku?: string;
  source_platform?: string;
};

function prettyPlatform(raw: string | null | undefined): string {
  const p = String(raw || '').trim().toLowerCase();
  if (!p) return '';
  if (p === 'amazon' || p === 'amz' || p === 'fba') return 'Amazon';
  if (p.startsWith('ebay')) return 'eBay';
  if (p === 'walmart') return 'Walmart';
  if (p === 'ecwid') return 'Ecwid';
  return String(raw).trim();
}

export function returnOrderImportedCopy(order: ReturnOrderImported): {
  title: string;
  description: string;
} {
  const orderId = String(order.orderId || '').trim();
  const productTitle = String(order.productTitle || '').trim();
  const platform = prettyPlatform(order.platform);
  const title = productTitle || (orderId ? `Order ${orderId}` : 'Return imported');
  const description = ['RETURN', platform || null, orderId || null].filter(Boolean).join(' · ');
  return { title, description };
}

export function returnOrderLineFill(order: ReturnOrderImported): ReturnOrderLineFill {
  const orderId = String(order.orderId || '').trim();
  const productTitle = String(order.productTitle || '').trim();
  const sku = String(order.sku || '').trim();
  const platform = String(order.platform || '').trim().toLowerCase();
  const fill: ReturnOrderLineFill = {
    receiving_type: 'RETURN',
    source_order_id: orderId,
    zoho_purchaseorder_number: orderId,
  };
  if (productTitle) fill.item_name = productTitle;
  if (sku) fill.sku = sku;
  if (platform) fill.source_platform = platform;
  return fill;
}
