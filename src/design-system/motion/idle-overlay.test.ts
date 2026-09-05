/**
 * Behaviour of the idle↔overlay helper — greps on workspaces die in the
 * same change that adds this test (grep_to_test).
 *
 * Run: node --import tsx --test src/design-system/motion/idle-overlay.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { zIndex } from '@/design-system/tokens/z-index';
import { idleBrowseLayerProps, overlayPaneStyle } from './idle-overlay';

describe('idleBrowseLayerProps', () => {
  it('hides, inerts, and drops pointer events while the overlay is open', () => {
    const props = idleBrowseLayerProps(true, 'flex h-full');
    assert.equal(props.style.visibility, 'hidden');
    assert.equal(props.inert, true);
    assert.equal(props['aria-hidden'], true);
    assert.match(props.className, /pointer-events-none/);
    assert.match(props.className, /flex/);
  });

  it('leaves browse interactive when the overlay is closed', () => {
    const props = idleBrowseLayerProps(false, 'flex h-full');
    assert.equal(props.style.visibility, 'visible');
    assert.equal(props.inert, undefined);
    assert.equal(props['aria-hidden'], undefined);
    assert.doesNotMatch(props.className, /pointer-events-none/);
  });
});

describe('overlayPaneStyle', () => {
  it('stacks on the panel token', () => {
    assert.equal(overlayPaneStyle(false).zIndex, zIndex.panel);
    assert.equal(overlayPaneStyle().zIndex, zIndex.panel);
  });

  it('raises one step during a hard-cut entity swap', () => {
    assert.equal(overlayPaneStyle(true).zIndex, zIndex.panel + 1);
  });
});
