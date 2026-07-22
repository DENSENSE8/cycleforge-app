/**
 * Single source of truth for a receiving `source_platform` value → its display
 * name + chip tone. Before this module the same platform read three different
 * ways: the pill said "AliExp" while the printed label said "AliExpress", the
 * order-derived helper returned a lowercase "ebay", and "ECWID" vs "ECWID-RS"
 * drifted between surfaces. Everything that turns a platform value into a name
 * or a color now derives from {@link SOURCE_PLATFORMS} so a platform can never
 * present two ways again. Mirrors the condition-label SoT pattern.
 */

import { PLATFORM_BRAND_ICON_PATHS } from '@/lib/platform-brand-icons';

export interface SourcePlatformMeta {
  /** Stored `source_platform` value (lowercase, what the DB holds). */
  value: string;
  /** Canonical display name — the ONE label shown anywhere a platform appears. */
  label: string;
  /**
   * Fixed 1–2 char lettermark for icon-only listing chrome. Keeps the listing
   * chip constant-width across platforms (tooltip / aria still use `label`).
   */
  mark: string;
  /** Tailwind text tone for the chip's external-link icon / lettermark. */
  text: string;
  /** Tailwind border tone for the chip's underline accent. */
  border: string;
  /**
   * Monochrome brand-mark SVG path (24×24, `currentColor`) from the vendored
   * CC0 set in `src/lib/platform-brand-icons.ts`. Fallback layer when no
   * {@link favicon} is present.
   */
  icon?: string;
  /**
   * Vendored platform favicon (`public/icons/platforms/*.png`, fetched from
   * the live sites 2026-07-21 — nominative brand identity in a data column).
   * The PREFERRED mark: real colored favicon at a fixed footprint; `icon` /
   * {@link mark} are the fallbacks when absent (`other`).
   */
  favicon?: string;
}

/** Vendored favicon path for a platform value (files in public/icons/platforms/). */
const favicon = (value: string) => `/icons/platforms/${value}.png`;

/**
 * Canonical platform registry, display order left → right. The pill options,
 * the printed label, the condensed-row listing chip, and any tone lookup read
 * from here. Add a platform once, in this list.
 */
export const SOURCE_PLATFORMS: SourcePlatformMeta[] = [
  { value: 'ebay',       label: 'eBay',       mark: 'eB', text: 'text-yellow-500', border: 'border-yellow-400', icon: PLATFORM_BRAND_ICON_PATHS.ebay, favicon: favicon('ebay') },
  { value: 'amazon',     label: 'Amazon',     mark: 'az', text: 'text-orange-600', border: 'border-orange-600', favicon: favicon('amazon') },
  { value: 'fba',        label: 'FBA',        mark: 'FB', text: 'text-orange-600', border: 'border-orange-600', favicon: favicon('fba') },
  { value: 'aliexpress', label: 'AliExpress', mark: 'AE', text: 'text-red-500',    border: 'border-red-500', icon: PLATFORM_BRAND_ICON_PATHS.aliexpress, favicon: favicon('aliexpress') },
  { value: 'walmart',    label: 'Walmart',    mark: 'W',  text: 'text-amber-700',  border: 'border-amber-700', icon: PLATFORM_BRAND_ICON_PATHS.walmart, favicon: favicon('walmart') },
  { value: 'goodwill',   label: 'Goodwill',   mark: 'Gw', text: 'text-sky-600',    border: 'border-sky-600', favicon: favicon('goodwill') },
  // ECWID-RS (not plain ECWID): today this pill only appears when the carton
  // was paired with an Ecwid repair-service (-RS) order.
  { value: 'ecwid',      label: 'ECWID-RS',   mark: 'Ec', text: 'text-blue-600',   border: 'border-blue-600', favicon: favicon('ecwid') },
  { value: 'square',     label: 'Square',     mark: 'Sq', text: 'text-text-muted',  border: 'border-slate-600', icon: PLATFORM_BRAND_ICON_PATHS.square, favicon: favicon('square') }, // ds-allow-raw-neutral: identity/tone hue — Square's slate among platform brand hues, distinct from Other (= border-emphasis)
  { value: 'shopify',    label: 'Shopify',    mark: 'Sh', text: 'text-green-600',  border: 'border-green-600', icon: PLATFORM_BRAND_ICON_PATHS.shopify, favicon: favicon('shopify') },
  { value: 'other',      label: 'Other',      mark: '·',  text: 'text-text-soft',  border: 'border-border-emphasis' },
];

/** Fallback tone/label for an empty/unknown platform value. */
export const UNKNOWN_PLATFORM: SourcePlatformMeta = {
  value: '',
  label: 'Unknown',
  mark: '?',
  text: 'text-text-faint',
  border: 'border-border-default',
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
