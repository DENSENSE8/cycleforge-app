/**
 * ReasonSelector pills appearance must compose kiosk-chrome KIOSK_PILL*.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const SRC = join(process.cwd(), 'src/components/repair/ReasonSelector.tsx');

describe('ReasonSelector pills', () => {
  const src = readFileSync(SRC, 'utf8');

  it('exports appearance pills alongside default and flush', () => {
    assert.match(src, /appearance\?: 'default' \| 'flush' \| 'pills'/);
  });

  it('composes KIOSK_PILL + ACTIVE_ISSUE / IDLE (no page-local pill twin)', () => {
    assert.match(src, /KIOSK_PILL/);
    assert.match(src, /KIOSK_PILL_ACTIVE_ISSUE/);
    assert.match(src, /KIOSK_PILL_IDLE/);
    assert.doesNotMatch(src, /cornerClass\('pill'\)/);
  });
});
