/**
 *   npx tsx --test src/hooks/useWedgeScanner.sot.test.ts
 *
 * Structural check on the React adapter. Behavior is proven on
 * `createWedgeKeyListener` (the shipped function the hook mounts).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const HOOK = join(process.cwd(), 'src/hooks/useWedgeScanner.ts');
const GLOBAL = join(process.cwd(), 'src/hooks/useGlobalWedgeScanner.ts');

describe('useWedgeScanner — SoT wiring', () => {
  it('mounts the native capture listener and does not use React synthetic keydown', () => {
    const src = readFileSync(HOOK, 'utf8');
    assert.match(src, /attachWedgeKeyListener/);
    assert.match(src, /from '@\/lib\/keyboard\/wedge-scan-listener'/);
    assert.doesNotMatch(src, /onKeyDown\s*=/);
    assert.doesNotMatch(src, /from 'react'.*onKeyDown/s);
    assert.match(src, /never drop focus|never drops focus|never uses React's/i);
  });

  it('global dispatch yields URL navigation through startTransition', () => {
    const src = readFileSync(GLOBAL, 'utf8');
    assert.match(src, /startTransition/);
    assert.match(src, /dispatchScanToActiveSink/);
    assert.match(src, /useWedgeScanner/);
  });
});
