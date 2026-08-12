/**
 * Guard: Unbox tracking scan must not hard-stop mid-carton with a Stay/Switch
 * toast (or `alert()`). Known-carrier / unfound tracking opens immediately.
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

test('useTrackingScan has no mid-carton Stay/Switch hard-stop', () => {
  const src = sourceOf('useTrackingScan.ts');
  assert.doesNotMatch(
    src,
    /shouldConfirmCartonSwitch/,
    'mid-carton switch gate must not be wired',
  );
  assert.doesNotMatch(
    src,
    /Incomplete carton/,
    'incomplete-carton Stay/Switch toast must not return',
  );
  assert.doesNotMatch(src, /label:\s*'Stay'/, 'Stay action must not return');
  assert.doesNotMatch(src, /label:\s*'Switch'/, 'Switch action must not return');
  assert.doesNotMatch(
    src,
    /skipCartonSwitchConfirm/,
    'skipCartonSwitchConfirm opts must not return',
  );
  assert.doesNotMatch(
    src,
    /(?:window\.)?\balert\s*\(/,
    'native alert steals keyboard-wedge focus — banned on this path',
  );
});
