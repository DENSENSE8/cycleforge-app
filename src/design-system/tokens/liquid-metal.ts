/**
 * Liquid metal — the premium black material of floating command chrome (the
 * selection dock, operator 2026-10-06): a brushed graphite gradient under a
 * soft top sheen and a fine monochrome grain, with a hairline highlight on the
 * top edge. Scheme-independent like `stage`: black in every theme, so its
 * controls are white (`LIQUID_METAL_CHIP_CLASS`).
 */

import type { CSSProperties } from 'react';

/** Fine monochrome grain (SVG fractal noise), tiled. */
const GRAIN_URL =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.28'/></svg>\")";

export const LIQUID_METAL_STYLE: CSSProperties = {
  backgroundColor: '#0b0b0d',
  backgroundImage: [
    GRAIN_URL,
    // Top sheen: light catching the curved edge.
    'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 42%, rgba(0,0,0,0.28) 100%)',
    // Brushed graphite: the metal's slow light bands.
    'linear-gradient(112deg, #0a0a0c 0%, #26272c 34%, #0f0f12 52%, #34353b 76%, #0c0c0e 100%)',
  ].join(', '),
  backgroundSize: '160px 160px, 100% 100%, 100% 100%',
  boxShadow:
    'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.65), 0 1px 2px rgba(0,0,0,0.35), 0 16px 36px -10px rgba(0,0,0,0.6)',
};

/** Text on liquid metal. */
export const LIQUID_METAL_TEXT_CLASS = 'text-glass';

/** A white control resting on liquid metal — the light CTA. */
export const LIQUID_METAL_CHIP_CLASS =
  'bg-glass text-scrim shadow-[inset_0_-1px_0_rgba(2,6,23,0.12),0_1px_2px_rgba(0,0,0,0.4)] transition-[background-color,transform] hover:bg-glass/90 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glass/60 focus-visible:ring-offset-2 focus-visible:ring-offset-scrim disabled:opacity-50';

/** A quiet control on liquid metal (Clear). */
export const LIQUID_METAL_GHOST_CLASS =
  'text-glass/70 transition-colors hover:bg-glass/10 hover:text-glass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-glass/50';
