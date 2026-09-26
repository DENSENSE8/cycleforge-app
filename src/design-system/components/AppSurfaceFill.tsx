'use client';

/** THE single background-fill primitive for page/shell-root and chrome-band surfaces — chrome cards, canvas roots, and the page wash. */

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

/** A bare decorative fill layer: */
export function AppSurfaceFill({ tone, className, ...rest }: AppSurfaceFillProps) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0', TONE_CLASS[tone], className)}
      {...rest}
    />
  );
}
