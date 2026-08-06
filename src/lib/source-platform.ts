/**
 * Single source of truth for a receiving `source_platform` value → its display
 * name + chip tone. Before this module the same platform read three different
 * ways: the pill said "AliExp" while the printed label said "AliExpress", the
 * order-derived helper returned a lowercase "ebay", and "ECWID" vs "ECWID-RS"
 * drifted between surfaces. Everything that turns a platform value into a name
 * or a color now derives from {@link SOURCE_PLATFORMS} so a platform can never
 * present two ways again. Mirrors the condition-label SoT pattern.
 */

import { platformPaintFromHex } from '@/lib/color-contrast';
import { PLATFORM_BRAND_ICON_PATHS } from '@/lib/platform-brand-icons';

export interface SourcePlatformMeta {
  /** Stored `source_platform` value (lowercase, what the DB holds). */
  value: string;
  /** Canonical display name — the ONE label shown anywhere a platform appears. */
  label: string;
  /**
   * Fixed 1–2 char lettermark for icon-only listing chrome. Keeps the listing
   * chip constant-width across platforms (tooltip / aria still use `label`).
   * Fallback when {@link icon} is absent.
   */
  mark: string;
  /** Tailwind text tone for the chip's external-link icon / lettermark. */
  text: string;
  /** Tailwind border tone for the chip's underline accent. */
  border: string;
  /**
   * Tailwind fill for dense Sheets brand-identity micro-dots (order# column
   * when glyphs are omitted). Kept explicit so neutrals (`text-text-*`) do not
   * invent a broken `bg-text-*` class. Catalog {@link accentHex} still wins via
   * {@link platformMetaBrandDot}.
   */
  dot: string;
  /**
   * Optional org accent `#rrggbb` from `platforms.color_hex`. When set, marks
   * and soft chips paint via {@link platformPaintFromHex} instead of Tailwind
   * `text` / `border` classes.
   */
  accentHex?: string | null;
  /**
   * Monochrome brand-mark SVG path (24×24, `currentColor`) from
   * `src/lib/platform-brand-icons.ts`. Preferred mark in {@link PlatformMark};
   * tinted by {@link text}. Lettermark is the only fallback.
   */
  icon?: string;
  /**
   * Optional full-color brand tile under `/public` (e.g. Amazon smile square).
   * Used when {@link PlatformMark} sets `preferBrandTile` (carton listing +
   * {@link GridPlatformMarkValue} data sheets). Glyph-only callers omit it.
   */
  tileSrc?: string;
}

/**
 * Canonical platform registry, display order left → right. The pill options,
 * the printed label, the condensed-row listing chip, and any tone lookup read
 * from here. Add a platform once, in this list.
 */
export const SOURCE_PLATFORMS: SourcePlatformMeta[] = [
  { value: 'ebay',       label: 'eBay',       mark: 'eB', text: 'text-yellow-500', border: 'border-yellow-400', dot: 'bg-yellow-500', icon: PLATFORM_BRAND_ICON_PATHS.ebay },
  {
    value: 'amazon',
    label: 'Amazon',
    mark: 'az',
    text: 'text-orange-600',
    border: 'border-orange-600',
    dot: 'bg-orange-600',
    icon: PLATFORM_BRAND_ICON_PATHS.amazon,
    tileSrc: '/icons/platforms/amazon.png',
  },
  { value: 'fba',        label: 'FBA',        mark: 'FB', text: 'text-orange-600', border: 'border-orange-600', dot: 'bg-orange-600', icon: PLATFORM_BRAND_ICON_PATHS.fba },
  { value: 'aliexpress', label: 'AliExpress', mark: 'AE', text: 'text-red-500',    border: 'border-red-500',    dot: 'bg-red-500', icon: PLATFORM_BRAND_ICON_PATHS.aliexpress },
  { value: 'walmart',    label: 'Walmart',    mark: 'W',  text: 'text-amber-700',  border: 'border-amber-700',  dot: 'bg-amber-700', icon: PLATFORM_BRAND_ICON_PATHS.walmart },
  { value: 'goodwill',   label: 'Goodwill',   mark: 'Gw', text: 'text-sky-600',    border: 'border-sky-600',    dot: 'bg-sky-600', icon: PLATFORM_BRAND_ICON_PATHS.goodwill },
  // ECWID-RS (not plain ECWID): today this pill only appears when the carton
  // was paired with an Ecwid repair-service (-RS) order.
  { value: 'ecwid',      label: 'ECWID-RS',   mark: 'Ec', text: 'text-blue-600',   border: 'border-blue-600',   dot: 'bg-blue-600', icon: PLATFORM_BRAND_ICON_PATHS.ecwid },
  { value: 'square',     label: 'Square',     mark: 'Sq', text: 'text-text-muted',  border: 'border-slate-600',  dot: 'bg-slate-500', icon: PLATFORM_BRAND_ICON_PATHS.square }, // ds-allow-raw-neutral: identity/tone hue — Square's slate among platform brand hues, distinct from Other (= border-emphasis)
  { value: 'shopify',    label: 'Shopify',    mark: 'Sh', text: 'text-green-600',  border: 'border-green-600',  dot: 'bg-green-600', icon: PLATFORM_BRAND_ICON_PATHS.shopify },
  { value: 'other',      label: 'Other',      mark: '·',  text: 'text-text-soft',  border: 'border-border-emphasis', dot: 'bg-border-emphasis', icon: PLATFORM_BRAND_ICON_PATHS.other },
];

/** Fallback tone/label for an empty/unknown platform value. */
export const UNKNOWN_PLATFORM: SourcePlatformMeta = {
  value: '',
  label: 'Unknown',
  mark: '?',
  text: 'text-text-faint',
  border: 'border-border-default',
  /** Same family as CHIP_TONES.id.dot — quiet identity, not a lifecycle status. */
  dot: 'bg-border-emphasis',
};

const BY_VALUE = new Map(SOURCE_PLATFORMS.map((p) => [p.value, p]));

/** Resolve a `source_platform` value to its canonical meta (tone + label). */
export function sourcePlatformMeta(value: string | null | undefined): SourcePlatformMeta {
  const key = String(value ?? '').trim().toLowerCase();
  return BY_VALUE.get(key) ?? UNKNOWN_PLATFORM;
}

/** Canonical display name for a `source_platform` value. */
export function sourcePlatformLabel(value: string | null | undefined): string {
  return sourcePlatformMeta(value).label;
}

/** Fixed lettermark for icon-only listing chrome. */
export function sourcePlatformMark(value: string | null | undefined): string {
  return sourcePlatformMeta(value).mark;
}

/**
 * Icon / mark ink from {@link SourcePlatformMeta} — one ladder for
 * {@link PlatformMark}, carton order `#`, and listing ExternalLink.
 * Catalog `accentHex` wins (via {@link platformPaintFromHex}); else Tailwind
 * {@link SourcePlatformMeta.text}. Empty result → caller keeps a neutral tone.
 */
export function platformMetaIconTone(meta: SourcePlatformMeta): {
  className?: string;
  style?: { color: string };
} {
  const hex = meta.accentHex?.trim();
  if (hex) {
    const paint = platformPaintFromHex(hex);
    if (paint) return { style: { color: paint.accent } };
  }
  const text = meta.text?.trim();
  if (text) return { className: text };
  return {};
}

/**
 * Dense Sheets brand-identity micro-dot fill — order# column when `#` is
 * omitted. Catalog {@link SourcePlatformMeta.accentHex} wins (same ladder as
 * {@link platformMetaIconTone}); else registry {@link SourcePlatformMeta.dot}.
 * Not a lifecycle status dot (`GridStatusCellValue`).
 */
export function platformMetaBrandDot(meta: SourcePlatformMeta): {
  className?: string;
  style?: { backgroundColor: string };
} {
  const hex = meta.accentHex?.trim();
  if (hex) {
    const paint = platformPaintFromHex(hex);
    if (paint) return { style: { backgroundColor: paint.accent } };
  }
  const dot = meta.dot?.trim();
  if (dot) return { className: dot };
  return { className: UNKNOWN_PLATFORM.dot };
}

/**
 * Order / PO chip hover label — prefixes the platform display name when known
 * (`eBay 08-14924-82211`), mirroring {@link formatTrackingTooltipLabel}'s
 * carrier prefix. Pass the catalog-resolved label (from {@link usePlatformMeta}),
 * not a raw slug. Empty / Unknown → bare id.
 */
export function formatPlatformTooltipLabel(
  orderId: string,
  platformLabel?: string | null,
): string {
  const trimmed = String(orderId || '').trim();
  if (!trimmed) return '';
  const label = String(platformLabel ?? '').trim();
  if (!label || label === UNKNOWN_PLATFORM.label) return trimmed;
  return `${label} ${trimmed}`;
}

const BY_LABEL = new Map(SOURCE_PLATFORMS.map((p) => [p.label.toLowerCase(), p]));

/**
 * Resolve a *display label* (e.g. the order-derived channel label "Amazon",
 * "ebay", "FBA", "ECWID", "ECWID-RS") back to its canonical platform meta.
 * Order surfaces carry labels rather than stored `source_platform` values —
 * this is the one bridge so their tones/icons come from the same registry.
 * Unknown labels → {@link UNKNOWN_PLATFORM}.
 */
export function sourcePlatformMetaFromLabel(label: string | null | undefined): SourcePlatformMeta {
  const key = String(label ?? '').trim().toLowerCase();
  if (!key) return UNKNOWN_PLATFORM;
  // Value match first (labels like "ebay"/"FBA" lowercase to the raw value —
  // this also catches bare "ECWID" → the ECWID-RS entry), then canonical label.
  return BY_VALUE.get(key) ?? BY_LABEL.get(key) ?? UNKNOWN_PLATFORM;
}
