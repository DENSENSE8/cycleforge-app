'use client';

/** useRegisterRightPanel — declaratively claim the right-rail slot for the lifetime of the calling component (while `enabled`). */

import { useEffect, type ReactNode } from 'react';
import { registerRightRailPanel, updateRightRailPanelNode } from '@/lib/right-rail/store';

export function useRegisterRightPanel(opts: {
  id: string;
  priority: number;
  node: ReactNode;
  onClose?: () => void;
  /** Return false to REFUSE dismissal while a run is in flight. See
   *  `RightRailPanel.canClose` — `onClose` cannot express refusal. */
  canClose?: () => boolean;
  /** When true, render in the elevated `detailStack` band + deeper backdrop. */
  elevated?: boolean;
  /** Modality — defaults to `true`. Pass `false` for a non-modal inspector
   *  (no scrim, no scroll lock, `role="region"`). See `RightRailPanel.modal`. */
  modal?: boolean;
  /** Non-modal only: invisible dismiss layer so click-off closes. */
  closeOnOutsideClick?: boolean;
  /** Defaults to `true` — pass `false` to keep this occupant floating.
   *  See `RightRailPanel.push` for the three sanctioned reasons. */
  push?: boolean;
  /** Defaults to `true` — pass `false` to refuse host park (Band 3 /
   *  DETAIL_STACK_COLLAPSE / expand strip). Header `→|` remains the dismiss.
   *  See `RightRailPanel.edgeCollapse`. Hairline never mounts a sash chevron. */
  edgeCollapse?: boolean;
  /** Defaults to `true`. Pass `false` when workbench chrome owns reopen. */
  collapsedStrip?: boolean;
  /** Defaults to `true`. Pass `false` for ephemeral desk tools (Add inbound). */
  resumeOnDismiss?: boolean;
  /** Accessible name for the aside — pass one when `modal` is false. */
  ariaLabel?: string;
  /** When false the component makes no claim (e.g. an unopened dock). */
  enabled?: boolean;
}): void {
  const {
    id,
    priority,
    node,
    onClose,
    canClose,
    elevated,
    modal,
    closeOnOutsideClick,
    push,
    edgeCollapse,
    collapsedStrip,
    resumeOnDismiss,
    ariaLabel,
    enabled = true,
  } = opts;

  // Stable claim:
  useEffect(() => {
    if (!enabled) return undefined;
    return registerRightRailPanel({
      id,
      priority,
      node,
      onClose,
      canClose,
      elevated,
      modal,
      closeOnOutsideClick,
      push,
      edgeCollapse,
      collapsedStrip,
      resumeOnDismiss,
      ariaLabel,
    });
  }, [id, priority, enabled, elevated, modal, closeOnOutsideClick, push, edgeCollapse, collapsedStrip, resumeOnDismiss, ariaLabel]);

  // Keep the live occupant's node fresh (no-ops if the claim isn't active).
  useEffect(() => {
    if (!enabled) return;
    updateRightRailPanelNode({
      id,
      node,
      onClose,
      canClose,
      elevated,
      modal,
      closeOnOutsideClick,
      push,
      edgeCollapse,
      collapsedStrip,
      resumeOnDismiss,
      ariaLabel,
    });
  }, [id, node, onClose, canClose, elevated, modal, closeOnOutsideClick, push, edgeCollapse, collapsedStrip, resumeOnDismiss, ariaLabel, enabled]);
}
