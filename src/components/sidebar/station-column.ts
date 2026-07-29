import { elevationCastClass } from '@/design-system/tokens/shadows';
import { appCanvasClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/**
 * Station surface layout tokens.
 *
 * The scan bar and recents rail live in the CONTENT region
 * ({@link STATION_PANEL_COLUMN_CLASS}), beside the workspace — they have to stay
 * on screen when the nav is closed, which is most of the time at a bench.
 *
 * ```
 *   ┌──────────────────────────────────────┐
 *   │ ┌ station panel ┐ ┌ workspace ──────┐│
 *   │ │  scan bar     │ │                 ││
 *   │ │  recents rail │ │                 ││
 *   └──────────────────────────────────────┘
 *     content region (the nav is a slide-over over the top)
 * ```
 *
 * `STATION_COLUMN_CLASS` used to live here — the flat nav-only sidebar that
 * station routes pushed the content across for. It is gone: the nav is now one
 * slide-over on every route (`SidebarSlideOver`), so there is no station-shaped
 * nav column left to style. The bench half of the model is unchanged.
 */

/**
 * The in-DISPLAY station panel column (scan bar + recents rail).
 *
 * A discrete floating slate: full radius, border on every edge, its own gutter
 * from {@link STATION_PANEL_HOST_CLASS}. It keeps its own internal scrollport,
 * so the radius and shadow never move with the rail content. This is the ONLY
 * card in the station frame.
 *
 * Its cast goes LEFT ({@link elevationCastClass}) rather than straight down.
 * The panel is pinned to the left of a wide frame, so its left edge is the one
 * read against the canvas; a downward-only cast left that edge flat. Casting
 * away from centre puts the whole app under one light in the middle of the
 * screen.
 */
export const STATION_PANEL_COLUMN_CLASS = cn(
  // The gutter is the panel's OWN margin, not host padding. Host padding would
  // also inset the workspace beside it, and the workspace must stay flush to
  // the GlobalHeader — the station bookmark bar docks directly under that
  // hairline with no gap (see display/station-workbench.md).
  'm-2 flex w-[360px] shrink-0 flex-col overflow-hidden',
  'border border-border-soft bg-surface-card rounded-2xl',
  elevationCastClass('left'),
);

/**
 * Host for {@link STATION_PANEL_COLUMN_CLASS} + the workspace inside the content
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
export const STATION_PANEL_HOST_CLASS = cn(
  // No padding and no gap: the panel carries its own margin, so the workspace
  // column beside it starts flush under the GlobalHeader.
  'flex min-h-0 flex-1 overflow-hidden',
  appCanvasClass,
);
