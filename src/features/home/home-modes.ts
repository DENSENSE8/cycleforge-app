/**
 * Shared types + constants for the Daily ("/") surface.
 *
 * ONE mode: `daily`. The page is the whole AGENDA — the org's shift checklist
 * and the work a colleague handed you, in one table banded by type (operator
 * 2026-09-22: *"consolidate the tasks into one display just under a type"*).
 *
 * A `?mode=tasks` tab existed for a few hours on 2026-09-22 and is gone with
 * the consolidation; `?mode=today` and `?mode=forge` have been gone longer.
 *
 * `parseHomeMode` survives as the stale-link guard: a bookmark carrying any of
 * those tokens lands on Daily — the only thing at `/` — instead of a dead
 * region. That is the same disposal doctrine every removed Home mode has used.
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
