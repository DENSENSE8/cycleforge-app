/**
 * HoverTooltip + SiteTooltipProvider + CopyChipHoverMenu must place portals via
 * the shared portal-anchor SoT — never a page-local size-only check that can
 * clamp a bad rect to the viewport's top-left margin (~MARGIN, MARGIN).
 *
 * Dense-table identity menus must use the side clamp (prefer trailing) so OPEN /
 * EDIT never sits in the vertical row-scan path.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = process.cwd();

const TOOLTIP_CONSUMERS = [
  'src/components/ui/HoverTooltip.tsx',
  'src/components/providers/SiteTooltipProvider.tsx',
] as const;

test('tooltip SoTs import portal-anchor trust + clamp helpers', () => {
  for (const rel of TOOLTIP_CONSUMERS) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(
      text,
      /from ['"]@\/lib\/ui\/portal-anchor['"]/,
      `${rel} must import @/lib/ui/portal-anchor`,
    );
    assert.match(
      text,
      /clampPortalTooltipPosition/,
      `${rel} must call clampPortalTooltipPosition`,
    );
    assert.ok(
      /isTrustedPortalAnchor|readTrustedTriggerRect/.test(text),
      `${rel} must trust anchors via isTrustedPortalAnchor or readTrustedTriggerRect`,
    );
    // Inline fixed beats Tailwind-only `fixed` (ignored top/left → body flow top-left).
    assert.match(
      text,
      /position:\s*['"]fixed['"]/,
      `${rel} must set position:'fixed' inline on the portal bubble`,
    );
  }
});

test('CopyChipHoverMenu uses side portal-anchor clamp (not below-chip local math)', () => {
  const rel = 'src/components/ui/CopyChipHoverMenu.tsx';
  const text = readFileSync(join(ROOT, rel), 'utf8');
  assert.match(
    text,
    /from ['"]@\/lib\/ui\/portal-anchor['"]/,
    `${rel} must import @/lib/ui/portal-anchor`,
  );
  assert.match(
    text,
    /clampPortalSideMenuPosition/,
    `${rel} must call clampPortalSideMenuPosition for dense-table side flyouts`,
  );
  assert.match(
    text,
    /readTrustedTriggerRect/,
    `${rel} must trust anchors via readTrustedTriggerRect`,
  );
  assert.match(
    text,
    /position:\s*['"]fixed['"]/,
    `${rel} must set position:'fixed' inline on the portal menu`,
  );
  // Regressions: below-prefer local placement blocked vertical row travel.
  assert.doesNotMatch(
    text,
    /Prefer below the chip/,
    `${rel} must not prefer below-chip placement`,
  );
  assert.doesNotMatch(
    text,
    /roomBelow/,
    `${rel} must not reintroduce below/above room math (side clamp owns placement)`,
  );
});

test('SiteTooltipProvider paints instantly (no enter fade / layout tween)', () => {
  const text = readFileSync(
    join(ROOT, 'src/components/providers/SiteTooltipProvider.tsx'),
    'utf8',
  );
  assert.doesNotMatch(
    text,
    /from ['"]@\/design-system\/motion['"]/,
    'SiteTooltip must not import motion — enter animation reads as load lag on dense grids',
  );
  assert.doesNotMatch(
    text,
    /transition:\s*['"]opacity/,
    'SiteTooltip must not fade opacity on open',
  );
  assert.doesNotMatch(
    text,
    /AnimatePresence|initial=\{\{\s*opacity:\s*0/,
    'SiteTooltip must not slide/fade content on open',
  );
  assert.match(
    text,
    /visibility:\s*placementReady\s*\?\s*['"]visible['"]/,
    'SiteTooltip may hide only until placement is clamped — then instant visible',
  );
});

test('copy-chip tip + hover menu shells are flush-square (not soft floating pills)', () => {
  const files = [
    'src/components/providers/SiteTooltipProvider.tsx',
    'src/components/ui/CopyChipHoverMenu.tsx',
    'src/components/ui/HoverTooltip.tsx',
  ] as const;
  for (const rel of files) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    assert.match(
      text,
      /cornerClass\(['"]flush['"]\)/,
      `${rel} must compose cornerClass('flush') for ops-density shells`,
    );
    assert.doesNotMatch(
      text,
      /rounded-(md|lg|xl|2xl|full)\b/,
      `${rel} must not soft-radius the floating shell (floating ≠ pill escape)`,
    );
  }
});

test('HoverTooltip does not use the old size-only rect gate alone', () => {
  const text = readFileSync(join(ROOT, 'src/components/ui/HoverTooltip.tsx'), 'utf8');
  assert.doesNotMatch(
    text,
    /r\.width\s*>=\s*2\s*&&\s*r\.height\s*>=\s*2/,
    'HoverTooltip must not reintroduce the size-only getBoundingClientRect gate',
  );
});
