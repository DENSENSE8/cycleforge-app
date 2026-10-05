import { PRODUCT_NAME } from '@/lib/branding/constants';
import type { CustomerOrderHistoryEntry } from './customer-throughput';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value: number | null, currency: string | null): string {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || 'USD'}`;
  }
}

function date(value: string | null): string {
  if (!value) return 'Unknown date';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Unknown date';
}

/** A purchase record sent to a customer; this never creates a payment request. */
export function customerInvoiceEmail(args: {
  customerName: string;
  order: CustomerOrderHistoryEntry;
}): { subject: string; text: string; html: string } {
  const { customerName, order } = args;
  const reference = order.orderRef || 'your order';
  const itemText = order.items.map((item) => {
    const identity = [item.title || 'Item', item.sku ? `SKU ${item.sku}` : null].filter(Boolean).join(' · ');
    return `${item.quantity} × ${identity}${item.amount == null ? '' : ` — ${money(item.amount, item.currency || order.currency)}`}`;
  });
  const text = [
    `Hello ${customerName || 'there'},`,
    '',
    `Here is your invoice for order ${reference}.`,
    `Order date: ${date(order.placedAt)}`,
    `Sales channel: ${order.platform || 'Not recorded'}`,
    '',
    ...itemText,
    '',
    `Total: ${money(order.totalAmount, order.currency)}`,
    '',
    `Sent by ${PRODUCT_NAME}.`,
  ].join('\n');
  const rows = order.items.map((item) => {
    const title = escapeHtml(item.title || 'Item');
    const sku = item.sku ? `<div style="color:#666;font-size:12px">SKU ${escapeHtml(item.sku)}</div>` : '';
    return `<tr><td style="padding:8px 0;border-bottom:1px solid #ddd">${title}${sku}</td><td style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:right">${item.quantity}</td><td style="padding:8px 0;border-bottom:1px solid #ddd;text-align:right">${escapeHtml(money(item.amount, item.currency || order.currency))}</td></tr>`;
  }).join('');
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#171717;line-height:1.45"><main style="max-width:640px;margin:0 auto;padding:24px"><h1 style="font-size:22px;margin:0 0 8px">Invoice</h1><p style="margin:0 0 24px;color:#555">Order ${escapeHtml(reference)}</p><p>Hello ${escapeHtml(customerName || 'there')},</p><p>Here is your invoice for this purchase.</p><dl><dt style="font-weight:700">Order date</dt><dd style="margin:0 0 8px">${escapeHtml(date(order.placedAt))}</dd><dt style="font-weight:700">Sales channel</dt><dd style="margin:0 0 16px">${escapeHtml(order.platform || 'Not recorded')}</dd></dl><table style="width:100%;border-collapse:collapse"><thead><tr><th style="padding:8px 0;text-align:left;border-bottom:2px solid #171717">Item</th><th style="padding:8px 12px;text-align:right;border-bottom:2px solid #171717">Qty</th><th style="padding:8px 0;text-align:right;border-bottom:2px solid #171717">Amount</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="2" style="padding:12px 12px 0 0;text-align:right">Total</th><th style="padding:12px 0 0;text-align:right">${escapeHtml(money(order.totalAmount, order.currency))}</th></tr></tfoot></table><p style="margin-top:28px;color:#666;font-size:12px">Sent by ${escapeHtml(PRODUCT_NAME)}.</p></main></body></html>`;
  return { subject: `Invoice for order ${reference}`, text, html };
}
