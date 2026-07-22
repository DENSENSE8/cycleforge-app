/**
 * Pure close-machine for the fullscreen photo viewer.
 *
 * Intent (`requestClose`) may defer teardown while the details panel plays its
 * width-collapse exit; `panelExitComplete` finishes that path; `forceDismiss`
 * always tears down immediately (upload overlay, move-photos, etc.).
 */

export interface ViewerCloseState {
  viewerOpen: boolean;
  panelOpen: boolean;
  deferViewerClose: boolean;
}

export type ViewerCloseAction = 'requestClose' | 'panelExitComplete' | 'forceDismiss';

export function nextViewerCloseState(
  state: ViewerCloseState,
  action: ViewerCloseAction,
): ViewerCloseState {
  switch (action) {
    case 'forceDismiss':
      return { viewerOpen: false, panelOpen: false, deferViewerClose: false };
    case 'requestClose':
      if (state.panelOpen) {
        return { ...state, panelOpen: false, deferViewerClose: true };
      }
      return { viewerOpen: false, panelOpen: false, deferViewerClose: false };
    case 'panelExitComplete':
      if (!state.deferViewerClose) return state;
      return { viewerOpen: false, panelOpen: false, deferViewerClose: false };
  }
}
