/**
 *   npx tsx --test src/hooks/usePanelStoreKeyboard.sot.test.ts
 *
 * Structural check: the React adapter mounts the pure handler and never
 * blurs / never uses a React synthetic onKeyDown on a DOM node.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const HOOK = join(process.cwd(), 'src/hooks/usePanelStoreKeyboard.ts');

describe('usePanelStoreKeyboard — SoT wiring', () => {
  it('mounts handlePanelStoreKeydown on window and does not blur', () => {
    const src = readFileSync(HOOK, 'utf8');
    assert.match(src, /handlePanelStoreKeydown/);
    assert.match(src, /from '@\/lib\/right-rail\/panel-store-keyboard'/);
    assert.match(src, /addEventListener\('keydown'/);
    assert.doesNotMatch(src, /\.blur\(/);
    assert.doesNotMatch(src, /onKeyDown\s*=/);
  });
});
