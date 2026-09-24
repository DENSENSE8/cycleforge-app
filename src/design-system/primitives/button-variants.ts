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
  /**
   * `glass` is chrome ON LIVE MEDIA — a control riding a blurred bar over a
   * camera feed or a photo. Every other face here assumes a known surface
   * token underneath, so on a viewfinder they are either invisible (`ghost`
   * resolves `text-text-muted` over whatever the lens is pointed at) or they
   * punch an opaque hole in the picture (`secondary`).
   *
   * INK ONLY — the scrim belongs to the bar, exactly once. Each control
   * carrying its own `bg-scrim` (which is how this shipped for an afternoon)
   * paints a visibly darker block inside an already-dark bar: a box in a box,
   * three different alphas on one 36px row. So the bar blurs and dims the
   * picture, and the controls are white marks on it with a faint `glass` wash
   * for press feedback.
   *
   * It was hand-rolled as `bg-scrim/55 text-white backdrop-blur` at two call
   * sites before it was an intent — the drift this map exists to stop.
   */
  glass: 'text-white hover:bg-glass/20 active:bg-glass/30',
  /**
   * `ink` is the triage DECISION fill (BRIEF §4 triage: "neutral decisions,
   * primary = ink fill"). The region's own ink on its own panel — the neutral
   * aliases the mode stylesheet remaps — so it follows the mode and the theme
   * instead of borrowing an accent that already means navigation.
   */
  ink: 'bg-text-default text-surface-card hover:bg-text-default/90 active:bg-text-default/80',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
