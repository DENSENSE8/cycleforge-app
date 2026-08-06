/**
 * WCAG contrast helpers — single SoT for deriving readable ink from a free-form
 * background / accent hex (org platform colors, future staff/role reuse).
 *
 * Marketplace platforms may store a custom `#RRGGBB` accent; paint always goes
 * through {@link platformPaintFromHex} so a bright yellow never forces white
 * text. Carrier brand hex stays in {@link carrier-brand.ts} and is never
 * tenant-overridable.
 */

/** Canonical dark / light ink when a solid fill must carry text. */
export const INK_DARK = '#0f172a'; // slate-900
export const INK_LIGHT = '#ffffff';

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = HEX_RE.exec(String(hex || '').trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function normalizeHex(hex: string): string | null {
  const p = parseHex(hex);
  if (!p) return null;
  const to = (c: number) => c.toString(16).padStart(2, '0');
  return `#${to(p.r)}${to(p.g)}${to(p.b)}`;
}

/** sRGB channel → linear light (WCAG 2.x). */
function channelLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance L ∈ [0, 1] (WCAG 2.x). */
export function relativeLuminance(hex: string): number | null {
  const p = parseHex(hex);
  if (!p) return null;
  return 0.2126 * channelLinear(p.r) + 0.7152 * channelLinear(p.g) + 0.0722 * channelLinear(p.b);
}

/** Contrast ratio between two hex colors (1–21). Null if either hex is invalid. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) return null;
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick dark or light ink for text sitting on `bgHex`. Prefers white when it
 * still clears WCAG AA (~4.5:1) for normal text; otherwise forces dark ink.
 */
export function inkForBackground(bgHex: string, minRatio = 4.5): string {
  const vsWhite = contrastRatio(bgHex, INK_LIGHT);
  if (vsWhite != null && vsWhite >= minRatio) return INK_LIGHT;
  return INK_DARK;
}

function mixWithWhite(hex: string, whiteWeight: number): string {
  const p = parseHex(hex);
  if (!p) return '#f8fafc'; // slate-50 fallback
  const w = Math.min(1, Math.max(0, whiteWeight));
  const mix = (c: number) => Math.round(c * (1 - w) + 255 * w);
  const to = (c: number) => c.toString(16).padStart(2, '0');
  return `#${to(mix(p.r))}${to(mix(p.g))}${to(mix(p.b))}`;
}

function mixWithBlack(hex: string, blackWeight: number): string {
  const p = parseHex(hex);
  if (!p) return INK_DARK;
  const w = Math.min(1, Math.max(0, blackWeight));
  const mix = (c: number) => Math.round(c * (1 - w));
  const to = (c: number) => c.toString(16).padStart(2, '0');
  return `#${to(mix(p.r))}${to(mix(p.g))}${to(mix(p.b))}`;
}

/** Paint kit returned by {@link platformPaintFromHex} — not a public export. */
interface PlatformPaint {
  /** Stored / normalized accent hex (`#rrggbb`). */
  accent: string;
  /** Ink for text/icons on a *solid* accent fill. */
  ink: string;
  /** Soft chip background (~Tailwind `*-50`) derived from accent. */
  softFill: string;
  /** Ink that contrasts against {@link softFill} (darkened accent or slate). */
  softInk: string;
  /** Border / underline accent for mark chrome. */
  border: string;
}

/**
 * Derive a full platform paint kit from an org accent hex. Invalid hex → null
 * (caller falls back to builtin Tailwind tones).
 */
export function platformPaintFromHex(accentHex: string): PlatformPaint | null {
  const accent = normalizeHex(accentHex);
  if (!accent) return null;
  const softFill = mixWithWhite(accent, 0.9);
  const softInkCandidate = mixWithBlack(accent, 0.35);
  const softInk =
    (contrastRatio(softFill, softInkCandidate) ?? 0) >= 4.5
      ? softInkCandidate
      : inkForBackground(softFill);
  return {
    accent,
    ink: inkForBackground(accent),
    softFill,
    softInk,
    border: accent,
  };
}
