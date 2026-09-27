/**
 *   npx tsx --test src/lib/right-rail/panel-store-keyboard.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  handlePanelStoreKeydown,
  PANEL_DRAFT_RESUME_HOTKEY,
  type PanelStoreKeyEvent,
} from './panel-store-keyboard';
import type { PanelStoreSnapshot } from './panel-store';

function ev(partial: Partial<PanelStoreKeyEvent> & { key: string }): PanelStoreKeyEvent & {
  prevented: boolean;
  stopped: boolean;
} {
  const out = {
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    prevented: false,
    stopped: false,
    preventDefault() {
      out.prevented = true;
    },
    stopPropagation() {
      out.stopped = true;
    },
    ...partial,
  };
  return out;
}

const idle: PanelStoreSnapshot = {
  activeView: { id: 'detail:order' },
  draftData: null,
  dismissed: false,
  draftToastArmed: false,
};

describe('handlePanelStoreKeydown', () => {
  it('Esc closes and caches when a detail view is painted', () => {
    let closed = 0;
    const event = ev({ key: 'Escape' });
    const handled = handlePanelStoreKeydown(event, {
      snapshot: idle,
      overlayOpen: false,
      closeAndCachePanel: () => {
        closed += 1;
      },
      reopenDraft: () => {},
    });
    assert.equal(handled, true);
    assert.equal(closed, 1);
    assert.equal(event.prevented, true);
    assert.equal(event.stopped, true);
  });

  it('Esc stands down for overlays, dismissed, and empty slot', () => {
    const cases: PanelStoreSnapshot[] = [
      idle,
      { ...idle, dismissed: true },
      { ...idle, activeView: null },
    ];
    const overlay = handlePanelStoreKeydown(ev({ key: 'Escape' }), {
      snapshot: idle,
      overlayOpen: true,
      closeAndCachePanel: () => {
        throw new Error('must not close');
      },
      reopenDraft: () => {},
    });
    assert.equal(overlay, false);

    for (const snapshot of cases.slice(1)) {
      const handled = handlePanelStoreKeydown(ev({ key: 'Escape' }), {
        snapshot,
        overlayOpen: false,
        closeAndCachePanel: () => {
          throw new Error('must not close');
        },
        reopenDraft: () => {},
      });
      assert.equal(handled, false);
    }
  });

  it('Mod+Shift+R resumes only while the draft toast is armed', () => {
    let resumed = 0;
    const chord = ev({
      key: PANEL_DRAFT_RESUME_HOTKEY.key,
      metaKey: true,
      shiftKey: true,
    });
    assert.equal(
      handlePanelStoreKeydown(chord, {
        snapshot: idle,
        overlayOpen: false,
        closeAndCachePanel: () => {},
        reopenDraft: () => {
          resumed += 1;
        },
      }),
      false,
    );
    assert.equal(resumed, 0);

    const armed = ev({
      key: 'R',
      ctrlKey: true,
      shiftKey: true,
    });
    assert.equal(
      handlePanelStoreKeydown(armed, {
        snapshot: { ...idle, dismissed: true, draftToastArmed: true },
        overlayOpen: false,
        closeAndCachePanel: () => {},
        reopenDraft: () => {
          resumed += 1;
        },
      }),
      true,
    );
    assert.equal(resumed, 1);
    assert.equal(armed.prevented, true);
  });

  it('does not claim wedge-like keys or drop focus (no preventDefault)', () => {
    const scan = ev({ key: 'A' });
    const handled = handlePanelStoreKeydown(scan, {
      snapshot: idle,
      overlayOpen: false,
      closeAndCachePanel: () => {
        throw new Error('must not close');
      },
      reopenDraft: () => {},
    });
    assert.equal(handled, false);
    assert.equal(scan.prevented, false);
    assert.equal(scan.stopped, false);
  });
});
