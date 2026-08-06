/**
 * HoverTooltip + SiteTooltipProvider must place bubbles via the shared
 * portal-anchor SoT — never a page-local size-only check that can clamp a bad
 * rect to the viewport's top-left margin (~MARGIN, MARGIN).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = process.cwd();

const CONSUMERS = [
  'src/components/ui/HoverTooltip.tsx',
  'src/components/providers/SiteTooltipProvider.tsx',
] as const;

test('tooltip SoTs import portal-anchor trust + clamp helpers', () => {
  for (const rel of CONSUMERS) {
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

test('HoverTooltip does not use the old size-only rect gate alone', () => {
  const text = readFileSync(join(ROOT, 'src/components/ui/HoverTooltip.tsx'), 'utf8');
  assert.doesNotMatch(
    text,
    /r\.width\s*>=\s*2\s*&&\s*r\.height\s*>=\s*2/,
    'HoverTooltip must not reintroduce the size-only getBoundingClientRect gate',
  );
});
