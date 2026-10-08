/** Button fill map — isolated from the I/O component so guards can import the shipped source without pulling React / motion. */

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
  /** White on amber-600 / -500 read 3.2 / 2.2:1 — the fill starts at -700 (≥4.5:1) and only deepens on hover/press. */
  warning:
    'bg-amber-700 text-white shadow-sm shadow-amber-700/25 hover:bg-amber-800 active:bg-amber-900',
  /**
   * The tonal face of `warning` (M3 tonal — a verb repeated on every row, e.g. Reply): amber tint, dark ink.
   * amber-800 ink reads ≥6:1 on the -50 / -100 / -200 tints; dark mode -200 ink on a 15–25% wash, ≥8:1.
   */
  warningSoft:
    'bg-amber-50 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100 active:bg-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-400/30 dark:hover:bg-amber-500/25 dark:active:bg-amber-500/30',
  yellow:
    'bg-yellow-400 text-yellow-950 shadow-sm shadow-yellow-400/30 hover:bg-yellow-300 active:bg-yellow-500',
  /**
   * The vivid escalation fill (Create customer ticket, operator 2026-10-08): bright orange, dark ink.
   * orange-950 ink reads 5.6:1 on -500, 6.9:1 on the -400 hover; press returns to -500. Same fill in
   * dark mode — dark ink on a bright fill needs no theme flip.
   */
  orange:
    'bg-orange-500 text-orange-950 shadow-sm shadow-orange-500/30 hover:bg-orange-400 active:bg-orange-500',
  /** White on emerald-600 / -500 read 3.8 / 2.5:1 — the fill starts at -700 (≥4.5:1) and only deepens on hover/press. */
  success:
    'bg-emerald-700 text-white shadow-sm shadow-emerald-700/25 hover:bg-emerald-800 active:bg-emerald-900',
  /**
   * The tonal face of `success` (M3 tonal — a verb repeated on every row, e.g. Done): emerald tint, dark ink.
   * emerald-800 ink reads ≥6:1 on the -50 / -100 / -200 tints; dark mode -200 ink on a 15–25% wash, ≥8:1.
   */
  successSoft:
    'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100 active:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-400/30 dark:hover:bg-emerald-500/25 dark:active:bg-emerald-500/30',
  execute:
    'bg-surface-hover text-text-default hover:bg-surface-sunken active:bg-surface-sunken',
  /** `glass` is chrome ON LIVE MEDIA — a control riding a blurred bar over a camera feed or a photo. */
  glass: 'text-white hover:bg-glass/20 active:bg-glass/30',
  /**
   * `ink` is the triage DECISION fill (BRIEF §4 triage:
   * `ink` is the triage DECISION fill (BRIEF §4 triage: "neutral decisions,
   */
  ink: 'bg-text-default text-surface-card hover:bg-text-default/90 active:bg-text-default/80',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

/**
 * Chunky CTA ledge (Button `depth`) — each solid fill's own ink one ramp
 * deeper, set as the `shadow-<color>` that `shadow-elev-depth` paints. A
 * variant without an entry keeps the neutral ledge baked into the token.
 */
export const BUTTON_DEPTH_EDGE: Partial<Record<ButtonVariant, string>> = {
  primary: 'shadow-blue-800',
  success: 'shadow-emerald-900',
  danger: 'shadow-rose-800',
  warning: 'shadow-amber-900',
  yellow: 'shadow-yellow-600',
  orange: 'shadow-orange-700',
};
