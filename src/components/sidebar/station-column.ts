import { elevationClass } from '@/design-system/tokens/shadows';
import { appCanvasClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/**
 * Station sidebar column — the **two-card** layout SoT.
 *
 * On station surfaces the 360px column is not one flat panel. It is a gray
 * backdrop holding two elevated cards that share one shell, mirrored:
 *
 * ```
 *   ┌───────────────────────┐  ← flush to top, rounded BOTTOM corners
 *   │  nav (expands down)   │
 *   ├───────────────────────┤
 *   │                       │  gray backdrop shows between them
 *   │  recents + scan bar   │
 *   │  (pushed down as nav  │
 *   │   expands)            │
 *   └───────────────────────┘  ← flush to bottom, rounded TOP corners
 * ```
 *
 * Same width, same elevation, same stacking band — the only difference is which
 * edge each is flush against. They are **flex siblings**, not absolutely
 * positioned, which is what makes "nav expands → recents card gets pushed down
 * and shrinks" fall out of normal layout instead of needing offset math.
 */

/** Gray backdrop + gutter. Cards float on this; it is not a card itself. */
export const STATION_COLUMN_CLASS = cn(
  'flex h-full w-full flex-col gap-1 overflow-hidden px-2',
  appCanvasClass,
);

/** Shared card chrome. Anchored variants below pick the flush edge. */
const STATION_COLUMN_CARD_BASE = cn(
  'flex min-h-0 w-full flex-col overflow-hidden',
  'border border-border-soft bg-surface-card',
  elevationClass('overlay'),
);

/**
 * Top card (nav). Flush to the top of the column, so it drops its top border
 * and rounds only its bottom corners. Content-height — it grows downward as the
 * nav menu opens and pushes {@link STATION_COLUMN_CARD_BOTTOM} down.
 */
export const STATION_COLUMN_CARD_TOP = cn(
  STATION_COLUMN_CARD_BASE,
  'shrink-0 rounded-b-2xl border-t-0',
);

/**
 * Bottom card (recents + scan bar). Flush to the bottom of the page, so it
 * drops its bottom border and rounds only its top corners. `flex-1 min-h-0` so
 * it absorbs whatever height the nav card leaves.
 */
export const STATION_COLUMN_CARD_BOTTOM = cn(
  STATION_COLUMN_CARD_BASE,
  'min-h-0 flex-1 rounded-t-2xl border-b-0',
);
