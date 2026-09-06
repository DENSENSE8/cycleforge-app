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
    assert.ok(SPINE_ACCENT.activePage.includes('bg-surface-accent'));
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

  it('hover is the faintest step on the ramp, and the current page still wins', () => {
    // Inverted 2026-09-05 with the lighter palette. The old rule ("never
    // lighter than the ground") existed because the current page was a bare
    // fill, so a lighter hover out-shouted it. The current page now carries a
    // 17:1 ink bar, which no wash competes with — so hover is free to be the
    // lightest touch instead of the heaviest, and the column reads lighter.
    assert.ok(SPINE_ACCENT.idlePage.includes('hover:bg-surface-hover'));
    assert.ok(!SPINE_ACCENT.idlePage.includes('hover:bg-surface-sunken'));
    // The mark that answers "where am I" is the bar, not the wash — so hover
    // and current page can never be confused whatever the fills do.
    assert.ok(SPINE_ACCENT.activePage.includes('before:bg-text-default'));
    assert.ok(!SPINE_ACCENT.idlePage.includes('before:'));
  });
});
