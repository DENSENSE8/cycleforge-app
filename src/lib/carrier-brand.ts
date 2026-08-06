/**
 * Carrier brand visual SoT — DisplayCarrier → mark chrome (brand hex + label).
 *
 * Marketplace channels live in {@link source-platform.ts} / PlatformMark.
 * Carriers (UPS · FedEx · USPS · …) are a separate registry: detection stays in
 * {@link carrier-patterns.ts}; this module owns peripheral-vision brand paint.
 *
 * Native brand hex is intentional (operators ID carriers at a glance). Hex lives
 * ONLY here behind `ds-allow-hex` — never scatter in cells. Unknown keeps the
 * house blue MapPin via CHIP_TONES.tracking (no hex).
 */

import {
  detectCarrierFromTracking,
  toDisplayCarrier,
  type DisplayCarrier,
} from '@/utils/carrier-patterns';

export type { DisplayCarrier };

export interface CarrierBrandMeta {
  carrier: DisplayCarrier;
  label: string;
  /**
   * Official-ish primary brand hex for the leading MapPin. `null` = use house
   * blue MapPin from CHIP_TONES.tracking (Unknown / unresolved).
   */
  brandHex: string | null;
}

/**
 * Brand paint keyed by {@link DisplayCarrier}. Hex comments are the documented
 * escape for foreign brand colors (same pattern as OAuth provider chrome).
 */
export const CARRIER_BRANDS: Record<DisplayCarrier, CarrierBrandMeta> = {
  // ds-allow-hex: UPS Pullman Brown — primary brand mark.
  UPS: { carrier: 'UPS', label: 'UPS', brandHex: '#351C15' },
  // ds-allow-hex: FedEx Purple — primary; orange accent deferred to multi-stop marks.
  FedEx: { carrier: 'FedEx', label: 'FedEx', brandHex: '#4D148C' },
  // ds-allow-hex: USPS light postal blue — readable at MapPin size (darker
  // official #005EA2 reads near-navy on a 16px pin; keep distinct from house
  // CHIP_TONES.tracking blue-500).
  USPS: { carrier: 'USPS', label: 'USPS', brandHex: '#4A9FE5' },
  // ds-allow-hex: DHL yellow — high-chroma mark; ink stays dark via stroke.
  DHL: { carrier: 'DHL', label: 'DHL', brandHex: '#FFCC00' },
  // ds-allow-hex: Amazon logistics orange (carrier shipments, not marketplace tile).
  Amazon: { carrier: 'Amazon', label: 'Amazon', brandHex: '#FF9900' },
  // ds-allow-hex: OnTrac red.
  OnTrac: { carrier: 'OnTrac', label: 'OnTrac', brandHex: '#E31837' },
  // ds-allow-hex: LaserShip teal.
  LaserShip: { carrier: 'LaserShip', label: 'LaserShip', brandHex: '#00857C' },
  // ds-allow-hex: GLS US / GSO orange.
  GSO: { carrier: 'GSO', label: 'GSO', brandHex: '#F15A22' },
  Unknown: { carrier: 'Unknown', label: 'Unknown', brandHex: null },
};

function carrierBrandMeta(carrier: DisplayCarrier): CarrierBrandMeta {
  return CARRIER_BRANDS[carrier] ?? CARRIER_BRANDS.Unknown;
}

/**
 * Map a stored / label carrier string (STN `carrier_code`, inbound `row.carrier`)
 * onto {@link DisplayCarrier}. Returns null when the hint is empty / unrecognized
 * so callers can fall through to pattern detect.
 */
export function displayCarrierFromHint(hint: string | null | undefined): DisplayCarrier | null {
  const c = String(hint || '')
    .toUpperCase()
    .trim();
  if (!c) return null;
  if (c.includes('UPS')) return 'UPS';
  if (c.includes('FEDEX') || c.includes('FED EX')) return 'FedEx';
  if (c.includes('USPS') || c.includes('POSTAL')) return 'USPS';
  if (c.includes('DHL')) return 'DHL';
  if (c.includes('AMAZON')) return 'Amazon';
  if (c.includes('ONTRAC') || c.includes('ON TRAC')) return 'OnTrac';
  if (c.includes('LASERSHIP') || c.includes('LASER SHIP')) return 'LaserShip';
  if (c.includes('GSO') || (c.includes('GLS') && c.includes('US'))) return 'GSO';
  return null;
}

/**
 * Ladder: stored/label hint → pattern detect → Unknown.
 * Same resolve order as {@link resolveTrackingOpenUrl} for Open links.
 */
export function resolveDisplayCarrier(
  tracking: string,
  knownCarrier?: string | null,
): DisplayCarrier {
  const fromHint = displayCarrierFromHint(knownCarrier);
  if (fromHint) return fromHint;
  return toDisplayCarrier(detectCarrierFromTracking(tracking));
}

export function resolveCarrierBrand(
  tracking: string,
  knownCarrier?: string | null,
): CarrierBrandMeta {
  return carrierBrandMeta(resolveDisplayCarrier(tracking, knownCarrier));
}

/** True when the mark should use brand hex (not house blue MapPin). */
export function hasCarrierBrandPaint(meta: CarrierBrandMeta): boolean {
  return meta.brandHex != null && meta.carrier !== 'Unknown';
}

/**
 * Dense Sheets brand-identity micro-dot fill for tracking# when MapPin is
 * omitted. Known carriers → native {@link CarrierBrandMeta.brandHex}; Unknown
 * → house tracking blue (`bg-blue-500`, same family as CHIP_TONES.tracking.dot).
 * Not a lifecycle status dot (`GridStatusCellValue`).
 */
export function carrierBrandDotPaint(meta: CarrierBrandMeta): {
  className?: string;
  style?: { backgroundColor: string };
} {
  if (hasCarrierBrandPaint(meta) && meta.brandHex) {
    return { style: { backgroundColor: meta.brandHex } };
  }
  return { className: 'bg-blue-500' };
}

/**
 * Site-wide tracking copy-tooltip label: `FedEx 8751…` when the carrier is
 * known, otherwise the bare tracking string. Clipboard copy stays the raw
 * number — this is display-only for {@link useCopyChip} / SiteTooltipProvider.
 */
export function formatTrackingTooltipLabel(
  tracking: string,
  knownCarrier?: string | null,
): string {
  const trimmed = String(tracking || '').trim();
  if (!trimmed) return '';
  const brand = resolveCarrierBrand(trimmed, knownCarrier);
  if (!hasCarrierBrandPaint(brand)) return trimmed;
  return `${brand.label} ${trimmed}`;
}
