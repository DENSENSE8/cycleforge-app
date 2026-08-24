'use client';

/**
 * Session canvas tiles — which bench a `session` tab mounts.
 *
 * Until this existed every session tab rendered `CanvasTileBody`'s honest gap
 * ("No tile registered for session · unbox"). This is the map that fills it, and
 * it is expressed the same way `PANEL_REGISTRY` expresses the left column: as
 * DATA with a lazy loader per entry, so the canvas host never imports a surface
 * and every bench stays on its own chunk until a tile actually mounts it. A host
 * that imported them would hand back the ~1MB gz per-route split that is the
 * largest measured bundle lever in this repo.
 *
 * ## Exact refs, never a `session/*` wildcard
 *
 * A wildcard would be one line and would be wrong. `resolveCanvasTile` falls
 * back to the wildcard for any ref of the kind, so a surface nobody has ported —
 * or a persisted tab naming a surface that has since been removed — would mount
 * SOME bench instead of saying it has none. "This surface is not ported yet" and
 * "this surface is broken" look identical to an operator standing at a scanner,
 * and only one of them is true. Exact refs also mean this file can be read as
 * the answer to "what works today", which a wildcard destroys.
 *
 * ## The closed record is the enumeration
 *
 * {@link SESSION_TILE_LOADERS} is a `Record<SurfaceKey, …>`, so adding a key to
 * `SURFACE_KEYS` is a compile error here until someone answers for it — the same
 * device `SURFACE_REGISTRY` uses for `session`, and for the same reason: a
 * surface must not inherit "has a tile" or "has no tile" by omission. `null`
 * means the gap is deliberate and is documented at the entry.
 *
 * ## Titles come from the registry, not from the tab
 *
 * `title` ignores `params.title` even though the assistant writes one, because
 * `tabFace` (the rail strip) resolves a session's name from
 * `SURFACE_REGISTRY[ref].label` and a pane whose title disagrees with the tab
 * that opened it is a window manager the operator cannot trust.
 */

import {
  registerCanvasTile,
  type CanvasTileDescriptor,
} from '@/lib/canvas/tile-registry';
import {
  SURFACE_KEYS,
  SURFACE_REGISTRY,
  type SurfaceKey,
} from '@/lib/stations/surface-keys';

type SessionTileLoad = CanvasTileDescriptor['load'];

/**
 * One lazy loader per surface, or `null` where a tile would have to lie.
 *
 * The six receiving surfaces share `ReceivingSessionTile` because they share
 * `ReceivingDashboard` — the mode is derived path-first from the route scope's
 * pathname, so the same module serves all six without being told which it is.
 */
const SESSION_TILE_LOADERS: Record<SurfaceKey, SessionTileLoad | null> = {
  unbox: () => import('@/components/workspace/canvas/tiles/session/ReceivingSessionTile'),
  triage: () => import('@/components/workspace/canvas/tiles/session/ReceivingSessionTile'),
  incoming: () => import('@/components/workspace/canvas/tiles/session/ReceivingSessionTile'),
  pickup: () => import('@/components/workspace/canvas/tiles/session/ReceivingSessionTile'),
  repair: () => import('@/components/workspace/canvas/tiles/session/ReceivingSessionTile'),
  history: () => import('@/components/workspace/canvas/tiles/session/ReceivingSessionTile'),
  pack: () => import('@/components/workspace/canvas/tiles/session/PackSessionTile'),
  test: () => import('@/components/workspace/canvas/tiles/session/TestSessionTile'),
  support: () => import('@/components/workspace/canvas/tiles/session/SupportSessionTile'),

  /**
   * Shipping — NOT registered, and not because nobody got to it.
   *
   * `SURFACE_REGISTRY.outbound.route` is `/shipping/labels`, and there is no
   * `src/app/shipping/labels/page.tsx` in this tree. `/shipping` has exactly two
   * segments — `fba` and `orders` — so the surface's own canonical route 404s
   * today. `LabelsModeBody` exists but is a SIDEBAR body (mounted by
   * `OutboundSidebarPanel`), and `LabelsOrderWorkspace` is defined and mounted by
   * nothing at all.
   *
   * There is therefore no "the same tree" for a Shipping tile to reproduce: any
   * body picked here would be a guess about what the missing page rendered.
   * `/shipping/orders` is the To-ship DESK, a different job the registry does not
   * bind to this key, and mounting it would quietly rename Shipping to Orders.
   * Leaving the gap keeps the honest face until either the route comes back or
   * the registry's `route`/`modeKey` are corrected to name a bench that exists.
   */
  outbound: null,
};

/**
 * Register a tile for every surface that has one. Idempotent — `registerCanvasTile`
 * replaces by `(kind, ref)`, so a hot reload re-runs this safely.
 */
export function registerSessionCanvasTiles(): void {
  for (const key of SURFACE_KEYS) {
    const load = SESSION_TILE_LOADERS[key];
    if (!load) continue;
    registerCanvasTile({
      kind: 'session',
      ref: key,
      title: () => SURFACE_REGISTRY[key].label,
      load,
    });
  }
}

/** Surfaces with no tile body yet — the honest gaps, for anyone auditing them. */
export function unregisteredSessionSurfaces(): SurfaceKey[] {
  return SURFACE_KEYS.filter((key) => SESSION_TILE_LOADERS[key] === null);
}
