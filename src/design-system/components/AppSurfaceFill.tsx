'use client';

/**
 * THE single background-fill primitive for page/shell-root and chrome-band
 * surfaces — chrome cards, canvas roots, and the page wash.
 *
 * Before this module, the same three fills were declared independently in at
 * least seven places (`context-panel-column.ts`'s rail card, the receiving
 * scan band's `receivingScanBandClass` + `ScanBandGlowHost`'s own default,
 * `SidebarRailShell`'s rail-body section, `StationPanelRoot`, and three
 * inline `bg-surface-canvas` divs in `UnboxLineWorkspace`'s carton-swap
 * overlay) — some importing the SoT tokens in `app-surface.ts`, some
 * retyping the Tailwind literal by hand. That drift is exactly how the rail
 * card's background and the shared host wash behind it ended up painted by
 * two unrelated modules with no shared source, and it is why "soften one of
 * them" (docs/todo/unbox-shared-host-rail-background-HANDOFF.md) turned into
 * a visible corner/seam regression instead of a one-line change.
 *
 * `appSurfaceFillClass(tone)` is the resolver — compose it via `cn()` into an
 * element that already owns other structural classes (a card, a cover pane),
 * so a fix to fill color/rounding never has to touch DOM structure.
 * `<AppSurfaceFill tone />` is the convenience form for a bare decorative
 * fill layer (absolutely positioned, sized by a `relative` ancestor) — no
 * layout classes of its own to conflict with.
 *
 * Tones map 1:1 onto the existing `app-surface.ts` SoT — this module does not
 * replace it, it is the one place every consumer is required to route
 * through instead of retyping the literal.
 */

import type { HTMLAttributes } from 'react';
import { appChromeClass, appCanvasClass, appWashClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

type AppSurfaceTone = 'chrome' | 'canvas' | 'wash';

const TONE_CLASS: Record<AppSurfaceTone, string> = {
  /** Card / chrome plane — `bg-surface-card` (rail cards, scan bands, popovers). */
  chrome: appChromeClass,
  /** Flat full-bleed work host — `bg-surface-canvas` (station roots, overlay plates). */
  canvas: appCanvasClass,
  /** Page wash gradient (`.app-wash`, driven by `data-app-wash`) — host roots only. */
  wash: appWashClass,
};

/**
 * Resolve a semantic tone to its one SoT class string. Compose via `cn()`
 * into an existing element's className — never retype `bg-surface-card` /
 * `bg-surface-canvas` / the wash class as an independent literal.
 */
export function appSurfaceFillClass(tone: AppSurfaceTone): string {
  return TONE_CLASS[tone];
}

interface AppSurfaceFillProps extends HTMLAttributes<HTMLDivElement> {
  tone: AppSurfaceTone;
}

/**
 * A bare decorative fill layer: `pointer-events-none absolute inset-0` +
 * the resolved tone class. Mount inside a `relative` (or already-positioned)
 * ancestor. Does not set `z-index` — pass one via `className`/`style` when
 * the fill must sit behind (`-z-10`, the common case) or above sibling
 * content (an overlay plate with an explicit `style={{ zIndex }}`).
 */
export function AppSurfaceFill({ tone, className, ...rest }: AppSurfaceFillProps) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0', TONE_CLASS[tone], className)}
      {...rest}
    />
  );
}
