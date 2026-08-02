import { elevationCastClass } from '@/design-system/tokens/shadows';
import { appCanvasClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/**
 * Context-panel layout tokens — the route's own sidebar, in the CONTENT region.
 *
 * ```
 *   ┌──────────────────────────────────────┐
 *   │ ┌ context panel ┐ ┌ workspace ──────┐│
 *   │ │  scan bar     │ │                 ││
 *   │ │  recents rail │ │                 ││
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
  maxWidthPadPx: 760,
} as const;

/**
 * Collapse contract for every context-panel rail (picker / scan + recents /
 * feed — whatever the route mounts in {@link ContextPanelLayout}).
 *
 * Open: collapse chevron on the trailing {@link HorizontalEdgeResizeHandle}
 * (`onCollapse`). Collapsed: width-drawer to 0 + a slim expand strip on the
 * canvas ({@link CONTEXT_PANEL_COLLAPSE_STRIP_CLASS}). Persists beside
 * {@link CONTEXT_PANEL_RESIZE} — one shared preference across routes.
 */
export const CONTEXT_PANEL_COLLAPSE = {
  storageKey: 'context-panel-collapsed',
  /** Slim expand strip width when the rail is parked (Tailwind twin: `w-8`). */
  stripWidthPx: 32,
} as const;

/**
 * Outer margin between the context-panel card and the canvas host (`m-2` =
 * 8px). Station bookmark chrome (`stationContextBarHostClass` /
 * `stationMoreDetailsHostClass` in `station-bookmark.ts`) uses the same
 * top (+ right for more-details) so the floating identity shell lines up with
 * the sidebar card under GlobalHeader — one knob: change here and update the
 * bookmark `top-*` / `right-*` twins to match.
 */
const CONTEXT_PANEL_OUTER_MARGIN = 'm-2';

/**
 * Parked expand strip when the context panel is collapsed.
 * Canvas chrome only — not a second white card.
 */
export const CONTEXT_PANEL_COLLAPSE_STRIP_CLASS = cn(
  'relative m-2 flex w-8 shrink-0 flex-col items-center pt-3',
);

/**
 * The in-DISPLAY context panel column (picker / rail / scan bar).
 *
 * A discrete floating slate: full radius, border on every edge, its own gutter
 * from {@link CONTEXT_PANEL_HOST_CLASS}. It keeps its own internal scrollport,
 * so the radius and shadow never move with the rail content. This is the ONLY
 * card in the frame.
 *
 * Its cast goes LEFT ({@link elevationCastClass}) rather than straight down.
 * The panel is pinned to the left of a wide frame, so its left edge is the one
 * read against the canvas; a downward-only cast left that edge flat. Casting
 * away from centre puts the whole app under one light in the middle of the
 * screen.
 *
 * `relative` anchors the trailing-edge resize grip
 * (`HorizontalEdgeResizeHandle` `placement="outset"`). `w-[360px]` is the
 * fixed default; {@link ContextPanelLayout} overrides it with an inline width
 * from {@link CONTEXT_PANEL_RESIZE}.
 */
export const CONTEXT_PANEL_COLUMN_CLASS = cn(
  // The gutter is the panel's OWN margin, not host padding. Host padding would
  // also inset the workspace beside it; bookmark chrome matches this margin
  // via `top-2` / `right-2` (see display/station-workbench.md).
  'relative',
  CONTEXT_PANEL_OUTER_MARGIN,
  'flex w-[360px] shrink-0 flex-col overflow-hidden',
  'border border-border-soft bg-surface-card rounded-2xl',
  elevationCastClass('left'),
);

/**
 * Host for {@link CONTEXT_PANEL_COLUMN_CLASS} + the workspace inside the content
 * region: the **ground plane** the panel casts onto.
 *
 * `appCanvasClass` is load-bearing, not decoration. The panel is `bg-surface-card`
 * (white); on a white host its overlay elevation has nothing to cast against and
 * the card reads as a flat rectangle with a stray border. Canvas sits a real step
 * below card white, which is what makes the depth read (see
 * `tokens/shadows.ts` — "depth needs a ground plane").
 *
 * `overflow-hidden` stays on the host so the row never scrolls as a unit; both
 * children own their own internal scrollports.
 */
export const CONTEXT_PANEL_HOST_CLASS = cn(
  // No padding and no gap: the panel carries its own margin; bookmark chrome
  // insets with the same gutter so identity + more-details share the panel’s
  // top edge (see station-bookmark.ts).
  //
  // `min-w-0` is load-bearing since the right-rail push column became a flex
  // SIBLING of this host: without it the host's min-content width wins the row
  // and the pushing panel would overflow the frame instead of squeezing it.
  'flex min-h-0 min-w-0 flex-1 overflow-hidden',
  appCanvasClass,
);
