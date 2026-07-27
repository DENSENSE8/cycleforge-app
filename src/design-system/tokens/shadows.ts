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

/**
 * Role → `shadow-elev-*` utility (tailwind.config.ts `theme.extend.boxShadow`,
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
