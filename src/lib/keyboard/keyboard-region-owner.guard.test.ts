/**
 * Keyboard region owner — pointer claims Right/Middle; ← → follow the owner.
 *
 *   node --import tsx --test src/lib/keyboard/keyboard-region-owner.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

describe('Keyboard region owner (Displays focus feedback)', () => {
  it('exports a DOM-stamped owner store (right / middle)', () => {
    const sot = read('src/lib/keyboard/keyboard-region-owner.ts');
    assert.match(sot, /KEYBOARD_REGION_ATTR/);
    assert.match(sot, /KEYBOARD_REGION_ACTIVE_ATTR/);
    assert.match(sot, /setKeyboardRegionOwner/);
    assert.match(sot, /isKeyboardRegionOwner/);
  });

  it('Displays column stamps right + claims on pointer + paints active face', () => {
    const col = read('src/components/station/displays/StationDisplaysPushColumn.tsx');
    assert.match(col, /KEYBOARD_REGION_ATTR/);
    assert.match(col, /KEYBOARD_REGION_ACTIVE_ATTR/);
    assert.match(col, /claimKeyboardRegion\('right'\)|claim\('right'\)|claimRight/);
    assert.match(col, /onPointerDownCapture/);
    assert.match(col, /ring-inset.*ring-accent-border|ring-accent-border/);
    assert.match(col, /data-keyboard-region-focus/);
  });

  it('scan middle stamps middle + reclaims on pointer', () => {
    const host = read('src/components/station/workbench/StationScanPaneHost.tsx');
    assert.match(host, /KEYBOARD_REGION_ATTR/);
    assert.match(host, /claimKeyboardRegion\('middle'\)|claim\('middle'\)|claimMiddle/);
    assert.match(host, /onPointerDownCapture/);
  });

  it('PushStack routes ← → to Displays history while Right owns', () => {
    const stack = read('src/components/station/displays/StationDisplaysPushStack.tsx');
    assert.match(stack, /isKeyboardRegionOwner\('right'\)/);
    assert.match(stack, /ArrowLeft/);
    assert.match(stack, /ArrowRight/);
    assert.match(stack, /onHistoryBack/);
    assert.match(stack, /goForward/);
  });

  it('armed lists claim ↑↓ on window while Right owns (not focus-only)', () => {
    const hook = read('src/components/station/displays/useArmedCursorList.ts');
    const index = read('src/components/station/displays/StationDisplayIndexList.tsx');
    assert.match(hook, /regionActive/);
    assert.match(hook, /ArrowDown/);
    assert.match(hook, /addEventListener\(\s*['"]keydown['"]/);
    assert.match(index, /regionActive:\s*rightOwnsKeyboard/);
  });

  it('Unbox procedure ← → yields while Right owns', () => {
    const arrows = read(
      'src/components/receiving/workspace/line-edit/useUnboxProcedureArrowKeys.ts',
    );
    assert.match(arrows, /isKeyboardRegionOwner\('right'\)/);
    assert.match(arrows, /return;/);
  });
});
