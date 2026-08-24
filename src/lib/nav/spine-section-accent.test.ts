import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appCanvasClass, appChromeClass } from '@/lib/design/app-surface';
import { SPINE_ACCENT } from './spine-section-accent';

describe('spine selected fill vs chrome', () => {
  it('current-page fill differs from MasterNav chrome so leaf L1 rows are visible', () => {
    // SidebarShell paints `appChromeClass` (`bg-surface-card`). A selected
    // row that reused that token was identical to idle on Packing / Scan out
    // (leaves have no nesting rail). Canvas is the chrome/canvas plane step
    // the rest of the frame already uses.
    assert.ok(SPINE_ACCENT.activePage.includes(appCanvasClass));
    assert.ok(!SPINE_ACCENT.activePage.includes(appChromeClass));
    assert.ok(SPINE_ACCENT.childActive.includes(appCanvasClass));
    assert.ok(!SPINE_ACCENT.idlePage.includes(appCanvasClass));
  });

  it('owns-active parent wash is lighter than current-page and not chrome', () => {
    assert.ok(SPINE_ACCENT.ownsActive.includes('bg-surface-hover'));
    assert.ok(!SPINE_ACCENT.ownsActive.includes(appCanvasClass));
    assert.ok(!SPINE_ACCENT.ownsActive.includes(appChromeClass));
    assert.notEqual(SPINE_ACCENT.ownsActive, SPINE_ACCENT.activePage);
  });
});
