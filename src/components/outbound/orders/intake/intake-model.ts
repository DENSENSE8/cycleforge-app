/**
 * The intake form's state — one order, N product lines, customer, shipping —
 * and every projection it needs: in from a chat prefill (`ManualOrderDraft`),
 * a staged CSV row (`CanonicalOrderIntake`) or a paste (`CapturedOrder`); out
 * to the `/api/orders/add` body and back to the CSV row. Pure, client-safe.
 */

import { CONDITION_GRADES, resolveConditionGrade, type ConditionGrade } from '@/lib/conditions';
import type { CanonicalOrderIntake, IntakeImportOrigin } from '@/lib/orders/canonical-order-intake';
import type { CapturedOrder } from '@/lib/orders/import/order-text-parse';
import {
  PHONE_ORDER_CHANNEL,
  manualOrderTotals,
  type ManualOrderAddress,
  type ManualOrderDraft,
  type ManualOrderTotals,
} from '@/lib/orders/manual-order-draft';
import { inferMarketplaceFromOrderId } from '@/lib/marketplace-order-id';

export interface IntakeLine {
  /** Client key — stable across edits, never sent. */
  key: string;
  skuCatalogId: number | null;
  sku: string;
  /** Identity title (`resolveSkuIdentityTitle`) once paired; the pasted words before. */
  title: string;
  itemNumber: string;
  imageUrl: string | null;
  onHand: number | null;
  bin: string | null;
  quantity: number;
  condition: ConditionGrade | null;
  /** Price EACH as typed, dollars. */
  unitPrice: string;
}

export type IntakeShippingMode = 'buy' | 'elsewhere';

export interface IntakeState {
  origin: IntakeImportOrigin;
  customer: { id: number | null; name: string; phone: string; email: string; shipTo: ManualOrderAddress };
  lines: IntakeLine[];
  orderNumber: string;
  /** The number came from the channel prefix, not the keyboard — a taken one is re-generated. */
  orderNumberGenerated: boolean;
  /** `orders.account_source`. */
  channel: string;
  shipBy: string | null;
  isUrgent: boolean;
  buyerNote: string;
  adminUrl: string;
  currency: string;
  parcel: { weightOz: string; lengthIn: string; widthIn: string; heightIn: string };
  shippingMode: IntakeShippingMode;
  trackingNumber: string;
  docsNotRequired: boolean;
}

let lineSeq = 0;
export function newIntakeLine(fill: Partial<Omit<IntakeLine, 'key'>> = {}): IntakeLine {
  lineSeq += 1;
  return {
    key: `line-${Date.now().toString(36)}-${lineSeq}`,
    skuCatalogId: null,
    sku: '',
    title: '',
    itemNumber: '',
    imageUrl: null,
    onHand: null,
    bin: null,
    quantity: 1,
    condition: null,
    unitPrice: '',
    ...fill,
  };
}

const emptyAddress = (): ManualOrderAddress => ({
  address1: '',
  address2: '',
  city: '',
  state: '',
  postalCode: '',
  country: 'US',
});

const numText = (v: number | null | undefined) => (v == null ? '' : String(v));

export function emptyIntake(origin: IntakeImportOrigin = 'manual'): IntakeState {
  return {
    origin,
    customer: { id: null, name: '', phone: '', email: '', shipTo: emptyAddress() },
    lines: [],
    orderNumber: '',
    orderNumberGenerated: false,
    channel: origin === 'manual' ? PHONE_ORDER_CHANNEL : '',
    shipBy: null,
    isUrgent: false,
    buyerNote: '',
    adminUrl: '',
    currency: 'USD',
    parcel: { weightOz: '', lengthIn: '', widthIn: '', heightIn: '' },
    shippingMode: 'elsewhere',
    trackingNumber: '',
    docsNotRequired: false,
  };
}

function toGrade(raw: string | null | undefined): ConditionGrade | null {
  const grade = resolveConditionGrade(raw ?? '');
  return (CONDITION_GRADES as readonly string[]).includes(grade) ? (grade as ConditionGrade) : null;
}

/** A chat-drafted order (`?prefill=`) — every field it carries, for any channel. */
export function intakeFromManualDraft(draft: ManualOrderDraft): IntakeState {
  const base = emptyIntake('manual');
  return {
    ...base,
    customer: { ...draft.customer, shipTo: { ...draft.customer.shipTo } },
    lines: draft.lines.map((l) =>
      newIntakeLine({
        skuCatalogId: l.skuCatalogId,
        sku: l.sku,
        title: l.title,
        itemNumber: l.itemNumber,
        quantity: l.quantity,
        condition: l.condition,
        unitPrice: l.unitPriceCents == null ? '' : (l.unitPriceCents / 100).toFixed(2),
      }),
    ),
    orderNumber: draft.orderNumber,
    orderNumberGenerated: draft.orderNumberGenerated,
    channel: draft.channel || PHONE_ORDER_CHANNEL,
    shipBy: draft.shipBy,
    isUrgent: draft.isUrgent,
    buyerNote: draft.buyerNote,
    currency: draft.currency,
    parcel: {
      weightOz: numText(draft.parcel?.weightOz),
      lengthIn: numText(draft.parcel?.lengthIn),
      widthIn: numText(draft.parcel?.widthIn),
      heightIn: numText(draft.parcel?.heightIn),
    },
    shippingMode: draft.buyLabel && !draft.trackingNumber ? 'buy' : 'elsewhere',
    trackingNumber: draft.trackingNumber,
  };
}

/** A staged CSV row (or any canonical prefill) — one line. */
export function intakeFromCanonical(c: Partial<CanonicalOrderIntake>): IntakeState {
  if (c.phoneOrder) return intakeFromManualDraft(c.phoneOrder);
  const origin = c.importOrigin ?? 'manual';
  const base = emptyIntake(origin);
  const hasProduct = Boolean(c.productTitle?.trim() || c.sku?.trim() || c.itemNumber?.trim());
  const tracking = c.trackingNumbers?.[0]?.trim() ?? '';
  return {
    ...base,
    lines: hasProduct
      ? [
          newIntakeLine({
            sku: c.sku?.trim() ?? '',
            title: c.productTitle?.trim() ?? '',
            itemNumber: c.itemNumber?.trim() ?? '',
            quantity: Math.max(1, Number.parseInt(c.quantity ?? '1', 10) || 1),
            condition: toGrade(c.condition),
          }),
        ]
      : [],
    orderNumber: c.orderNumber?.trim() ?? '',
    channel: c.platformInferred ?? (c.platformChosen?.trim() || base.channel),
    parcel: {
      weightOz: numText(c.weightOz),
      lengthIn: numText(c.dimL),
      widthIn: numText(c.dimW),
      heightIn: numText(c.dimH),
    },
    shippingMode: c.labelMode === 'buy' && !tracking ? 'buy' : 'elsewhere',
    trackingNumber: tracking,
    docsNotRequired: c.docsNotRequired ?? false,
  };
}

/** The inverse, for the CSV staging rail: line 1 onto the staged row. */
export function intakeToCanonical(s: IntakeState): CanonicalOrderIntake {
  const first = s.lines[0];
  const positive = (raw: string) => {
    const n = Number(raw);
    return raw.trim() && Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    orderNumber: s.orderNumber,
    platformInferred: inferMarketplaceFromOrderId(s.orderNumber),
    platformChosen: s.channel,
    importOrigin: s.origin,
    fulfillmentChannel: s.shippingMode === 'buy' ? 'shipstation' : 'link_only',
    itemNumber: first?.itemNumber ?? '',
    sku: first?.sku ?? '',
    quantity: String(first?.quantity ?? 1),
    productTitle: first?.title ?? '',
    condition: first?.condition ?? '',
    trackingNumbers: s.trackingNumber.trim() ? [s.trackingNumber.trim()] : [],
    docsNotRequired: s.docsNotRequired,
    weightOz: positive(s.parcel.weightOz),
    dimL: positive(s.parcel.lengthIn),
    dimW: positive(s.parcel.widthIn),
    dimH: positive(s.parcel.heightIn),
    dimUnit: 'inch',
    labelMode: s.shippingMode === 'buy' ? 'buy' : 'link',
    assignedTechId: null,
    assignedPackerId: null,
  };
}

/** A paste read — fills what was read, keeps what the operator already typed. */
export function intakeWithCaptured(s: IntakeState, captured: CapturedOrder): IntakeState {
  const keep = (mine: string, theirs: string) => (mine.trim() ? mine : theirs.trim());
  const shipTo = { ...s.customer.shipTo };
  for (const key of Object.keys(shipTo) as Array<keyof ManualOrderAddress>) {
    const read = captured.shipTo[key]?.trim();
    if (read && (!shipTo[key].trim() || (key === 'country' && shipTo[key] === 'US'))) shipTo[key] = read;
  }
  const pasted = captured.lines.map((l) =>
    newIntakeLine({
      sku: l.sku,
      title: l.title || l.sku || l.itemNumber,
      itemNumber: l.itemNumber,
      quantity: l.quantity ?? 1,
      condition: toGrade(l.condition),
      unitPrice: l.unitPrice == null ? '' : l.unitPrice.toFixed(2),
    }),
  );
  const tracking = captured.trackingNumber.trim();
  return {
    ...s,
    customer: {
      ...s.customer,
      name: keep(s.customer.name, captured.customerName),
      phone: keep(s.customer.phone, captured.customerPhone),
      email: keep(s.customer.email, captured.customerEmail),
      shipTo,
    },
    lines: [...s.lines.filter((l) => l.title.trim() || l.skuCatalogId != null), ...pasted],
    orderNumber: captured.orderNumber.trim() ? captured.orderNumber.trim() : s.orderNumber,
    orderNumberGenerated: captured.orderNumber.trim() ? false : s.orderNumberGenerated,
    buyerNote: keep(s.buyerNote, captured.note),
    trackingNumber: keep(s.trackingNumber, tracking),
    shippingMode: tracking ? 'elsewhere' : s.shippingMode,
  };
}

/** Dollars as typed → cents; `null` for blank or junk. */
export function priceCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function intakeTotals(s: IntakeState): ManualOrderTotals {
  return manualOrderTotals(
    s.lines.map((l) => ({
      skuCatalogId: l.skuCatalogId,
      sku: l.sku,
      title: l.title,
      quantity: l.quantity,
      condition: l.condition,
      unitPriceCents: priceCents(l.unitPrice),
    })),
  );
}

/** The `/api/orders/add` body: one order number, every line, the customer, the ship-by, the tracking. */
export function intakeCreateBody(s: IntakeState) {
  const c = s.customer;
  const customer =
    c.id != null
      ? { id: c.id, shipTo: c.shipTo }
      : c.name.trim()
        ? { name: c.name.trim(), phone: c.phone.trim(), email: c.email.trim(), shipTo: c.shipTo }
        : undefined;
  const tracking = s.shippingMode === 'elsewhere' ? s.trackingNumber.trim() : '';
  return {
    orderId: s.orderNumber.trim(),
    accountSource: s.channel.trim(),
    currency: s.currency,
    isUrgent: s.isUrgent,
    buyerNote: s.buyerNote.trim() || null,
    shipBy: s.shipBy,
    shippingTrackingNumbers: tracking ? [tracking] : [],
    lines: s.lines.map((l) => {
      const cents = priceCents(l.unitPrice);
      return {
        productTitle: l.title.trim(),
        sku: l.sku.trim() || null,
        skuCatalogId: l.skuCatalogId,
        quantity: String(l.quantity),
        condition: l.condition,
        // `sale_amount` is the LINE total, like every other order row.
        saleAmount: cents == null ? null : (cents * l.quantity) / 100,
      };
    }),
    ...(customer ? { customer } : {}),
  };
}

export type IntakeIntent = 'draft' | 'release';

/** What still blocks this save — plain sentences, in form order. */
export function intakeBlockers(s: IntakeState, intent: IntakeIntent): string[] {
  const out: string[] = [];
  const manual = s.origin === 'manual';
  const c = s.customer;
  if (manual && c.id == null && !c.name.trim()) out.push('Add the customer');
  if (s.lines.length === 0) out.push('Add a product');
  s.lines.forEach((l, i) => {
    if (!l.title.trim()) out.push(`Line ${i + 1} needs a product`);
  });
  if (!s.orderNumber.trim()) out.push('Order number missing');
  if (!s.channel.trim()) out.push('Pick the channel');
  if (intent === 'release') {
    s.lines.forEach((l, i) => {
      if (l.skuCatalogId == null && !l.itemNumber.trim()) out.push(`Line ${i + 1} is not a catalog product`);
    });
    if (s.shippingMode === 'elsewhere' && !s.trackingNumber.trim()) out.push('Tracking number missing');
    if (s.shippingMode === 'buy') out.push('Save first, then buy the label');
  }
  return out;
}

export function addressLine(a: ManualOrderAddress): string {
  const cityLine = [a.city, [a.state, a.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [a.address1, a.address2, cityLine].filter((p) => p.trim()).join(', ');
}

export const shipToComplete = (a: ManualOrderAddress) =>
  Boolean(a.address1.trim() && a.city.trim() && a.state.trim() && a.postalCode.trim());

/** Has the operator changed anything since the entry opened (line keys aside)? */
export function isDirty(s: IntakeState, initial: IntakeState): boolean {
  // A generated order number is the form's own doing, not the operator's.
  const facts = (x: IntakeState) =>
    JSON.stringify({
      ...x,
      orderNumber: x.orderNumberGenerated ? '' : x.orderNumber,
      orderNumberGenerated: false,
      lines: x.lines.map(({ key: _k, ...rest }) => rest),
    });
  return facts(s) !== facts(initial);
}
