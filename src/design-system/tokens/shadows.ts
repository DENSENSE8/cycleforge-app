/**
 * Shadow tokens — raw CSS box-shadow values (CSS vars) plus the **elevation
 * role ladder** (Tailwind class recipes).
 *
 * Raw `shadows.*` feed `--ds-shadow-*` via css-variables. Elevation roles follow
 * industry practice (Atlassian / M3-aligned): role = interaction plane, not
 * viewport position. Each role resolves to a `shadow-elev-*` utility whose
 * value is a themed CSS var (`--ds-elev-*`, globals.css), so dark-family
 * palettes ramp the alpha instead of forking a second class name.
 *
 * Consume via {@link elevationClass} / {@link ELEVATION_CLASS}. Never hand-roll
 * `shadow-* shadow-scrim/*` for flat / raised / overlay jobs.
 */

export const shadows = {
  none: 'none',
  xs: '0 2px 8px rgba(15, 23, 42, 0.02)',
  sm: '0 6px 16px rgba(15, 23, 42, 0.03)',
  md: '0 10px 24px rgba(15, 23, 42, 0.04)',
  lg: '0 14px 32px rgba(15, 23, 42, 0.04)',
  xl: '0 20px 42px rgba(15, 23, 42, 0.04)',
  surfaceDim: '0 12px 28px rgba(15, 23, 42, 0.04)',
  glassOverlay: '0 16px 44px rgba(15, 23, 42, 0.04)',
} as const;

export type Shadows = typeof shadows;

/**
 * Industry elevation roles — temporary / floating UI sits higher.
 *
 * - `flat`    — flush with canvas (no lift); borders/spacing carry hierarchy
 * - `raised`  — in-flow cards / panels above the page
 * - `overlay` — floating UI (menus, popovers, dialogs, sheets)
 */
export type ElevationRole = 'flat' | 'raised' | 'overlay';

/**
 * Intensity under `raised` only — Station column accent without inventing
 * extra roles:
 * - `soft`    — flush bookmark chrome (softer lift under GlobalHeader)
 * - `default` — primary glass work cards
 */
export type RaisedIntensity = 'soft' | 'default';

/**
 * Role → `shadow-elev-*` utility (tailwind.config.mjs `theme.extend.boxShadow`,
 * values in globals.css `--ds-elev-*`).
 *
 * Every role is an **ambient + key + cast** stack. The zero-offset ambient
 * layer is the load-bearing part: a purely downward shadow (the old
 * `shadow-lg shadow-scrim/10`) puts all of its ink at the bottom edge, so a
 * surface taller than the viewport — an ops grid with 200 rows — reads
 * perfectly flat at the only edge still on screen. Keep the ambient layer when
 * tuning; drop it and tall surfaces lose their depth again.
 */
export const ELEVATION_CLASS = {
  flat: '',
  raised: {
    soft: 'shadow-elev-soft',
    default: 'shadow-elev-raised',
  },
  overlay: 'shadow-elev-overlay',
} as const satisfies Record<
  ElevationRole,
  string | Record<RaisedIntensity, string>
>;

/**
 * Directional overlay cast — `overlay` ink thrown to one SIDE instead of
 * straight down — lives on the CSS vars (`shadow-elev-overlay-left` /
 * `-right`). Compose those at the call site with `elevationClass('overlay')`.
 * Never hand-roll a `shadow-* shadow-scrim/*` pair for this.
 */

export function elevationClass(role: 'flat' | 'overlay'): string;
export function elevationClass(
  role: 'raised',
  intensity?: RaisedIntensity,
): string;
export function elevationClass(
  role: ElevationRole,
  intensity: RaisedIntensity = 'default',
): string {
  if (role === 'raised') return ELEVATION_CLASS.raised[intensity];
  return ELEVATION_CLASS[role];
}

/**
 * Hover lift — literal `hover:` variants of the raised rung.
 *
 * These exist because a call site CANNOT build them: `hover:${elevationClass
 * ('raised')}` composes the string at runtime, Tailwind's scanner only reads
 * source text, and `shadow-elev-*` is not in the config safelist — so the
 * utility is never generated and the lift silently does nothing. Any new
 * state variant of an elevation role belongs here as a literal, for the same
 * reason.
 */
export const ELEVATION_HOVER_CLASS = {
  soft: 'hover:shadow-elev-soft',
  raised: 'hover:shadow-elev-raised',
} as const;

/**
 * The 3px a pressed control's face travels.
 *
 * This is the whole press now. It was one half of a pair: the other was a hard
 * 4px "lip" (`--ds-elev-tactile`) the face collapsed into, the physical-key
 * idiom. That lip was removed by operator ruling once the kiosk CTA dock went
 * transparent — hard ink with nothing solid beneath it stops reading as the
 * control's own thickness and starts reading as a drop shadow on whatever is
 * behind. Travel alone survives because it needs no ground to read against.
 *
 * Pair it with an explicit `shadow-none` on a control whose variant might
 * carry a shadow, and neutralise any competing `active:scale-*`: a shrink and
 * a drop are two motions describing one press.
 */
export const TACTILE_PRESS_TRAVEL_CLASS = 'active:translate-y-[3px]';
