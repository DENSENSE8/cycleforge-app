/**
 * Ink floors (owner 2026-10-03: "the subtitle … must be increased contrast so
 * you are able to easily read the subtitle"). Every theme and every mode
 * region keeps its subtitle inks readable on every plane a row can sit on —
 * card, canvas, hover wash and sunken well: secondary ≥9:1 (light schemes),
 * soft ≥6:1, faint ≥4.5:1 (faint is text, never a sub-AA decorative tier).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MODE_LOOKS, MODE_REGISTRY, type ModeSurfaces } from '@cycleforge/design-tokens';
import { contrastRatio } from '@/lib/color-contrast';
import { THEME_PALETTES } from './registry';

const PLANES = ['background-surface', 'background-canvas', 'surface-hover', 'surface-sunken'] as const;

function worst(ink: string, planes: readonly string[]): number {
  return Math.min(...planes.map((plane) => contrastRatio(ink, plane) ?? 0));
}

test('every theme: faint ≥4.5, soft ≥6 on every plane; light schemes keep secondary ≥9', () => {
  for (const palette of Object.values(THEME_PALETTES)) {
    const planes = PLANES.map((key) => palette.vars[key]);
    assert.ok(worst(palette.vars['text-faint'], planes) >= 4.5, `${palette.name} text-faint`);
    assert.ok(worst(palette.vars['text-soft'], planes) >= 6, `${palette.name} text-soft`);
    if (palette.scheme === 'light') assert.ok(worst(palette.vars['text-secondary'], planes) >= 9, `${palette.name} text-secondary`);
  }
});

test('every mode palette and look refinement: muted ≥9 and faint ≥6 on canvas, panel, hover and well', () => {
  const palettes: Array<[string, ModeSurfaces]> = Object.entries(MODE_REGISTRY).map(([name, spec]) => [name, spec.surfaces]);
  for (const look of Object.values(MODE_LOOKS)) {
    for (const [mode, refine] of Object.entries(look.refines)) {
      if (!refine?.surfaces || !(mode in MODE_REGISTRY)) continue;
      const base = MODE_REGISTRY[mode as keyof typeof MODE_REGISTRY].surfaces;
      palettes.push([`${look.name}.${mode}`, { ...base, ...refine.surfaces }]);
    }
  }
  for (const [name, surfaces] of palettes) {
    const planes = [surfaces.canvas, surfaces.panel, surfaces.hover, surfaces.well];
    assert.ok(worst(surfaces.muted, planes) >= 9, `${name} muted`);
    assert.ok(worst(surfaces.faint, planes) >= 6, `${name} faint`);
  }
});
