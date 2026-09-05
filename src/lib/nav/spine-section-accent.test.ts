import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appCanvasClass, appChromeClass } from '@/design-system/tokens/app-surface';
import { SPINE_ACCENT, SPINE_ACCENT_DATA_ACTIVE } from './spine-section-accent';

/**
 * The original test asserted the current-page fill was canvas and not chrome.
 * That encoded a HOST — MasterNav on white — and the host moved: the docked
 * column is canvas now while the hover-peek card is still white, so "not
 * chrome" stopped being enough and the current row painted its own ground.
 *
 * What the test was really protecting is that the fill never collapses onto
 * the plane it sits on. So it now asserts that against BOTH planes, which is
 * the property that survives the next host change.
 */
describe('spine selected fill vs the planes it renders on', () => {
  it('current-page fill collapses onto neither canvas nor chrome', () => {
    assert.ok(!SPINE_ACCENT.activePage.includes(appCanvasClass));
    assert.ok(!SPINE_ACCENT.activePage.includes(appChromeClass));
    assert.ok(!SPINE_ACCENT.childActive.includes(appCanvasClass));
    assert.ok(!SPINE_ACCENT.childActive.includes(appChromeClass));
    assert.ok(SPINE_ACCENT.activePage.includes('bg-surface-strong'));
  });

  it('the data-[active] spelling stays in step with the current-page fill', () => {
    // Literal because Tailwind scans source text; that is exactly why it can
    // drift, so it is checked rather than trusted. `relative` is a positioning
    // context, not a state, so it is carried unprefixed on both.
    for (const cls of SPINE_ACCENT.activePage.split(' ')) {
      if (cls === 'relative') {
        assert.ok(SPINE_ACCENT_DATA_ACTIVE.includes('relative'));
        continue;
      }
      assert.ok(
        SPINE_ACCENT_DATA_ACTIVE.includes(`data-[active=true]:${cls}`),
        `SPINE_ACCENT_DATA_ACTIVE is missing ${cls}`,
      );
    }
  });

  it('the current page is marked on a channel that is not luminance alone', () => {
    // A neutral fill cannot clear 3:1 on white without reading as a pressed
    // button. The leading bar is full-ink, so it does not depend on the fill.
    assert.ok(SPINE_ACCENT.activePage.includes('before:bg-text-default'));
    assert.ok(SPINE_ACCENT.activePage.includes('before:w-0.5'));
    assert.ok(SPINE_ACCENT_DATA_ACTIVE.includes('data-[active=true]:before:bg-text-default'));
  });

  it('idle rows carry no fill of their own', () => {
    assert.ok(!SPINE_ACCENT.idlePage.includes(appCanvasClass));
    assert.ok(!SPINE_ACCENT.idlePage.includes(appChromeClass));
  });

  it('owns-active parent wash is quieter than current-page, and neither plane', () => {
    assert.ok(SPINE_ACCENT.ownsActive.includes('bg-surface-sunken'));
    assert.ok(!SPINE_ACCENT.ownsActive.includes(appCanvasClass));
    assert.ok(!SPINE_ACCENT.ownsActive.includes(appChromeClass));
    assert.notEqual(SPINE_ACCENT.ownsActive, SPINE_ACCENT.activePage);
  });

  it('hover steps the same direction as selection, never lighter than the ground', () => {
    // A wash lighter than canvas made a merely-hovered row out-shout the page
    // the operator was actually on.
    assert.ok(SPINE_ACCENT.idlePage.includes('hover:bg-surface-sunken'));
    assert.ok(!SPINE_ACCENT.idlePage.includes('hover:bg-surface-hover'));
  });
});
