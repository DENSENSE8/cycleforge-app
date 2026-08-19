import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { navIconStrokeClass, NAV_ICON_STROKE_CLASS } from '@/components/icons/nav-weight';

test('navIconStrokeClass composes the one stroke token with caller classes', () => {
  assert.match(navIconStrokeClass(), /stroke-width:1\.5/);
  assert.match(navIconStrokeClass('h-4 w-4'), /h-4 w-4/);
  assert.match(navIconStrokeClass('h-4 w-4'), /stroke-width:1\.5/);
});

/**
 * ONE weight, ONE token (2026-08-19). The `page` / `mode` split is gone with
 * the `withNavIcon*Stroke` wrappers that baked a weight into ~23 glyph exports:
 * a wrapped glyph and its surface emit the same shape of rule, tie on
 * specificity, and the winner falls out of Tailwind's emission order — which is
 * how the header's Unbox face stayed heavy through three separate fixes.
 */
test('there is exactly one nav stroke weight, and it is the light one', () => {
  assert.match(NAV_ICON_STROKE_CLASS, /!\[stroke-width:1\.5\]/);
  // A second weight in this module is the drift the unwrap removed.
  assert.doesNotMatch(NAV_ICON_STROKE_CLASS, /stroke-width:2(\.25|\.75)?\]/);
});

/**
 * The selectors must reach a glyph nested one or two levels down — the token is
 * applied to a WRAPPER as often as to the glyph itself (`Button`'s icon box, a
 * chrome-menu row cell), and a Lucide-shaped icon carries its weight as an
 * attribute on its own `<svg>` that its shapes inherit.
 */
test('the token reaches a nested glyph, not just the element it lands on', () => {
  for (const sel of ['[&_svg]', '[&_path]', '[&_circle]', '[&_rect]', '[&_polygon]']) {
    assert.ok(NAV_ICON_STROKE_CLASS.includes(sel), `${sel} must be covered`);
  }
});

/**
 * The wrappers are gone and must not return. A glyph that carries its own
 * weight cannot be drawn at a second altitude, and it does not lose quietly —
 * it outranks the surface. Weight belongs to the surface; the icon stays bare.
 */
const code = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test('no glyph module bakes a stroke weight back into its exports', () => {
  assert.doesNotMatch(code('src/components/icons/nav-weight.tsx'), /withNavIcon\w*Stroke/);
  for (const file of ['src/components/icons/stations.tsx', 'src/lib/photos/scope-icons.ts']) {
    const glyphs = code(file);
    assert.doesNotMatch(glyphs, /withNavIcon\w*Stroke/, `${file} must export bare glyphs`);
    assert.doesNotMatch(glyphs, /stroke-width/, `${file} must not hardcode a weight`);
  }
});
