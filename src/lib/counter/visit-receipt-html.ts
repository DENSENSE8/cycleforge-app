/** VisitReceipt → a self-contained HTML page. */

import bwipjs from 'bwip-js/node';
import type { VisitReceipt, VisitReceiptLineItem, VisitReceiptRepairItem } from './visit-receipt';

// ── Escaping ─────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** Minor units → a display string. Sign is carried by the figure — a buyback line prints as a credit. */
function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

const STATUS_LABEL: Record<VisitReceipt['payment']['status'], string> = {
  staged: 'Staged',
  paid: 'Paid in full',
  partially_paid: 'Partially paid — balance due',
  abandoned: 'Abandoned',
  voided: 'Voided',
};

// ── Barcode ──────────────────────────────────────────────────────────────────

/** The printed barcode, as an inline `<svg>` string. */
function barcodeSvg(value: string): string {
  try {
    return bwipjs.toSVG({
      bcid: 'code128',
      text: value,
      scale: 2,
      height: 12,
      includetext: true,
      textsize: 8,
      textxalign: 'center',
      barcolor: '000000',
    });
  } catch {
    // A value code128 can't encode (empty string, unsupported char) must
    // never take the whole receipt down — the customer still gets paper.
    return '';
  }
}

// ── Sections ─────────────────────────────────────────────────────────────────

function lineItemRowHtml(item: VisitReceiptLineItem): string {
  const qty = item.kind === 'buyback' ? '1' : String(item.quantity);
  return `
        <tr>
          <td class="desc">${escapeHtml(item.title)}${item.kind === 'buyback' ? ' <span class="tag">(trade-in)</span>' : ''}${
            item.adjustment ? `<br><span class="meta">${escapeHtml(item.adjustment)}</span>` : ''
          }${item.note ? `<br><span class="meta">${escapeHtml(item.note)}</span>` : ''}</td>
          <td class="num">${qty}</td>
          <td class="num">${formatCents(item.unitAmountCents)}</td>
          <td class="num">${formatCents(item.extendedAmountCents)}</td>
        </tr>`;
}

/** One repair device: */
function repairRowHtml(item: VisitReceiptRepairItem): string {
  const identity = [
    escapeHtml(item.rsCode),
    item.ticket ? `Ticket ${escapeHtml(item.ticket)}` : '',
    item.serialNumber ? `SN ${escapeHtml(item.serialNumber)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const issue = item.issue ? `<br><span class="issue">Issue: ${escapeHtml(item.issue)}</span>` : '';
  return `
        <tr>
          <td class="desc">${escapeHtml(item.productTitle)}${issue}<br><span class="meta">${identity}</span></td>
          <td class="num">1</td>
          <td class="num">${formatCents(item.quoteCents)}</td>
          <td class="num">${formatCents(item.quoteCents)}</td>
        </tr>`;
}

function itemsTableHtml(receipt: VisitReceipt): string {
  const rows = [...receipt.lineItems.map(lineItemRowHtml), ...receipt.repairs.map(repairRowHtml)];
  if (rows.length === 0) {
    return `<table class="items"><tbody><tr><td class="desc" colspan="4">No items on this visit.</td></tr></tbody></table>`;
  }
  return `
      <table class="items">
        <thead>
          <tr>
            <th class="desc">Item</th>
            <th class="num">Qty</th>
            <th class="num">Price</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${rows.join('')}
        </tbody>
      </table>`;
}

function totalsHtml(receipt: VisitReceipt): string {
  const { payment } = receipt;
  const rows: string[] = [
    `<div class="totals-row"><span>Subtotal</span><span>${formatCents(receipt.subtotalCents)}</span></div>`,
  ];
  if (payment.taxCents != null) {
    rows.push(`<div class="totals-row"><span>Tax</span><span>${formatCents(payment.taxCents)}</span></div>`);
  }
  rows.push(
    `<div class="totals-row total"><span>Total</span><span>${formatCents(receipt.totalCents)}</span></div>`,
  );
  if (payment.amountPaidCents > 0) {
    rows.push(
      `<div class="totals-row"><span>Paid${payment.tender ? ` (${escapeHtml(payment.tender)})` : ''}</span><span>${formatCents(payment.amountPaidCents)}</span></div>`,
    );
  }
  if (payment.amountDueCents > 0) {
    rows.push(
      `<div class="totals-row due"><span>Balance due</span><span>${formatCents(payment.amountDueCents)}</span></div>`,
    );
  }
  return rows.join('\n      ');
}

function customerHtml(receipt: VisitReceipt): string {
  if (!receipt.customer) return '';
  const { name, phone, email, address } = receipt.customer;
  // Callers: renderVisitReceiptHtml. User: "print out a receipt including everything" + "intake ... address"
  const lines = [name, phone, email, address].filter(Boolean).map((v) => escapeHtml(String(v)));
  if (lines.length === 0) return '';
  return `<p class="customer">${lines.join(' · ')}</p>`;
}

// ── Entry point ──────────────────────────────────────────────────────────────

interface RenderVisitReceiptOptions {
  /** Fires `window.print()` on load — the `?print=1` path. Plain GET renders without it. */
  autoPrint?: boolean;
  /** Callers: GET /api/kiosk/visit/[id]/receipt. User: "give internal staff as an internal record" */
  copy?: 'customer' | 'staff';
}

/** Render a `VisitReceipt` to a self-contained HTML page. No external references — see module doc. */
export function renderVisitReceiptHtml(
  receipt: VisitReceipt,
  opts: RenderVisitReceiptOptions = {},
): string {
  const shopName = escapeHtml(receipt.header.name);
  const addressLines = [receipt.header.addressLine1, receipt.header.addressLine2]
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
  const phone = receipt.header.phone
    ? `<p>Tel: ${escapeHtml(receipt.header.phone)}</p>`
    : '';
  const svg = barcodeSvg(receipt.barcodeValue);
  const statusLabel = STATUS_LABEL[receipt.payment.status];
  const copyBanner =
    opts.copy === 'staff'
      ? '<p class="staff-copy">STAFF RECORD — keep with the till</p>'
      : '';
  const printScript = opts.autoPrint
    ? '<script>window.onload = function () { window.print(); };</script>'
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt — Visit #${receipt.visitId}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    font-family: 'Courier New', Courier, monospace;
    color: #111;
    background: #fff;
  }
  body {
    width: 100%;
    max-width: 340px;
    margin: 0 auto;
    padding: 16px 12px 24px;
  }
  h1 { font-size: 12px; text-align: center; margin-bottom: 2px; }
  .shop p { font-size: 9px; text-align: center; color: #333; }
  .rule { border-top: 1px dashed #000; margin: 8px 0; }
  .meta-row { display: flex; justify-content: space-between; font-size: 9px; margin: 1px 0; }
  .customer { font-size: 9px; text-align: center; margin: 4px 0; }
  table.items { width: 100%; border-collapse: collapse; font-size: 9px; margin: 6px 0; }
  table.items th { text-align: left; border-bottom: 1px solid #000; padding: 2px 0; font-weight: bold; }
  table.items td { padding: 3px 0; vertical-align: top; }
  table.items td.desc { max-width: 160px; word-break: break-word; }
  table.items th.num, table.items td.num { text-align: right; white-space: nowrap; padding-left: 6px; }
  .meta { color: #555; font-size: 10px; }
  .issue { font-size: 9px; line-height: 1.3; }
  .tag { color: #555; font-size: 10px; }
  .totals-row { display: flex; justify-content: space-between; font-size: 10px; padding: 1px 0; }
  .totals-row.total { font-weight: bold; font-size: 11px; border-top: 1px solid #000; margin-top: 4px; padding-top: 4px; }
  .totals-row.due { font-weight: bold; color: #b00000; }
  .status { text-align: center; font-size: 12px; font-weight: bold; margin: 10px 0 4px; }
  .barcode { text-align: center; margin: 12px 0; }
  .barcode svg { max-width: 100%; height: auto; }
  .receipt-link { text-align: center; font-size: 10px; word-break: break-all; margin-top: 4px; }
  .footer { text-align: center; font-size: 10px; color: #333; margin-top: 14px; line-height: 1.4; }
  .staff-copy { text-align: center; font-size: 9px; font-weight: bold; letter-spacing: 0.08em; margin-bottom: 6px; }

  @media print {
    html, body { width: 80mm; max-width: 80mm; }
    body { padding: 4mm 3mm 8mm; }
    @page { size: 80mm auto; margin: 0; }
  }

  /* Letter paper: widen back out and center like a printed document. */
  @media print and (min-width: 190mm) {
    html, body { width: 100%; max-width: 100%; }
    body { max-width: 340px; padding: 16px 12px 24px; }
    @page { size: letter; margin: 12mm; }
  }
</style>
${printScript}
</head>
<body>
  ${copyBanner}
  <h1>${shopName}</h1>
  <div class="shop">${addressLines}${phone}</div>

  <div class="rule"></div>

  <div class="meta-row"><span>Visit</span><span>#${receipt.visitId}</span></div>
  ${receipt.visitDate ? `<div class="meta-row"><span>Date</span><span>${escapeHtml(receipt.visitDate)}</span></div>` : ''}
  ${customerHtml(receipt)}

  <div class="rule"></div>

  ${itemsTableHtml(receipt)}

  <div class="rule"></div>

  ${totalsHtml(receipt)}

  <p class="status">${escapeHtml(statusLabel)}</p>
  ${receipt.payment.receiptUrl ? `<p class="receipt-link">${escapeHtml(receipt.payment.receiptUrl)}</p>` : ''}

  ${svg ? `<div class="barcode">${svg}</div>` : ''}

  <p class="footer">${escapeHtml(receipt.footer)}</p>
</body>
</html>`;
}
