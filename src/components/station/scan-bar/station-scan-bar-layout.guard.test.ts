/**
 * Station scan bar — frosted absolute mode rail + measured pad (no magic pr-*).
 *
 * Run: node --import tsx --test src/components/station/scan-bar/station-scan-bar-layout.guard.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = join(import.meta.dirname);
const code = (name: string) => readFileSync(join(ROOT, name), 'utf8');

describe('StationScanBar frosted mode rail', () => {
  it('right slot is an absolute frosted veil over full-bleed input text', () => {
    const tokens = code('tokens.ts');
    assert.match(tokens, /STATION_SCAN_BAR_RIGHT_SLOT_CLASS/);
    assert.match(
      tokens,
      /absolute inset-y-0 right-0 z-dropdown[\s\S]*backdrop-blur-sm/,
      'RIGHT_SLOT must overlay with backdrop-blur (text soft-peeks underneath)',
    );
    assert.match(tokens, /STATION_SCAN_BAR_RIGHT_FADE_CLASS/);
    assert.match(tokens, /STATION_SCAN_BAR_RAIL_PEEK_PX/);
  });

  it('StationScanBar measures rail width — never magic pr-24/36/44', () => {
    const bar = code('StationScanBar.tsx');
    assert.match(bar, /ResizeObserver/);
    assert.match(bar, /paddingInlineEnd/);
    assert.match(bar, /STATION_SCAN_BAR_RAIL_PEEK_PX/);
    assert.doesNotMatch(bar, /pr-24|pr-36|pr-44|rightPadClass/);
  });

  it('ThemedStationScanBar has no rightPadClass escape hatch', () => {
    const themed = code('ThemedStationScanBar.tsx');
    assert.doesNotMatch(themed, /rightPadClass/);
  });
});
