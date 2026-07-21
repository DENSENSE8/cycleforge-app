/**
 * Shadow tokens — raw CSS box-shadow values (CSS vars) plus the **elevation
 * role ladder** (Tailwind class recipes).
 *
 * Raw `shadows.*` feed `--ds-shadow-*` via css-variables. Elevation roles follow
 * industry practice (Atlassian / M3-aligned): role = interaction plane, not
 * viewport position. Shadow is one cue; pair with surface treatment in dark
 * themes when needed.
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
  inner: 'inset 0 1px 0 rgba(100, 116, 139, 0.10)',
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

export const ELEVATION_CLASS = {
  flat: '',
  raised: {
    soft: 'shadow-sm shadow-scrim/5',
    default: 'shadow-lg shadow-scrim/10',
  },
  overlay: 'shadow-xl shadow-scrim/20',
} as const satisfies Record<
  ElevationRole,
  string | Record<RaisedIntensity, string>
>;

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
