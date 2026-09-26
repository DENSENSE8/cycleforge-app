/** Shared types + constants for the Daily ("/") surface. */

export type HomeMode = 'daily';

/** `daily` is the landing view — the only view. */
export const DEFAULT_HOME_MODE: HomeMode = 'daily';

/** Live Home modes. */
export const HOME_MODES = ['daily'] as const satisfies readonly HomeMode[];

export function parseHomeMode(_raw: string | null | undefined): HomeMode {
  return DEFAULT_HOME_MODE;
}

/** Wire tokens `?mode=` may carry on `/` (route-param hygiene / deep links). */
export function parseHomeModeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (HOME_MODES as readonly string[]).includes(v) ? v : null;
}
