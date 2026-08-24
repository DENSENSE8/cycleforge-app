/**
 * Which right-edge host the shell mounts.
 *
 * The single-slot `RightRailHost` and the N-tile `RightRailTileHost` read the
 * same occupancy seam, so the choice between them is a **flag, not a
 * migration** — and that is the property worth protecting. Flip it off and the
 * 43 registrants keep working exactly as they did; flip it on and they tile.
 *
 * Env-only, and deliberately not a per-org DB flag: `@/lib/feature-flags`
 * resolves per tenant by querying `organization_feature_flags` through a `pg`
 * pool, which cannot run in the browser at all, and this decision is made
 * during the first client render of the shell. A build-time constant is also
 * the honest shape for a strangler switch that exists to be deleted once the
 * tile host is the only host.
 *
 * `NEXT_PUBLIC_TOOL_TILE_HOST=1` (or `true` / `on` / `yes`) turns it on. The
 * literal `process.env.NEXT_PUBLIC_TOOL_TILE_HOST` is required — Next inlines
 * `NEXT_PUBLIC_*` by textual substitution, so a computed key reads `undefined`
 * in the browser.
 */

function readBoolEnv(raw: string | undefined): boolean {
  if (raw == null) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
}

export const TOOL_TILE_HOST_ENABLED: boolean = readBoolEnv(
  process.env.NEXT_PUBLIC_TOOL_TILE_HOST,
);
