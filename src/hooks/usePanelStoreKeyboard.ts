'use client';

/**
 * Mount-only: Esc → `closeRightPanel`, Mod+Shift+R → reopenDraft.
 *
 * Esc routes through the ONE closer (`lib/right-rail/close.ts`), not
 * `closeAndCachePanel` directly — otherwise the keyboard dismiss and the
 * host's `X` would run different halves of "close" (see that module).
 *
 * Capture phase is used only while the draft toast is armed so the resume
 * chord beats the browser's hard-reload. Esc stays on bubble so an open
 * overlay keeps ownership. Never blurs; unrelated keys are ignored.
 */

import { useEffect } from 'react';
import { useAnyOverlayOpen } from '@/design-system/hooks';
import { closeRightPanel } from '@/lib/right-rail/close';
import { reopenDraft, usePanelStore } from '@/lib/right-rail/panel-store';
import { handlePanelStoreKeydown } from '@/lib/right-rail/panel-store-keyboard';

export function usePanelStoreKeyboard(): void {
  const overlayOpen = useAnyOverlayOpen();
  const snapshot = usePanelStore();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleKey = (event: KeyboardEvent) => {
      handlePanelStoreKeydown(event, {
        snapshot,
        overlayOpen,
        closeAndCachePanel: closeRightPanel,
        reopenDraft,
      });
    };
    const capture = snapshot.draftToastArmed;
    window.addEventListener('keydown', handleKey, capture);
    return () => window.removeEventListener('keydown', handleKey, capture);
  }, [snapshot, overlayOpen]);
}
