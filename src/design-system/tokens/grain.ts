/**
 * Grain — the house surface noise. One tiled fractal-noise SVG at a stated
 * strength, never a per-surface hand-rolled data URI. Liquid metal (the black
 * selection dock) wears it strong; the station bubbles (operator 2026-10-07:
 * "they should feature grain, not just a plain white") wear it faint over a
 * material picked by what the operator is doing with that bubble.
 */

import type { CSSProperties } from 'react';

/** The tile edge in px; `GRAIN_TILE_SIZE` is its background-size. */
const GRAIN_TILE_PX = 160;
export const GRAIN_TILE_SIZE = `${GRAIN_TILE_PX}px ${GRAIN_TILE_PX}px`;

/** Fine monochrome grain (SVG fractal noise), tiled, at `opacity` (0..1). */
export function grainTileUrl(opacity: number): string {
  return `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${GRAIN_TILE_PX}' height='${GRAIN_TILE_PX}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='${opacity}'/></svg>")`;
}

/**
 * A station bubble's material, by the operator's intent with it:
 * - `action` — what to do NOW (the next step): the accent wash, the eye's first stop.
 * - `record` — what already happened (who received it, when): a calm sunken neutral.
 * - `paper`  — the thing that gets printed (the label): label-stock white.
 * Theme-aware: every colour is a `--ds-color-*` variable.
 */
export type StationBubbleMaterial = 'action' | 'record' | 'paper';

const BUBBLE_WASH: Record<StationBubbleMaterial, string> = {
  action:
    'linear-gradient(135deg, var(--ds-color-surface-accent) 0%, var(--ds-color-background-surface) 70%)',
  record:
    'linear-gradient(160deg, var(--ds-color-surface-sunken) 0%, var(--ds-color-background-surface) 85%)',
  paper: 'linear-gradient(180deg, var(--ds-color-background-surface) 0%, var(--ds-color-background-surface) 100%)',
};

/** Faint on light surfaces: texture you feel, not see. */
const BUBBLE_GRAIN_OPACITY = 0.09;

export function stationBubbleMaterialStyle(material: StationBubbleMaterial): CSSProperties {
  return {
    backgroundImage: `${grainTileUrl(BUBBLE_GRAIN_OPACITY)}, ${BUBBLE_WASH[material]}`,
    backgroundSize: `${GRAIN_TILE_SIZE}, 100% 100%`,
  };
}
