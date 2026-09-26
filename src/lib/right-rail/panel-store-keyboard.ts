/** Right-rail singleton keyboard — Esc dismisses, Mod+Shift+R resumes the draft. */

import type { PanelStoreSnapshot } from '@/lib/right-rail/panel-store';

/** Mod+Shift+R — armed only while the "Draft saved." toast is live. */
export const PANEL_DRAFT_RESUME_HOTKEY = {
  key: 'r',
  shiftKey: true,
  modKey: true,
} as const;

export interface PanelStoreKeyEvent {
  key: string;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
}

interface HandlePanelStoreKeydownInput {
  snapshot: PanelStoreSnapshot;
  overlayOpen: boolean;
  closeAndCachePanel: () => void;
  reopenDraft: () => void;
}

function isResumeChord(event: PanelStoreKeyEvent): boolean {
  if (event.altKey) return false;
  const key = event.key.toLowerCase();
  if (key !== PANEL_DRAFT_RESUME_HOTKEY.key) return false;
  if (!event.shiftKey) return false;
  return event.metaKey || event.ctrlKey;
}

/**
 * @returns true when the event was claimed (preventDefault + stopPropagation).
 */
export function handlePanelStoreKeydown(
  event: PanelStoreKeyEvent,
  input: HandlePanelStoreKeydownInput,
): boolean {
  const { snapshot, overlayOpen, closeAndCachePanel, reopenDraft } = input;

  if (isResumeChord(event)) {
    if (!snapshot.draftToastArmed) return false;
    event.preventDefault();
    event.stopPropagation();
    reopenDraft();
    return true;
  }

  if (event.key !== 'Escape') return false;
  if (overlayOpen) return false;
  if (snapshot.dismissed) return false;
  if (!snapshot.activeView) return false;
  if (snapshot.activeView.id === 'assistant') return false;

  event.preventDefault();
  event.stopPropagation();
  closeAndCachePanel();
  return true;
}
