/**
 * Shared types + constants for the Home ("/") surface.
 *
 * ONE mode as of 2026-09-14: `daily`. The Today and Tasks modes were removed
 * from Home by operator ruling (their workbenches and backends stay on disk,
 * unmounted — deletion remains a separate, gated pass). Home IS the daily
 * checklist now; the nav spine names it "Daily" with the lucide ListChecks
 * glyph.
 *
 * `parseHomeMode` survives as the stale-link guard: a bookmark carrying
 * `?mode=today` / `?mode=tasks` (or the older `?mode=forge` the Plans spine
 * pin still writes) lands on Daily — the only live thing at `/` — instead of
 * a dead region. That is the same disposal doctrine every removed Home mode
 * has used (`inbox`, `collab`, `brief`, ops-plan `tasks`).
 *
 * `?mode=` in the URL stays the single source of truth for the surface — this
 * module keeps only the vocabulary + its parser, so the registry and the page
 * can never disagree.
 */

export type HomeMode = 'daily';

/** `daily` is the landing view — the only view. */
export const DEFAULT_HOME_MODE: HomeMode = 'daily';

/** Live Home modes. */
export const HOME_MODES = ['daily'] as const satisfies readonly HomeMode[];

export function parseHomeMode(_raw: string | null | undefined): HomeMode {
  return DEFAULT_HOME_MODE;
}

/**
 * Wire tokens `?mode=` may carry on `/` (route-param hygiene / deep links).
 * Every unknown token — including the removed `today` / `tasks` — resolves to
 * null, so a round trip through `buildRouteUrl` drops it rather than
 * round-tripping a mode that no longer exists.
 */
export function parseHomeModeWire(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return (HOME_MODES as readonly string[]).includes(v) ? v : null;
}
