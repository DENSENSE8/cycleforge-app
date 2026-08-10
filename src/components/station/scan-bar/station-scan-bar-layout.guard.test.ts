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

  it('ready HUD paints readyArm face — no Scan prose; input column only', () => {
    const bar = code('StationScanBar.tsx');
    const tokens = code('tokens.ts');
    const glow = code('ScanBandGlowHost.tsx');
    const leading = code('StationScanLeadingIcon.tsx');
    assert.match(bar, /readyArm\?:/);
    assert.match(bar, /StationScanReadyArm/);
    assert.match(bar, /scanBandReadyBlink/);
    assert.match(bar, /scanBandReadySweep/);
    assert.match(bar, /caret-transparent/);
    assert.match(bar, /STATION_SCAN_BAR_READY_CURSOR_CLASS/);
    assert.match(bar, /STATION_SCAN_BAR_READY_RETICLE_CLASS/);
    assert.match(bar, /resolvedPlaceholder/);
    assert.match(bar, /focusScanInput/);
    assert.match(bar, /onActivate: focusScanInput/);
    assert.match(bar, /showReadyHud \? 'pl-3' : padLeft/);
    assert.match(bar, /readyArm\.label/);
    assert.match(bar, /text-text-faint/);
    assert.match(leading, /onActivate\?:/);
    assert.match(tokens, /border-emerald-500\/35/);
    // The sweep has ONE owner (StationScanBar), never the glow host module.
    // (HUD spans the full bar above the frosted mode rail; see tokens.ts.)
    assert.doesNotMatch(glow, /scanBandReadySweep/);
    assert.doesNotMatch(bar, /from ['"]motion\/react['"]/);
  });

  it('mode-rail stations wipe Scan placeholders and pass readyArm', () => {
    const receivingRoot = join(ROOT, '../../sidebar/receiving');
    const techRoot = join(ROOT, '../../sidebar/tech');
    const unbox = readFileSync(join(receivingRoot, 'ReceivingUnboxScanBar.tsx'), 'utf8');
    const testing = readFileSync(join(receivingRoot, 'TestingScanBar.tsx'), 'utf8');
    const shipping = readFileSync(join(techRoot, 'ShippingScanBar.tsx'), 'utf8');
    for (const [name, src] of [
      ['Unbox', unbox],
      ['Testing', testing],
      ['Shipping', shipping],
    ] as const) {
      assert.match(src, /readyArm=\{readyArm\}/, `${name} must pass readyArm`);
      assert.match(src, /placeholder=""/, `${name} must use empty placeholder`);
      assert.doesNotMatch(
        src,
        /placeholder=\{armedMode \? `Scan \$\{/,
        `${name} must not use Scan \${label} placeholders`,
      );
    }
    assert.match(
      unbox,
      /UNBOX_SCAN_MODE_FACE_LABEL[\s\S]*order:\s*'PO #'/,
      'Unbox ready face must use PO # not Purchase order',
    );
    assert.match(unbox, /UNBOX_SCAN_MODE_FACE_LABEL\[armedMode\]/);
    assert.doesNotMatch(
      unbox,
      /label: `\$\{UNBOX_SCAN_MODE_FULL_LABEL/,
      'readyArm must not use FULL_LABEL (Purchase order #) for the face',
    );
  });
});
