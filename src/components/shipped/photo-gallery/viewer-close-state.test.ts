import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextViewerCloseState, type ViewerCloseState } from './viewer-close-state';

const open: ViewerCloseState = {
  viewerOpen: true,
  panelOpen: false,
  deferViewerClose: false,
};

const openWithPanel: ViewerCloseState = {
  viewerOpen: true,
  panelOpen: true,
  deferViewerClose: false,
};

describe('nextViewerCloseState', () => {
  it('requestClose dismisses immediately when the details panel is closed', () => {
    assert.deepEqual(nextViewerCloseState(open, 'requestClose'), {
      viewerOpen: false,
      panelOpen: false,
      deferViewerClose: false,
    });
  });

  it('requestClose defers when the details panel is open', () => {
    assert.deepEqual(nextViewerCloseState(openWithPanel, 'requestClose'), {
      viewerOpen: true,
      panelOpen: false,
      deferViewerClose: true,
    });
  });

  it('panelExitComplete finishes a deferred close', () => {
    const deferred = nextViewerCloseState(openWithPanel, 'requestClose');
    assert.deepEqual(nextViewerCloseState(deferred, 'panelExitComplete'), {
      viewerOpen: false,
      panelOpen: false,
      deferViewerClose: false,
    });
  });

  it('panelExitComplete is a no-op when not deferring', () => {
    assert.deepEqual(nextViewerCloseState(open, 'panelExitComplete'), open);
  });

  it('forceDismiss clears open, panel, and defer in one step', () => {
    assert.deepEqual(nextViewerCloseState(openWithPanel, 'forceDismiss'), {
      viewerOpen: false,
      panelOpen: false,
      deferViewerClose: false,
    });
    const deferred = nextViewerCloseState(openWithPanel, 'requestClose');
    assert.deepEqual(nextViewerCloseState(deferred, 'forceDismiss'), {
      viewerOpen: false,
      panelOpen: false,
      deferViewerClose: false,
    });
  });
});
