/**
 * Paste import — the deterministic half. A pasted order (an email, a
 * marketplace row, a typed note, a CSV/TSV) → the fields a manual order needs,
 * for the operator to REVIEW in the intake form. Never creates anything.
 *
 * Pure: no I/O. What it cannot read stays blank; the extract route asks the
 * model only when this found no product at all.
 */

import { autoMapCsvOrderHeaders } from '@/lib/orders/csv-order-import';
import { classifyPastedText } from '@/lib/orders/import/paste-intake';
import { detectCarrierFromTracking } from '@/utils/carrier-patterns';

export interface CapturedOrderLine {
  title: string;
  sku: string;
  itemNumber: string;
  quantity: number | null;
  /** Price EACH, major units. */
  unitPrice: number | null;
  /** As written ("used", "like new") — the form resolves it to a grade. */
  condition: string;
}

export interface CapturedOrder {
  orderNumber: string;
  platform: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shipTo: { address1: string; address2: string; city: string; state: string; postalCode: string; country: string };
  /** As written ("Friday", "10/2", "2026-10-02"). */
  shipBy: string;
  trackingNumber: string;
  note: string;
  lines: CapturedOrderLine[];
}

export function emptyCapturedOrder(): CapturedOrder {
  return {
    orderNumber: '',
    platform: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    shipTo: { address1: '', address2: '', city: '', state: '', postalCode: '', country: '' },
    shipBy: '',
    trackingNumber: '',
    note: '',
    lines: [],
  };
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
/** "Springfield, IL 62704" / "Springfield IL 62704-1234". */
const CITY_STATE_ZIP_RE = /^(.+?),?\s+([A-Z]{2})\.?\s+(\d{5}(?:-\d{4})?)(?:\s+(US|USA|United States))?$/i;
const STREET_RE = /^\d+[A-Z]?\s+\S.*$/i;
const UNIT_RE = /^(?:apt|apartment|suite|ste|unit|#|floor|fl|bldg|building)\b.*$/i;
const MONEY = String.raw`\$?\s*(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)`;
/** "2 x Bose remote @ $39.00" / "2 × Bose remote - $39 each". */
const QTY_FIRST_RE = new RegExp(String.raw`^(\d{1,4})\s*[x×]\s+(.+?)(?:\s+(?:@|at|-|–|—)\s*${MONEY}(?:\s*(?:ea|each))?)?$`, 'i');
/** "Bose remote x2 @ $39" / "Bose remote (qty 2) $39". */
const QTY_LAST_RE = new RegExp(String.raw`^(.+?)\s+(?:[x×]\s*(\d{1,4})|\(?qty:?\s*(\d{1,4})\)?)(?:\s+(?:@|at|-|–|—)?\s*${MONEY}(?:\s*(?:ea|each))?)?$`, 'i');

const money = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** `Label: value` (or `Label<TAB>value`) → [label, value] with the label lowercased. */
function labelled(line: string): [string, string] | null {
  const m = line.match(/^([A-Za-z][A-Za-z #./-]{1,30}?)\s*(?::|\t|\s-\s)\s*(.*)$/);
  return m ? [m[1]!.trim().toLowerCase().replace(/\s+/g, ' '), m[2]!.trim()] : null;
}

const LABEL_FIELD: Record<string, keyof CapturedOrder | 'title' | 'sku' | 'itemNumber' | 'quantity' | 'unitPrice' | 'condition' | 'shipToBlock'> = {
  order: 'orderNumber', 'order #': 'orderNumber', 'order no': 'orderNumber', 'order no.': 'orderNumber',
  'order number': 'orderNumber', 'order id': 'orderNumber', 'order#': 'orderNumber',
  platform: 'platform', channel: 'platform', marketplace: 'platform', source: 'platform',
  name: 'customerName', customer: 'customerName', 'customer name': 'customerName', buyer: 'customerName',
  'buyer name': 'customerName', 'sold to': 'customerName', recipient: 'customerName',
  phone: 'customerPhone', tel: 'customerPhone', telephone: 'customerPhone', mobile: 'customerPhone', cell: 'customerPhone',
  email: 'customerEmail', 'e-mail': 'customerEmail',
  'ship to': 'shipToBlock', 'shipping address': 'shipToBlock', 'ship-to': 'shipToBlock', address: 'shipToBlock',
  'deliver to': 'shipToBlock',
  'ship by': 'shipBy', 'ship-by': 'shipBy', 'ship date': 'shipBy', 'due': 'shipBy', 'needed by': 'shipBy',
  tracking: 'trackingNumber', 'tracking #': 'trackingNumber', 'tracking number': 'trackingNumber', 'tracking no': 'trackingNumber',
  note: 'note', notes: 'note', 'buyer note': 'note', comment: 'note', message: 'note',
  item: 'title', product: 'title', title: 'title', 'item title': 'title', description: 'title', 'item name': 'title',
  sku: 'sku', 'custom label': 'sku',
  'item #': 'itemNumber', 'item number': 'itemNumber', 'item no': 'itemNumber', 'item id': 'itemNumber',
  listing: 'itemNumber', 'listing id': 'itemNumber', asin: 'itemNumber',
  qty: 'quantity', quantity: 'quantity',
  price: 'unitPrice', 'unit price': 'unitPrice', 'price each': 'unitPrice', 'item price': 'unitPrice',
  condition: 'condition',
};

function fromCsv(headers: string[], rows: Record<string, string>[]): CapturedOrder {
  const mapping = autoMapCsvOrderHeaders(headers) as Partial<Record<string, string>>;
  const cell = (row: Record<string, string>, key: string) => (mapping[key] ? String(row[mapping[key]!] ?? '').trim() : '');
  const order = emptyCapturedOrder();
  const first = rows[0] ?? {};
  order.orderNumber = cell(first, 'order_number');
  order.platform = cell(first, 'platform');
  order.customerName = cell(first, 'customer_name');
  order.shipBy = cell(first, 'ship_by_date');
  order.trackingNumber = cell(first, 'tracking_number');
  for (const row of rows) {
    if (order.orderNumber && cell(row, 'order_number') && cell(row, 'order_number') !== order.orderNumber) continue;
    const quantity = Number(cell(row, 'quantity'));
    const line: CapturedOrderLine = {
      title: cell(row, 'item_title'),
      sku: cell(row, 'sku'),
      itemNumber: cell(row, 'item_number'),
      quantity: Number.isInteger(quantity) && quantity > 0 ? quantity : null,
      unitPrice: null,
      condition: cell(row, 'condition'),
    };
    if (line.title || line.sku || line.itemNumber) order.lines.push(line);
  }
  return order;
}

/** Street / unit / city-state-zip lines of an address block, in any order. */
function readAddressBlock(lines: readonly string[], order: CapturedOrder): number {
  let used = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) break;
    const csz = line.match(CITY_STATE_ZIP_RE);
    if (csz) {
      order.shipTo.city = csz[1]!.replace(/,$/, '').trim();
      order.shipTo.state = csz[2]!.toUpperCase();
      order.shipTo.postalCode = csz[3]!;
      order.shipTo.country = 'US';
      used += 1;
      break;
    }
    if (STREET_RE.test(line) && !order.shipTo.address1) order.shipTo.address1 = line;
    else if (UNIT_RE.test(line) && order.shipTo.address1 && !order.shipTo.address2) order.shipTo.address2 = line;
    else if (!order.customerName && !/\d/.test(line)) order.customerName = line;
    else if (labelled(line)) break;
    used += 1;
    if (used > 5) break;
  }
  return used;
}

/** Parse a pasted order. Returns `null` when nothing order-like was found. */
export function parseOrderText(text: string): CapturedOrder | null {
  const source = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (!source) return null;

  const classified = classifyPastedText(source);
  if (classified.kind === 'csv') {
    const order = fromCsv(classified.headers, classified.rows);
    return order.lines.length > 0 || order.orderNumber ? order : null;
  }

  const order = emptyCapturedOrder();
  const lines = source.split('\n').map((l) => l.trim());
  let pending: CapturedOrderLine | null = null;
  const flush = () => {
    if (pending && (pending.title || pending.sku || pending.itemNumber)) order.lines.push(pending);
    pending = null;
  };
  const current = () => (pending ??= { title: '', sku: '', itemNumber: '', quantity: null, unitPrice: null, condition: '' });

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line) continue;

    const qtyFirst = line.match(QTY_FIRST_RE);
    const qtyLast = qtyFirst ? null : line.match(QTY_LAST_RE);
    if (qtyFirst || qtyLast) {
      flush();
      const [title, qty, price] = qtyFirst
        ? [qtyFirst[2]!, qtyFirst[1]!, qtyFirst[3]]
        : [qtyLast![1]!, qtyLast![2] ?? qtyLast![3]!, qtyLast![4]];
      order.lines.push({ title: title.trim(), sku: '', itemNumber: '', quantity: Number(qty), unitPrice: money(price), condition: '' });
      continue;
    }

    const pair = labelled(line);
    const field = pair ? LABEL_FIELD[pair[0]] : undefined;
    if (pair && field) {
      const value = pair[1];
      if (field === 'shipToBlock') {
        const block = value ? [value, ...lines.slice(i + 1)] : lines.slice(i + 1);
        i += readAddressBlock(block, order) - (value ? 1 : 0);
        continue;
      }
      if (field === 'title') {
        flush();
        current().title = value;
      } else if (field === 'sku') current().sku = value;
      else if (field === 'itemNumber') current().itemNumber = value;
      else if (field === 'quantity') current().quantity = Number.parseInt(value, 10) || null;
      else if (field === 'unitPrice') current().unitPrice = money(value.match(new RegExp(MONEY))?.[1]);
      else if (field === 'condition') current().condition = value;
      else if (field === 'customerPhone') order.customerPhone = value.match(PHONE_RE)?.[0] ?? value;
      else if (field === 'customerEmail') order.customerEmail = value.match(EMAIL_RE)?.[0] ?? value;
      else if (field === 'orderNumber') order.orderNumber = value.replace(/^#\s*/, '').split(/\s/)[0] ?? '';
      else if (field === 'platform' || field === 'customerName' || field === 'shipBy' || field === 'trackingNumber' || field === 'note') {
        order[field] = value;
      }
      continue;
    }

    // Unlabelled facts: an email, a phone, a tracking number, an address.
    if (!order.customerEmail && EMAIL_RE.test(line) && line.match(EMAIL_RE)![0] === line) {
      order.customerEmail = line;
      continue;
    }
    if (!order.customerPhone && PHONE_RE.test(line) && line.replace(PHONE_RE, '').trim().length === 0) {
      order.customerPhone = line.match(PHONE_RE)![0];
      continue;
    }
    if (!order.trackingNumber && !/\s/.test(line) && detectCarrierFromTracking(line)) {
      order.trackingNumber = line;
      continue;
    }
    if (STREET_RE.test(line) && lines.slice(i, i + 4).some((l) => CITY_STATE_ZIP_RE.test(l)) && !order.shipTo.address1) {
      i += readAddressBlock(lines.slice(i), order) - 1;
      continue;
    }
    if (!order.orderNumber) {
      const m = line.match(/\border\s*(?:#|no\.?|number|id)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{3,})/i);
      if (m && /\d/.test(m[1]!)) {
        order.orderNumber = m[1]!;
        continue;
      }
    }
    const shipBy = line.match(/\bship\s*(?:by|before)\s+(.+)$/i);
    if (shipBy && !order.shipBy) {
      order.shipBy = shipBy[1]!.trim();
      continue;
    }
  }
  flush();

  const found =
    order.lines.length > 0 || order.orderNumber || order.customerName || order.customerPhone || order.shipTo.address1;
  return found ? order : null;
}
