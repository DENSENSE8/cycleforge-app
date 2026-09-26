import { isFbaOrder } from './order-platform';

/** Canonical dot types shown before the product title in log tables. */
type SourceDotType = 'fba' | 'sku' | 'orders';

/** Determine which colored dot to display based on record metadata. */
export function getSourceDotType(params: {
  orderId?: string | null;
  accountSource?: string | null;
  trackingType?: string | null;
  scanRef?: string | null;
}): SourceDotType {
  const { orderId, accountSource, trackingType, scanRef } = params;

  if (isFbaOrder(orderId, accountSource)) return 'fba';

  const isSkuScan =
    (typeof trackingType === 'string' && trackingType.toUpperCase() === 'SKU') ||
    (typeof scanRef === 'string' && scanRef.includes(':'));

  if (isSkuScan) return 'sku';

  return 'orders';
}

/** True when {@link getSourceDotType} is `sku` (SKU scan path — hide internal order-id chip in row chrome). */
export function isSkuSourceRecord(params: Parameters<typeof getSourceDotType>[0]): boolean {
  return getSourceDotType(params) === 'sku';
}

/** Resolve a station row's source in ONE pass — the dot type and whether it's a SKU-scan row (which hides the internal order-id chip). */
export function resolveStationSource(
  params: Parameters<typeof getSourceDotType>[0],
): { dotType: SourceDotType; isSku: boolean } {
  const dotType = getSourceDotType(params);
  return { dotType, isSku: dotType === 'sku' };
}

/** Tailwind background class for each dot type. */
export const SOURCE_DOT_BG: Record<SourceDotType, string> = {
  fba: 'bg-purple-500',
  sku: 'bg-blue-500',
  orders: 'bg-emerald-500',
};

/** Tooltip label for each dot type. */
export const SOURCE_DOT_LABEL: Record<SourceDotType, string> = {
  fba: 'FBA',
  sku: 'SKU',
  orders: 'Orders',
};
