'use client';

/**
 * useRegisterRightPanel — declaratively claim the right-rail slot for the
 * lifetime of the calling component (while `enabled`). This is how a panel
 * becomes an occupant of the single `RightRailHost` slot instead of rendering
 * its own competing `fixed right-0 z-panel` element.
 *
 *   useRegisterRightPanel({
 *     id: 'assistant',
 *     priority: RIGHT_RAIL_PRIORITY.assistant,
 *     node: <AssistantDockBody onClose={close} />,
 *     enabled: open,
 *   });
 *
 * Mount/unmount of the claim is keyed on `id`/`priority`/`enabled` only, so a
 * content re-render does NOT tear the occupant down (which would drop its state
 * and re-fire the crossfade). Node freshness is pushed separately via
 * `updateRightRailPanelNode`.
 */

import { useEffect, type ReactNode } from 'react';
import { registerRightRailPanel, updateRightRailPanelNode } from '@/lib/right-rail/store';

export function useRegisterRightPanel(opts: {
  id: string;
  priority: number;
  node: ReactNode;
  onClose?: () => void;
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
  /** Defaults to `true` — pass `false` to omit the outset edge-collapse
   *  chevron (header `→|` is the only dismiss). See `RightRailPanel.edgeCollapse`. */
  edgeCollapse?: boolean;
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
    elevated,
    modal,
    closeOnOutsideClick,
    push,
    edgeCollapse,
    ariaLabel,
    enabled = true,
  } = opts;

  // Stable claim: registers once per (id, priority, enabled) change, unregisters
  // on unmount / disable. Deliberately excludes `node` so content updates don't
  // remount the occupant.
  // NOTE: `node` is intentionally excluded from the deps — it's kept fresh by the
  // effect below so a content re-render never remounts the occupant.
  useEffect(() => {
    if (!enabled) return undefined;
    return registerRightRailPanel({
      id,
      priority,
      node,
      onClose,
      elevated,
      modal,
      closeOnOutsideClick,
      push,
      edgeCollapse,
      ariaLabel,
    });
  }, [id, priority, enabled, elevated, modal, closeOnOutsideClick, push, edgeCollapse, ariaLabel]);

  // Keep the live occupant's node fresh (no-ops if the claim isn't active).
  useEffect(() => {
    if (!enabled) return;
    updateRightRailPanelNode({
      id,
      node,
      onClose,
      elevated,
      modal,
      closeOnOutsideClick,
      push,
      edgeCollapse,
      ariaLabel,
    });
  }, [id, node, onClose, elevated, modal, closeOnOutsideClick, push, edgeCollapse, ariaLabel, enabled]);
}
