/**
 * The new-sales-order job as data — the step trail, how an order arrives, and
 * the line a storefront tile becomes. The desk (`/orders/new`) and the phone
 * (`/m/orders/new`) paint faces over this and `useSalesOrderCheckout`; neither
 * owns a second step machine.
 */

import { stockBadgeLabel } from '@/lib/kiosk/catalog-search-pure';
import type { KioskCatalogWireProduct } from '@/lib/kiosk/catalog-request';
import { shelfOfSku, type CatalogShelf } from '@/lib/orders/intake/catalog-shelf';
import type { IntakeLine } from '@/lib/orders/intake/intake-model';
import type { IntakeProductHit } from '@/lib/orders/intake-product-search';
import { conditionGradeTableLabel, EMPTY_META_DASH } from '@/lib/conditions';

export const CHECKOUT_STEPS = [
  { id: 'customer', title: 'Customer' },
  { id: 'products', title: 'Products' },
  { id: 'team', title: 'Team' },
  { id: 'order', title: 'Order' },
  { id: 'shipping', title: 'Shipping' },
  { id: 'payment', title: 'Payment' },
] as const;

export type CheckoutStepId = (typeof CHECKOUT_STEPS)[number]['id'];

/**
 * The crumb a key jumps to. Bare `1`…`6` — the trail's own numbers, the
 * views' grammar — only outside a text field (`anywhere: false`); from inside
 * one, `Alt+Shift+1…6` (`anywhere: true`, matched on `code`: ⌥⇧ digits type
 * symbols on macOS). Never Ctrl/Alt+digit alone: Chrome's tab keys and the
 * chat's recents own those. A repeat, or any other key, is not a crumb key.
 */
export function crumbFromKey(event: {
  key: string;
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}): { step: CheckoutStepId; anywhere: boolean } | null {
  if (event.ctrlKey || event.metaKey || event.repeat) return null;
  let index: number | null = null;
  let anywhere = false;
  if (!event.altKey && !event.shiftKey && /^[1-9]$/.test(event.key)) index = Number(event.key) - 1;
  else if (event.altKey && event.shiftKey && /^Digit[1-9]$/.test(event.code)) {
    index = Number(event.code.slice(-1)) - 1;
    anywhere = true;
  }
  const step = index == null ? undefined : CHECKOUT_STEPS[index]?.id;
  return step ? { step, anywhere } : null;
}

/** Test mode's order-number prefix — the repo's test-order convention (`CF-TEST-…`). */
export const TEST_ORDER_PREFIX = 'CF-TEST-';

/** A test order's number (`CF-TEST-…`, any case). */
export function isTestOrderNumber(orderNumber: string): boolean {
  return orderNumber.trim().toUpperCase().startsWith(TEST_ORDER_PREFIX);
}

/** The number a test-mode order saves under: `CF-TEST-<number>`, never prefixed twice. */
export function testOrderNumber(orderNumber: string): string {
  const n = orderNumber.trim();
  return isTestOrderNumber(n) ? n : `${TEST_ORDER_PREFIX}${n}`;
}

/** How the order arrives: typed on the call, or imported from a Square invoice / an Ecwid order. */
export type CheckoutMode = 'new' | 'square' | 'ecwid';

export const CHECKOUT_MODES: ReadonlyArray<{ value: CheckoutMode; label: string }> = [
  { value: 'new', label: 'New order' },
  { value: 'square', label: 'Square invoice' },
  { value: 'ecwid', label: 'Ecwid order' },
];

/** `?mode=` → mode. `import` is the Add palette's Square row (kept stable). */
export function checkoutModeFromParam(raw: string | null): CheckoutMode {
  if (raw === 'import' || raw === 'square') return 'square';
  if (raw === 'ecwid') return 'ecwid';
  return 'new';
}

/** A storefront listing tapped on the browse grid — becomes a line keyed by its listing id. */
export interface ListingLine {
  /** The storefront listing id (`platform_listings.external_ref_id`) — the line's item #. */
  listingId: string;
  title: string;
  sku: string;
  unitCents: number | null;
}

/** Units on the cart — by catalog product (identity hits), by listing id (shelf tiles), by shelf (the switch). */
export interface CartUnits {
  byCatalog: ReadonlyMap<number, number>;
  byListing: ReadonlyMap<string, number>;
  byShelf: Readonly<Record<CatalogShelf, number>>;
}

export function cartUnits(lines: readonly IntakeLine[]): CartUnits {
  const byCatalog = new Map<number, number>();
  const byListing = new Map<string, number>();
  const byShelf: Record<CatalogShelf, number> = { sales: 0, repair: 0 };
  for (const l of lines) {
    if (l.skuCatalogId != null) byCatalog.set(l.skuCatalogId, (byCatalog.get(l.skuCatalogId) ?? 0) + l.quantity);
    const id = l.itemNumber.trim();
    if (id) byListing.set(id, (byListing.get(id) ?? 0) + l.quantity);
    byShelf[shelfOfSku(l.sku)] += l.quantity;
  }
  return { byCatalog, byListing, byShelf };
}

/** A shelf listing's price in cents, or null when the storefront has none. */
export function listingUnitCents(product: Pick<KioskCatalogWireProduct, 'price'>): number | null {
  return product.price != null ? Math.round(product.price * 100) : null;
}

/** "12 in stock · Z1-A-03 +1" — the counter's two facts on one line. */
export function listingAvailability(product: Pick<KioskCatalogWireProduct, 'availability'>): string {
  const availability = product.availability;
  if (!availability) return '';
  const stock = stockBadgeLabel(availability);
  const bin = availability.bin ? `${availability.bin.label}${availability.binCount > 1 ? ` +${availability.binCount - 1}` : ''}` : null;
  return [stock, bin].filter(Boolean).join(' · ');
}

/** A shelf listing → the cart line it becomes. */
export function listingLineOf(product: Pick<KioskCatalogWireProduct, 'id' | 'name' | 'sku' | 'price'>): ListingLine {
  return { listingId: product.id, title: product.name, sku: product.sku, unitCents: listingUnitCents(product) };
}

/** "3 in stock · Z1-A-03" — an identity find hit's stock + bin on one line. */
export function hitAvailability(hit: Pick<IntakeProductHit, 'onHand' | 'bin'>): string {
  return [`${hit.onHand} in stock`, hit.bin].filter(Boolean).join(' · ');
}

/**
 * A cart line's identity facts, in the ONE order both faces paint them
 * (desk cart, phone cart, both Team steps): SKU · Item # · stock · bin.
 * The item # (the storefront listing id) is dropped when it repeats the SKU.
 */
export function cartLineFacts(line: Pick<IntakeLine, 'sku' | 'itemNumber' | 'onHand' | 'bin'>): string[] {
  const sku = line.sku.trim();
  const item = line.itemNumber.trim();
  const facts: string[] = [];
  if (sku) facts.push(`SKU ${sku}`);
  if (item && item !== sku) facts.push(`Item # ${item}`);
  if (line.onHand != null) facts.push(`${line.onHand} in stock`);
  if (line.bin?.trim()) facts.push(`Bin ${line.bin.trim()}`);
  return facts;
}

/** Team's read-only line facts: the condition grade first (what the picker pulls), then `cartLineFacts`. */
export function teamLineFacts(line: Pick<IntakeLine, 'sku' | 'itemNumber' | 'onHand' | 'bin' | 'condition'>): string[] {
  const grade = conditionGradeTableLabel(line.condition);
  const withGrade = grade !== EMPTY_META_DASH && shelfOfSku(line.sku) !== 'repair';
  return withGrade ? [grade, ...cartLineFacts(line)] : cartLineFacts(line);
}

/**
 * A line that can still be paired to a catalog product: not yet paired, and not
 * a repair service (work, not a unit). Listing lines added from a tile qualify
 * too — pairing is optional for them, required for pasted text lines.
 */
export function lineNeedsPairing(line: Pick<IntakeLine, 'skuCatalogId' | 'sku'>): boolean {
  return line.skuCatalogId == null && shelfOfSku(line.sku) !== 'repair';
}

/** The patch pairing a line to a catalog hit writes — the listing's item # is kept when the line has one. */
export function pairLineToHit(line: Pick<IntakeLine, 'itemNumber'>, hit: IntakeProductHit): Partial<IntakeLine> {
  return {
    skuCatalogId: hit.skuCatalogId,
    sku: hit.sku,
    title: hit.title,
    itemNumber: line.itemNumber || hit.itemNumber || '',
    imageUrl: hit.imageUrl,
    onHand: hit.onHand,
    bin: hit.bin,
  };
}
