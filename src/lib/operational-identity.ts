/**
 * Operational identity — the ONE typed handle a record answers to on the floor
 * (owner 2026-10-04: the first acknowledged base). A list's Compact row and its
 * Full card paint the same object, so a record never reads as one number in
 * one density and another in the other.
 *
 * - `value` is the complete stored id: copy, search, tooltip and the
 *   accessible label carry it whole.
 * - `display` is decided HERE and nowhere else — the delimiter-aware compact
 *   formatter ({@link formatOrderIdDisplay}): `113-6729910-1909809` →
 *   `1909809` (an Amazon id reads its seven digits once the dash before them
 *   is dropped), `14-15232-19863` → `19863`. Adapters hand over raw fields,
 *   never a face.
 * - The resting face carries no kind word (`PO`, `Order`, `#`): the kind is
 *   `kind`, spoken by `ariaLabel`.
 * - `platform` is the sales channel only. Buyer, vendor, linked account and
 *   source type are the record's own fields, never folded in here.
 * - `fallback` is the record's next handle (inbound: the PO behind a
 *   marketplace order) — detail and search only, never the resting face.
 */

import { formatOrderIdDisplay, normalizeCopyText, QUIET_CHIP_EMPTY } from '@/lib/copy-chip-format';
import { inferMarketplaceFromOrderId } from '@/lib/marketplace-order-id';
import type { PlatformDisplay } from '@/lib/platform-display';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { sourcePlatformMeta } from '@/lib/source-platform';

/**
 * - `order`: a sales channel's order number (Amazon, eBay, a storefront, a
 *   manual source's own number).
 * - `purchase-order`: our purchase order, when no external order id exists.
 * - `receiving-line`: no number at all — the line's own handle; not copyable.
 */
export type OperationalIdentityKind = 'order' | 'purchase-order' | 'receiving-line';

/** The sales channel a record came through — `source-platform.ts` `SOURCE_PLATFORMS`. */
export interface OperationalPlatform {
  /** Stored slug: `ebay`, `amazon`, … */
  readonly slug: string;
  /** Display name: `eBay`. */
  readonly label: string;
}

export interface OperationalIdentity {
  readonly kind: OperationalIdentityKind;
  /** The complete stored value — what copy, search, tooltip and aria carry. */
  readonly value: string;
  /** The canonical compact face every density paints. */
  readonly display: string;
  /** The complete value with its kind and platform said aloud: `eBay order 14-15232-19863`. */
  readonly ariaLabel: string;
  readonly platform: OperationalPlatform | null;
  /** The record's next handle (inbound: the PO behind a marketplace order). Never on the resting face. */
  readonly fallback: OperationalIdentity | null;
}

const KIND_NOUN: Readonly<Record<OperationalIdentityKind, string>> = {
  order: 'order',
  'purchase-order': 'purchase order',
  'receiving-line': 'receiving line',
};

function operationalIdentity(
  kind: OperationalIdentityKind,
  rawValue: string | null | undefined,
  platform: OperationalPlatform | null,
  fallback: OperationalIdentity | null,
): OperationalIdentity {
  const value = normalizeCopyText(rawValue);
  const noun = KIND_NOUN[kind];
  // A platform keeps its own casing (`eBay order`); a bare noun opens the sentence (`Purchase order`).
  const spoken = kind === 'order' && platform ? `${platform.label} ${noun}` : `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
  return {
    kind,
    value,
    display: kind === 'receiving-line' ? `Line ${value}` : formatOrderIdDisplay(value) || QUIET_CHIP_EMPTY,
    ariaLabel: value ? `${spoken} ${value}` : `No ${noun} number`,
    platform,
    fallback,
  };
}

/** True when the identity is a number the floor can copy and paste back. */
export function isCopyableIdentity(identity: OperationalIdentity): boolean {
  return identity.kind !== 'receiving-line' && identity.value !== '';
}

/** A stored platform slug as a structured platform; null when the slug names none. */
export function operationalPlatform(slug: string | null | undefined): OperationalPlatform | null {
  const meta = sourcePlatformMeta(slug);
  return meta.value ? { slug: meta.value, label: meta.label } : null;
}

/** Outbound: the marketplace order number, on the catalog-resolved channel (`useOrderChannel`). */
export function outboundOrderIdentity(orderId: string, channel: Pick<PlatformDisplay, 'label' | 'meta'>): OperationalIdentity {
  const platform = channel.meta.value ? { slug: channel.meta.value, label: channel.label } : null;
  return operationalIdentity('order', orderId, platform, null);
}

/** Inbound import: an order number as an uploaded file carries it, on the platform the import stamps. */
export function importedOrderIdentity(orderNumber: string, platformSlug: string | null | undefined): OperationalIdentity {
  return operationalIdentity('order', orderNumber, operationalPlatform(platformSlug), null);
}

/** Inbound sources whose type names the marketplace the purchase was made on (`zoho` / `manual` name none). */
const MARKETPLACE_SOURCE_TYPES: Readonly<Record<string, true>> = { ebay: true, amazon: true };

export type InboundIdentityRow = Pick<
  ReceivingLineRow,
  'id' | 'zoho_purchaseorder_number' | 'zoho_purchaseorder_id' | 'source_order_id' | 'inbound_source_type' | 'source_platform' | 'source_platform_pill'
>;

/**
 * Inbound: the marketplace / source order number first; the PO only when no
 * external order id exists (then it is the identity, with no `PO` word on the
 * face), else the line itself.
 *
 * - A Zoho line's `source_order_id` is the PO's own Zoho id — internal, never
 *   an external order.
 * - A PO filed under its marketplace order number (an eBay 2-5-5 / Amazon
 *   3-7-7 shape) IS that order: the number names the platform.
 * - Platform evidence, strongest first: the number's shape, the operator's
 *   pill, the stored platform, a marketplace source type.
 */
export function inboundOrderIdentity(row: InboundIdentityRow): OperationalIdentity {
  const text = (value: string | null | undefined) => String(value ?? '').trim();
  const poNumber = text(row.zoho_purchaseorder_number);
  const poId = text(row.zoho_purchaseorder_id);
  const sourceType = text(row.inbound_source_type).toLowerCase();
  const sourceOrder = text(row.source_order_id);
  const externalOrder = sourceType !== 'zoho' && sourceOrder !== poId ? sourceOrder : '';
  const orderValue = externalOrder || (inferMarketplaceFromOrderId(poNumber) ? poNumber : '');
  const poValue = poNumber || poId;
  const platform =
    operationalPlatform(inferMarketplaceFromOrderId(orderValue)) ??
    operationalPlatform(row.source_platform_pill) ??
    operationalPlatform(row.source_platform) ??
    (MARKETPLACE_SOURCE_TYPES[sourceType] ? operationalPlatform(sourceType) : null);

  if (orderValue) {
    const po = poValue && poValue !== orderValue ? operationalIdentity('purchase-order', poValue, null, null) : null;
    return operationalIdentity('order', orderValue, platform, po);
  }
  if (poValue) return operationalIdentity('purchase-order', poValue, platform, null);
  return operationalIdentity('receiving-line', String(row.id), platform, null);
}
