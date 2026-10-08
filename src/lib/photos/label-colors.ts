/** Photo-label color registry — the single source of truth for a label's tone. */

export const LABEL_COLOR_TOKENS = [
  'slate',
  'blue',
  'violet',
  'indigo',
  'cyan',
  'teal',
  'emerald',
  'amber',
  'orange',
  'rose',
  'fuchsia',
] as const;

export type LabelColorToken = (typeof LABEL_COLOR_TOKENS)[number];

export const DEFAULT_LABEL_COLOR: LabelColorToken = 'slate';

const LABEL_COLOR_SET = new Set<string>(LABEL_COLOR_TOKENS);

/** True when `color` is one of the allowed semantic tokens. */
export function isLabelColorToken(color: unknown): color is LabelColorToken {
  return typeof color === 'string' && LABEL_COLOR_SET.has(color);
}

/** Coerce any stored value to a safe token (falls back to the default). */
export function normalizeLabelColor(color: string | null | undefined): LabelColorToken {
  return isLabelColorToken(color) ? color : DEFAULT_LABEL_COLOR;
}

/** Full literal chip classes per token (3-layer: bg / text / ring) — a medium tint, vivid enough to read at a glance. */
export const LABEL_CHIP_CLASSES: Record<LabelColorToken, string> = {
  slate: 'bg-surface-sunken text-text-default ring-1 ring-inset ring-border-emphasis',
  blue: 'bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-300',
  violet: 'bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-300',
  indigo: 'bg-indigo-100 text-indigo-800 ring-1 ring-inset ring-indigo-300',
  cyan: 'bg-cyan-100 text-cyan-800 ring-1 ring-inset ring-cyan-300',
  teal: 'bg-teal-100 text-teal-800 ring-1 ring-inset ring-teal-300',
  emerald: 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-300',
  amber: 'bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300',
  orange: 'bg-orange-100 text-orange-800 ring-1 ring-inset ring-orange-300',
  rose: 'bg-rose-100 text-rose-800 ring-1 ring-inset ring-rose-300',
  fuchsia: 'bg-fuchsia-100 text-fuchsia-800 ring-1 ring-inset ring-fuchsia-300',
};

/** Solid dot classes per token (used in the color picker swatch). */
const LABEL_DOT_CLASSES: Record<LabelColorToken, string> = {
  slate: 'bg-slate-500', // ds-allow-raw-neutral: identity hue — staff/label color vocabulary, not chrome
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  indigo: 'bg-indigo-500',
  cyan: 'bg-cyan-500',
  teal: 'bg-teal-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  rose: 'bg-rose-500',
  fuchsia: 'bg-fuchsia-500',
};

/** Chip classes for a (possibly invalid/legacy) stored color value. */
export function labelChipClasses(color: string | null | undefined): string {
  return LABEL_CHIP_CLASSES[normalizeLabelColor(color)];
}

/** Dot classes for a (possibly invalid/legacy) stored color value. */
function labelDotClasses(color: string | null | undefined): string {
  return LABEL_DOT_CLASSES[normalizeLabelColor(color)];
}
