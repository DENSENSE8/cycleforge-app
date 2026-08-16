/**
 *   npx tsx --test src/lib/right-rail/panel-store.test.ts
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import {
  closeAndCachePanel,
  getPanelStore,
  openPanel,
  reopenDraft,
  resetPanelStore,
  restorePanelStoreNotifyDeps,
  setPanelDraftCapture,
  setPanelDraftData,
  setPanelStoreNotifyDeps,
  syncPanelOccupant,
} from './panel-store';

interface NotifyCall {
  resumed: boolean;
  dismissed: boolean;
}

function installCapture() {
  const cap: NotifyCall = { resumed: false, dismissed: false };
  let resume: (() => void) | null = null;
  setPanelStoreNotifyDeps({
    now: () => 1_700_000_000_000,
    notifyDraftSaved: ({ onResume, onDismiss }) => {
      resume = onResume;
      void onDismiss;
    },
    dismissToast: () => {
      cap.dismissed = true;
    },
  });
  return {
    cap,
    fireResume: () => {
      resume?.();
    },
  };
}

beforeEach(() => {
  resetPanelStore();
  restorePanelStoreNotifyDeps();
});

afterEach(() => {
  resetPanelStore();
  restorePanelStoreNotifyDeps();
});

describe('panel-store — singleton lifecycle', () => {
  it('openPanel mounts a view and overrides a dismissed draft', () => {
    installCapture();
    openPanel({ id: 'detail:order' });
    assert.equal(getPanelStore().activeView?.id, 'detail:order');
    assert.equal(getPanelStore().dismissed, false);

    setPanelDraftData({ note: 'unsaved' });
    closeAndCachePanel();
    assert.equal(getPanelStore().dismissed, true);
    assert.deepEqual(getPanelStore().draftData, {
      viewId: 'detail:order',
      data: { note: 'unsaved' },
      capturedAt: 1_700_000_000_000,
    });

    openPanel({ id: 'detail:sku:ABC' });
    assert.equal(getPanelStore().dismissed, false);
    assert.equal(getPanelStore().activeView?.id, 'detail:sku:ABC');
  });

  it('closeAndCachePanel snapshots the capture getter and arms the toast', () => {
    installCapture();
    openPanel({ id: 'detail:order' });
    setPanelDraftCapture(() => ({ qty: 3 }));
    closeAndCachePanel();
    const snap = getPanelStore();
    assert.equal(snap.dismissed, true);
    assert.equal(snap.draftToastArmed, true);
    assert.deepEqual(snap.draftData?.data, { qty: 3 });
  });

  it('closeAndCachePanel is a no-op when already dismissed or when assistant is active', () => {
    const { cap } = installCapture();
    openPanel({ id: 'assistant' });
    closeAndCachePanel();
    assert.equal(getPanelStore().dismissed, false);
    assert.equal(getPanelStore().draftData, null);

    openPanel({ id: 'detail:order' });
    closeAndCachePanel();
    const first = getPanelStore().draftData;
    closeAndCachePanel();
    assert.equal(getPanelStore().draftData, first);
    assert.equal(cap.dismissed, false);
  });

  it('reopenDraft remounts the cached view and disarms the toast', () => {
    const { cap } = installCapture();
    openPanel({ id: 'detail:order' });
    setPanelDraftData({ note: 'keep' });
    closeAndCachePanel();
    reopenDraft();
    const snap = getPanelStore();
    assert.equal(snap.dismissed, false);
    assert.equal(snap.draftToastArmed, false);
    assert.equal(snap.activeView?.id, 'detail:order');
    assert.deepEqual(snap.draftData?.data, { note: 'keep' });
    assert.equal(cap.dismissed, true);
  });

  it('syncPanelOccupant opens a new id and does not undismiss the same id', () => {
    installCapture();
    syncPanelOccupant('detail:order');
    assert.equal(getPanelStore().activeView?.id, 'detail:order');
    closeAndCachePanel();
    assert.equal(getPanelStore().dismissed, true);
    syncPanelOccupant('detail:order');
    assert.equal(getPanelStore().dismissed, true);
    syncPanelOccupant('detail:incoming');
    assert.equal(getPanelStore().dismissed, false);
    assert.equal(getPanelStore().activeView?.id, 'detail:incoming');
  });

  it('syncPanelOccupant clearing the slot keeps a dismissed draft', () => {
    installCapture();
    openPanel({ id: 'detail:order' });
    closeAndCachePanel();
    syncPanelOccupant(null);
    assert.equal(getPanelStore().dismissed, true);
    assert.equal(getPanelStore().activeView?.id, 'detail:order');
  });
});
