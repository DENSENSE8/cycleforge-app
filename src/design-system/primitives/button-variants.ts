/**
 * Button fill map — isolated from the I/O component so guards can import the
 * shipped source without pulling React / motion.
 *
 * `success` is the Add intent (emerald). `execute` is the Check intent (the
 * shared Check face: barely-there `surface-hover` fill, no cell ring — chrome
 * Check reads as a quiet gray peer of Import / Add, not empty card and not a
 * solid gray slab). `primarySoft` is the LIGHT blue
 * face of `primary` — same accent, quiet enough to sit as a reference verb
 * inside a Displays leaf without reading as the surface's commit CTA.
 *
 * `warning` is the RECOVERABLE intent (amber) — the verb out of a state that
 * committed but carries an open caveat: a receive that skipped inventory, a
 * cooldown that will replay, a photo gate the operator can waive with a named
 * reason. It exists because feedback surfaces have a four-tone state machine
 * (loading · success · warning · error) and only three had a Button intent, so
 * an amber CTA had to be painted on with a `className` hue override — the
 * exact thing `AGENTS.md` → *Do not paint over primitives* bans. Grow the map,
 * don't override the fill.
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
  dangerSoft:
    'bg-rose-50 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 active:bg-rose-200',
  warning:
    'bg-amber-600 text-white shadow-sm shadow-amber-600/25 hover:bg-amber-500 active:bg-amber-700',
  yellow:
    'bg-yellow-400 text-yellow-950 shadow-sm shadow-yellow-400/30 hover:bg-yellow-300 active:bg-yellow-500',
  success:
    'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 active:bg-emerald-700',
  execute:
    'bg-surface-hover text-text-default hover:bg-surface-sunken active:bg-surface-sunken',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
