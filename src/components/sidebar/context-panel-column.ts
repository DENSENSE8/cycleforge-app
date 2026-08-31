import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/**
 * Context-panel layout tokens — the route's own sidebar, in the CONTENT region.
 *
 * ```
 *   ┌──────────────────────────────────────┐
 *   │ context panel │ workspace ───────────│
 *   │  scan bar     │                      │
 *   │  recents rail │                      │
 *   └──────────────────────────────────────┘
 *     content region (the nav spine is a separate surface entirely)
 * ```
 *
 * **This was the station bench's shape, and it is now every route's.** A route's
 * sidebar — the Media library's facet rail, Products' catalog picker, the
 * receiving rails, the dashboard's order feed — is a component the PAGE mounts
 * beside its workspace, not a body the navigator swaps in. Two consequences the
 * old shape could not give:
 *
 * - **The rail survives the nav.** A bench needed this first (an operator scans
 *   with the nav closed, which is most of the time), but it is just as true of a
 *   picker: opening the page list should never take away the thing you were
 *   picking from.
 * - **The spine has nothing to collide with.** While the route's rail lived in
 *   the nav aside, the page list had to paint over it, and a route with no rail
 *   (the Media library) had the list paint over the work canvas instead. With the
 *   rail in the content region there is exactly one left-edge surface.
 *
 * **Depth (ruled 2026-08-03):** flush coplanar column on the shared
 * {@link CONTEXT_PANEL_HOST_CLASS} ground — hairline against the center, flat
 * elevation. Outer `m-*` islands are not depth (see source-of-truth → Depth
 * elevation · Frame column budget).
 *
 * Formerly `station-column.ts` / `STATION_PANEL_*`, when the station benches were
 * the only surfaces that mounted here.
 */

/**
 * Default context-panel width in px. The Tailwind twin lives on
 * {@link CONTEXT_PANEL_COLUMN_CLASS} (`w-[360px]`); keep them adjacent — change
 * one, change the other. Numeric form feeds drag-to-resize
 * ({@link CONTEXT_PANEL_RESIZE}) and inline `style={{ width }}` overrides.
 */
export const CONTEXT_PANEL_WIDTH_PX = 360;

/**
 * Drag-to-resize contract for every context-panel rail (left-anchored,
 * right-edge handle via `useHorizontalEdgeResize` `edge: 'trailing'`).
 *
 * `maxWidthPad` leaves at least a station workbench column (~720) plus gutters
 * for the canvas beside the rail. One shared preference across routes.
 */
export const CONTEXT_PANEL_RESIZE = {
  storageKey: 'context-panel-width',
  defaultWidthPx: CONTEXT_PANEL_WIDTH_PX,
  minWidthPx: 300,
  /**
   * Desk / picker routes — leave ~760 for the work surface.
   * Scan stations use {@link CONTEXT_PANEL_RESIZE.stationMaxWidthPadPx} (0) so
   * the left rail can meet an open Displays column.
   */
  maxWidthPadPx: 760,
  /** Scan stations — no forced center pad; rails may close the gap entirely. */
  stationMaxWidthPadPx: 0,
} as const;

/**
 * Collapse contract for every context-panel rail (picker / scan + recents /
 * feed — whatever the route mounts in {@link ContextPanelLayout}).
 *
 * Open: paths into the same preference —
 * 1. **Filter trailing:** {@link RailFilterCollapseButton} — auto-seated by
 *    `TechRailSearchBar` `variant="rail"` when under
 *    {@link ContextPanelCollapseProvider} (age column / bottom-right). Hosts
 *    may override via explicit `trailingAction` (LedgerDrill parent map);
 * 2. drag the trailing edge past min (`useHorizontalEdgeResize`
 *    `onCollapseBeyondMin` / `collapseBelowPx` ≈ min − 48) — release-time
 *    only; live layout still floors at {@link CONTEXT_PANEL_RESIZE.minWidthPx}.
 * The trailing {@link HorizontalEdgeResizeHandle} is drag-only (no sash-top
 * collapse chevron).
 *
 * Collapsed: width-drawer to 0 + a slim expand strip on the canvas
 * ({@link CONTEXT_PANEL_COLLAPSE_STRIP_CLASS}) — whole-strip click restores;
 * optional mid-strip MRU pins (`mruPinCount`) from the open rail feed. Persists
 * beside {@link CONTEXT_PANEL_RESIZE} — one shared preference across routes. Do
 * not put a close icon in-row or in the UNBOXED eyebrow — filter trailing
 * track (same column as relative-age) + drag-past-min only.
 */
export const CONTEXT_PANEL_COLLAPSE = {
  storageKey: 'context-panel-collapsed',
  /** Slim expand strip width when the rail is parked (Tailwind twin: `w-8`). */
  stripWidthPx: 32,
  /**
   * Mid-strip MRU peek when the operator parks the rail — top-N from the open
   * rail's visible feed (Unbox golden = `unboxRecent` status-dot pins).
   */
  mruPinCount: 5,
} as const;

/**
 * @deprecated Floating-island gutters retired 2026-08-03 (flush planes). Kept
 * as named exports so docs / guards that still mention the twin can migrate;
 * **do not compose onto column shells**. Bookmark chrome top inset is
 * {@link STATION_IDENTITY_INSET_TOP} (`top-0`) — flush under
 * GlobalHeader, not a twin of this retired margin.
 */
export const CONTEXT_PANEL_OUTER_MARGIN = 'm-2';

/**
 * @deprecated See {@link CONTEXT_PANEL_OUTER_MARGIN}. Unbox flush push columns
 * no longer use vertical outer gutters.
 */
export const CONTEXT_PANEL_OUTER_MARGIN_Y = 'my-2';

/**
 * Parked expand strip when the context panel is collapsed.
 * Slim in-flow chrome on the shared ground — not a second floating card.
 * Width = age / collapse column ({@link SIDEBAR_RAIL_TRAILING_TRACK_CLASS});
 * expand control sits in the **bottom** cell (same seat as the filter collapse).
 */
export const CONTEXT_PANEL_COLLAPSE_STRIP_CLASS = cn(
  'relative',
  'flex h-full w-8 shrink-0 flex-col items-center border-r border-border-soft bg-surface-card',
);

/**
 * The in-DISPLAY context panel column (picker / rail / scan bar).
 *
 * Flush coplanar card on {@link CONTEXT_PANEL_HOST_CLASS}: full host height,
 * trailing hairline against the center, **flat** elevation (no outer margin,
 * no full-card radius, no cast shadow). Depth is the surface step against the
 * canvas/sunken ground — not a decorative island.
 *
 * `relative` anchors the trailing-edge resize grip
 * (`HorizontalEdgeResizeHandle` `placement="inset"` — paint thickens this
 * `border-r` seam in place). `w-[360px]` is the fixed default;
 * {@link ContextPanelLayout} overrides it with an inline width from
 * {@link CONTEXT_PANEL_RESIZE}.
 */
export const CONTEXT_PANEL_COLUMN_CLASS = cn(
  'relative',
  'flex h-full w-[360px] shrink-0 flex-col overflow-hidden',
  'border-r border-border-soft bg-surface-card',
);

/**
 * Host for {@link CONTEXT_PANEL_COLUMN_CLASS} + the workspace inside the content
 * region: the **ground plane** the flush columns sit on.
 *
 * WHITE (operator ruling, 2026-08-30). It was `appCanvasClass` on the theory
 * that card-white rails need a step below them for plane depth to read — but
 * the rail column is only as wide as the operator drags it, so past its edge
 * that step WAS the surface: a grey gutter running the height of the frame
 * beside the thread, reading as a column of its own rather than as ground.
 * Separation between the flush columns is their hairline and their padding,
 * not a tone change.
 *
 * `overflow-hidden` stays on the host so the row never scrolls as a unit; both
 * children own their own internal scrollports.
 */
export const CONTEXT_PANEL_HOST_CLASS = cn(
  // No padding and no gap: flush columns meet at hairlines.
  //
  // `min-w-0` is load-bearing since the right-rail push column became a flex
  // SIBLING of this host: without it the host's min-content width wins the row
  // and the pushing panel would overflow the frame instead of squeezing it.
  'flex min-h-0 min-w-0 flex-1 overflow-hidden',
  appChromeClass,
);
