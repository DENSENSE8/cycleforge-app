/**
 * Button fill map — isolated from the I/O component so guards can import the
 * shipped source without pulling React / motion.
 *
 * `success` is the Add intent (emerald). `execute` is the Check intent (the
 * shared Check face: card + ring — same paint 2b unified onto, now a named
 * semantic rather than a `secondary` reuse). `primarySoft` is the LIGHT blue
 * face of `primary` — same accent, quiet enough to sit as a reference verb
 * inside a Displays leaf without reading as the surface's commit CTA.
 */

export const BUTTON_VARIANTS = {
  primary:
    'bg-blue-600 text-white shadow-sm shadow-blue-600/25 hover:bg-blue-500 active:bg-blue-700',
  primarySoft:
    'bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 active:bg-blue-200',
  brand:
    'text-white shadow-sm shadow-navy-900/30 bg-gradient-to-b from-navy-700 to-navy-900 hover:from-navy-600 hover:to-navy-800',
  secondary:
    'bg-surface-card text-text-default ring-1 ring-border-soft hover:bg-surface-canvas active:bg-surface-canvas',
  ghost: 'text-text-muted hover:bg-surface-canvas hover:text-text-default active:bg-surface-canvas',
  danger: 'bg-rose-600 text-white shadow-sm shadow-rose-600/25 hover:bg-rose-500 active:bg-rose-700',
  success:
    'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 active:bg-emerald-700',
  execute:
    'bg-surface-card text-text-default ring-1 ring-border-soft hover:bg-surface-canvas active:bg-surface-canvas',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
