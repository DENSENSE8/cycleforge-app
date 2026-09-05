/**
 * Floor-language briefing for Unbox Ask. The model should sound like Grok /
 * ChatGPT standing at the carton: product names, how many, condition, what
 * still needs doing. Internal receiving/line ids never belong in the brief.
 */

export const CARTON_ASK_SYSTEM = [
  'You are the Unbox helper standing at this carton with the operator.',
  'Describe what is in the box the way a person would: product name, model/color if known, quantity, condition, whether it still needs testing or a claim.',
  'Never cite internal ids (receiving numbers, line ids, staff ids, database keys). Tracking and product names are fine. SKU only as a secondary identifier after the product name.',
  'If they ask what this is / tell me about this order, give a short spoken briefing of the products and the carton situation, then what they can do next if it is obvious.',
  'Do not invent products. If a title is missing, say the SKU as the name. If the carton is unmatched, say it has not been paired to a purchase order yet.',
].join(' ');

/** True when the utterance is about the open carton / box, not the workspace. */
export function isCartonAskQuestion(message: string): boolean {
  const text = message.trim().toLowerCase();
  return (
    /\b(this carton|the carton|this box|the box|this receiving|in the box|in this box)\b/.test(text) ||
    /\b(what(?:'|’)s in|whats in|what is in)\b/.test(text) ||
    /\b(tell me about (this|the) (order|carton|box)|what is this|what(?:'|’)s this)\b/.test(text) ||
    /\b(these products|this inbound|unmatched|pairing|photos (on|for) this)\b/.test(text)
  );
}

export interface CartonAskProduct {
  title: string;
  sku?: string | null;
  qtyExpected?: number | null;
  qtyReceived?: number | null;
  condition?: string | null;
  needsTest?: boolean | null;
  workflow?: string | null;
  marketplaceOrder?: string | null;
  category?: string | null;
  notes?: string | null;
}

export interface CartonAskBrief {
  tracking?: string | null;
  carrier?: string | null;
  pairing?: string | null;
  intake?: string | null;
  isReturn?: boolean;
  platform?: string | null;
  poNumber?: string | null;
  photoCount?: number | null;
  products: CartonAskProduct[];
}

function humanPairing(raw: string | null | undefined): string | null {
  const v = String(raw || '').trim().toUpperCase();
  if (v === 'UNFOUND') return 'not matched to a purchase order yet';
  if (v === 'MATCHED') return 'matched to a purchase order';
  if (v === 'WAIVED') return 'pairing waived';
  return raw ? raw.trim() : null;
}

function humanIntake(raw: string | null | undefined): string | null {
  const v = String(raw || '').trim().toUpperCase();
  if (!v) return null;
  if (v === 'PO') return 'purchase-order inbound';
  if (v === 'REPAIR') return 'repair inbound';
  if (v === 'RETURN') return 'customer return';
  if (v === 'TRADE_IN') return 'trade-in';
  if (v === 'PICKUP') return 'local pickup';
  return v.replaceAll('_', ' ').toLowerCase();
}

function humanCondition(raw: string | null | undefined): string | null {
  const v = String(raw || '').trim();
  if (!v) return null;
  return v.replaceAll('_', ' ').toLowerCase();
}

function qtyPhrase(p: CartonAskProduct): string {
  const expected = p.qtyExpected ?? null;
  const received = p.qtyReceived ?? null;
  if (expected != null && received != null) {
    if (received === 0) return `expecting ${expected}`;
    if (received === expected) return `${received} of ${expected} in`;
    return `${received} of ${expected} received`;
  }
  if (expected != null) return `qty ${expected}`;
  if (received != null) return `${received} received`;
  return '';
}

export function productDisplayName(p: CartonAskProduct): string {
  const title = p.title.trim();
  if (title) return title;
  const sku = String(p.sku || '').trim();
  return sku || 'an unlabeled item';
}

/** Operator-facing brief. Must not contain "Receiving #" or "line <id>". */
export function formatReceivingCartonBrief(brief: CartonAskBrief): string {
  const products = brief.products.length
    ? brief.products.map((p) => {
        const name = productDisplayName(p);
        const bits = [name];
        const sku = String(p.sku || '').trim();
        if (sku && sku.toLowerCase() !== name.toLowerCase()) bits.push(`(SKU ${sku})`);
        const qty = qtyPhrase(p);
        if (qty) bits.push(`— ${qty}`);
        const cond = humanCondition(p.condition);
        if (cond) bits.push(`condition ${cond}`);
        if (p.needsTest === true) bits.push('still needs test');
        if (p.needsTest === false) bits.push('test not required');
        const cat = String(p.category || '').trim();
        if (cat) bits.push(`category ${cat}`);
        const notes = String(p.notes || '').trim();
        if (notes) bits.push(`note: ${notes}`);
        const mkt = String(p.marketplaceOrder || '').trim();
        if (mkt) bits.push(`marketplace order ${mkt}`);
        return `- ${bits.join(' ')}`;
      })
    : ['- no products listed on this carton yet'];

  const situation: string[] = [];
  const tracking = String(brief.tracking || '').trim();
  if (tracking) situation.push(`Tracking ${tracking}${brief.carrier ? ` via ${brief.carrier}` : ''}`);
  const pairing = humanPairing(brief.pairing);
  if (pairing) situation.push(pairing);
  const intake = humanIntake(brief.intake);
  if (intake) situation.push(intake);
  if (brief.isReturn) situation.push('marked as a return');
  const po = String(brief.poNumber || '').trim();
  if (po) situation.push(`PO ${po}`);
  const platform = String(brief.platform || '').trim();
  if (platform) situation.push(`from ${platform}`);
  if (typeof brief.photoCount === 'number') {
    situation.push(brief.photoCount === 1 ? '1 photo on the carton' : `${brief.photoCount} photos on the carton`);
  }

  return [
    'The operator is looking at this inbound carton. Speak about the PRODUCTS, not internal ids.',
    '',
    'Products in the box:',
    ...products,
    '',
    'Carton situation:',
    situation.length ? situation.map((s) => `- ${s}`).join('\n') : '- no extra carton facts',
    '',
    CARTON_ASK_SYSTEM,
  ].join('\n');
}
