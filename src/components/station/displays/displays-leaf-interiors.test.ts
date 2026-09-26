/** Tripwire — Displays leaf interiors follow station Color (no white/hex wells). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { stationSkinCssText } from '@/design-system/themes/station-skins';
test('Displays scope remaps canvas and soft ink for leaf interiors', () => {
  const css = stationSkinCssText();
  assert.match(css, /\[data-station-displays\]/);
  assert.match(css, /--ds-color-background-canvas:\s*var\(--ds-station-well\)/);
  assert.match(css, /--ds-color-text-soft:\s*var\(--ds-station-ink-muted\)/);
  assert.match(css, /--ds-color-surface-strong:\s*var\(--ds-station-slot\)/);
});
