'use client';

/** `closeRightPanel` — the ONE way the right panel closes. */

import { closeAndCachePanel } from '@/lib/right-rail/panel-store';
import { getRightRailTop } from '@/lib/right-rail/store';

export function closeRightPanel(): void {
  const top = getRightRailTop();
  if (!top) return;

  // Refusal outranks both halves. Checked first so a veto costs no draft
  // capture, no park, and no toast.
  if (top.canClose && !top.canClose()) return;

  if (top.id === 'assistant') {
    top.onClose?.();
    return;
  }

  // Ephemeral desk tools unmount on close — no draft park / Resume toast.
  if (top.resumeOnDismiss === false) {
    top.onClose?.();
    return;
  }

  closeAndCachePanel();
  top.onClose?.();
}
