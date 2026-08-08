/**
 * Guard: mid-carton known-carrier switch hold must never steal wedge focus via
 * `window.alert` / `alert()`. Stay/Switch lives on a Sonner toast.
 *
 *   node --import tsx --test src/components/sidebar/receiving/unbox-carton-switch-confirm.guard.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src/components/sidebar/receiving');

function sourceOf(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

test('useTrackingScan carton-switch hold uses toast Stay/Switch — never alert()', () => {
  const src = sourceOf('useTrackingScan.ts');
  assert.match(
    src,
    /shouldConfirmCartonSwitch/,
    'mid-carton gate must call shouldConfirmCartonSwitch',
  );
  assert.match(
    src,
    /Incomplete carton/,
    'operator-facing incomplete-carton copy must be present',
  );
  assert.match(src, /label:\s*'Stay'/, 'Stay action required (default / safer)');
  assert.match(src, /label:\s*'Switch'/, 'Switch action required');
  assert.match(src, /toast\.warning/, 'hold must be a non-blocking toast');
  assert.doesNotMatch(
    src,
    /(?:window\.)?\balert\s*\(/,
    'native alert steals keyboard-wedge focus — banned on this path',
  );
});
