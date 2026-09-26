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
  warning:
    'bg-amber-600 text-white shadow-sm shadow-amber-600/25 hover:bg-amber-500 active:bg-amber-700',
  yellow:
    'bg-yellow-400 text-yellow-950 shadow-sm shadow-yellow-400/30 hover:bg-yellow-300 active:bg-yellow-500',
  success:
    'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-500 active:bg-emerald-700',
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
