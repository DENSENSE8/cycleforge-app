/**
 * Single source of truth for a `source_platform` / channel value → mark, tone,
 * and display label. Ops UI paints the **colored identity dot**
 * ({@link platformMetaBrandDot}) or a lettermark via {@link PlatformMark} —
 * never uppercase prose like "ECWID" as the channel face. {@link label} is for
 * tooltip / aria / select-option text / physical print only.
 *
 * Before this module the same platform read three different ways: the pill said
 * "AliExp" while the printed label said "AliExpress", the order-derived helper
 * returned a lowercase "ebay", and Ecwid drifted between "ECWID" and the
 * receiving repair-service face "ECWID-RS". Everything that turns a platform
 * value into a name or a color now derives from {@link SOURCE_PLATFORMS} so a
 * platform can never present two ways again.
 */

import { platformPaintFromHex } from '@/lib/color-contrast';

/**
 * The PINNED hue for a platform — the one place the sentence "eBay is yellow,
 * Amazon is orange" is written down.
 *
 * `text` / `border` / `dot` below stay explicit rather than being generated
 * from this, because their shades are tuned per platform for legibility
 * (eBay reads at 500/400, Amazon at 600/600) and a uniform ladder would
 * silently restyle half the registry. What this field buys is that the tuning
 * can no longer DISAGREE with the hue: `source-platform.test.ts` asserts every
 * class on a row names that row's hue, so a copy-paste that leaves an Amazon
 * row painting yellow fails the suite instead of shipping.
 *
 * `slate` and `neutral` are the deliberate non-brand hues — Square's quiet
 * slate, and Other/Unknown, which paint from semantic `text-text-*` /
 * `border-border-*` tokens rather than a colour ramp.
 */
export type PlatformHue =
  | 'yellow'
  | 'orange'
  | 'red'
  | 'amber'
  | 'sky'
  | 'blue'
  | 'green'
  | 'purple'
  | 'slate'
  | 'neutral';

export interface SourcePlatformMeta {
  /** The pinned brand hue. See {@link PlatformHue} — this is the definition. */
  hue: PlatformHue;
  /** Stored `source_platform` value (lowercase, what the DB holds). */
  value: string;
  /**
   * Canonical display name — tooltip / aria / select-option / print prose.
   * Dense ops faces use {@link mark} via {@link PlatformMark}, not this string.
   */
  label: string;
  /**
   * Fixed 1–2 char lettermark for listing chrome that still mounts
   * {@link PlatformMark}. Ops identity is the colored {@link dot}, not a glyph.
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
   * Optional full-color brand tile under `/public` (e.g. Amazon smile square).
   * Used when {@link PlatformMark} sets `preferBrandTile` (carton listing).
   */
  tileSrc?: string;
}

/**
 * Canonical platform registry, display order left → right. The pill options,
 * the printed label, the condensed-row listing chip, and any tone lookup read
 * from here. Add a platform once, in this list.
 */
export const SOURCE_PLATFORMS: SourcePlatformMeta[] = [
  { value: 'ebay', hue: 'yellow',       label: 'eBay',       mark: 'eB', text: 'text-yellow-500', border: 'border-yellow-400', dot: 'bg-yellow-500' },
  {
    value: 'amazon',
    hue: 'orange',
    label: 'Amazon',
    mark: 'az',
    text: 'text-orange-600',
    border: 'border-orange-600',
    dot: 'bg-orange-600',
    tileSrc: '/icons/platforms/amazon.png',
  },
  { value: 'fba', hue: 'orange',        label: 'Amazon',     mark: 'FB', text: 'text-orange-600', border: 'border-orange-600', dot: 'bg-orange-600' },
  { value: 'aliexpress', hue: 'red', label: 'AliExpress', mark: 'AE', text: 'text-red-500',    border: 'border-red-500',    dot: 'bg-red-500' },
  { value: 'walmart', hue: 'amber',    label: 'Walmart',    mark: 'W',  text: 'text-amber-700',  border: 'border-amber-700',  dot: 'bg-amber-700' },
  { value: 'goodwill', hue: 'sky',   label: 'Goodwill',   mark: 'Gw', text: 'text-sky-600',    border: 'border-sky-600',    dot: 'bg-sky-600' },
  // Storefront channel. Repair-service cartons are a receiving *type*, not a
  // second marketplace — the stored slug stays `ecwid`, the face is Ecwid.
  { value: 'ecwid', hue: 'blue',      label: 'Ecwid',      mark: 'Ec', text: 'text-blue-600',   border: 'border-blue-600',   dot: 'bg-blue-600' },
  { value: 'square', hue: 'slate',     label: 'Square',     mark: 'Sq', text: 'text-text-muted',  border: 'border-slate-600',  dot: 'bg-slate-500' }, // ds-allow-raw-neutral: identity/tone hue — Square's slate among platform brand hues, distinct from Other (= border-emphasis)
  { value: 'shopify', hue: 'green',    label: 'Shopify',    mark: 'Sh', text: 'text-green-600',  border: 'border-green-600',  dot: 'bg-green-600' },
  // Order / Product Hub channels (not door-intake defaults) — still need a
  // mark + tone so PlatformMark never falls back to typed prose.
  { value: 'zoho', hue: 'red',       label: 'Zoho',       mark: 'Zo', text: 'text-red-600',    border: 'border-red-600',    dot: 'bg-red-600' },
  { value: 'mercari', hue: 'purple',    label: 'Mercari',    mark: 'Me', text: 'text-purple-600', border: 'border-purple-600', dot: 'bg-purple-600' },
  { value: 'other', hue: 'neutral',      label: 'Other',      mark: '·',  text: 'text-text-soft',  border: 'border-border-emphasis', dot: 'bg-border-emphasis' },
];

/** Fallback tone/label for an empty/unknown platform value. */
export const UNKNOWN_PLATFORM: SourcePlatformMeta = {
  value: '',
  hue: 'neutral',
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

/**
 * The pinned brand hue for a platform value. Any surface that needs a colour
 * NAME (rather than a Tailwind class) reads it from here — a tone vocabulary
 * that hardcodes its own "amazon is orange" row is exactly the drift this
 * function exists to prevent.
 */
export function sourcePlatformHue(value: string | null | undefined): PlatformHue {
  return sourcePlatformMeta(value).hue;
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
  const label = String(platformLabel ?? '').trim();
  const known = Boolean(label) && label !== UNKNOWN_PLATFORM.label;
  // Empty id (unfound / keepEmpty peek) — still surface the catalog platform
  // name, same face the order-chip hover uses as its prefix.
  if (!trimmed) return known ? label : '';
  if (!known) return trimmed;
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
  // Historic faces: "ECWID-RS" / "ECWID RS" were the receiving repair-service
  // name painted onto every Ecwid order. They still resolve to `ecwid`.
  const slug = key.replace(/[\s_]+/g, '-');
  if (slug === 'ecwid' || slug.startsWith('ecwid-')) return sourcePlatformMeta('ecwid');
  // Value match first (labels like "ebay"/"FBA" lowercase to the raw value),
  // then canonical label.
  return BY_VALUE.get(key) ?? BY_LABEL.get(key) ?? UNKNOWN_PLATFORM;
}
