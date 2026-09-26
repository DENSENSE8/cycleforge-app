/** Shadow tokens — raw CSS box-shadow values (CSS vars) plus the **elevation role ladder** (Tailwind class recipes). */

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

/** Industry elevation roles — temporary / floating UI sits higher. */
export type ElevationRole = 'flat' | 'raised' | 'overlay';

/** Intensity under `raised` only — Station column accent without inventing extra roles: */
export type RaisedIntensity = 'soft' | 'default';

/** Role → `shadow-elev-*` utility (tailwind.config.mjs `theme.extend.boxShadow`, values in globals.css `--ds-elev-*`). */
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

/** Directional overlay cast — `overlay` ink thrown to one SIDE instead of straight down — lives on the CSS vars (`shadow-elev-overlay-left`… */

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
