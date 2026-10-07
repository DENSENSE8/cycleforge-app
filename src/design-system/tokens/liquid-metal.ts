/**
 * Liquid metal — the premium black material of floating command chrome (the
 * selection dock, operator 2026-10-06): a brushed graphite gradient under a
 * soft top sheen and a fine monochrome grain, with a hairline highlight on the
 * top edge. Scheme-independent like `stage`: black in every theme, so its
 * controls are white (`LIQUID_METAL_CHIP_CLASS`).
 */

import type { CSSProperties } from 'react';
import { GRAIN_TILE_SIZE, grainTileUrl } from './grain';

/** Liquid metal wears the house grain strong. */
const GRAIN_URL = grainTileUrl(0.28);

export const LIQUID_METAL_STYLE: CSSProperties = {
  backgroundColor: '#0b0b0d',
  backgroundImage: [
    GRAIN_URL,
    // Top sheen: light catching the curved edge.
    'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.03) 42%, rgba(0,0,0,0.28) 100%)',
    // Brushed graphite: the metal's slow light bands.
    'linear-gradient(112deg, #0a0a0c 0%, #26272c 34%, #0f0f12 52%, #34353b 76%, #0c0c0e 100%)',
  ].join(', '),
  backgroundSize: `${GRAIN_TILE_SIZE}, 100% 100%, 100% 100%`,
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
