'use client';

/**
 * @deprecated Import from `@/hooks/useSelectionStatusBarHotkeys`.
 * Re-export seam so stale bundles / paths keep resolving.
 */

export {
  useSelectionActionHotkeys,
  useSelectionStatusBarHotkeys,
  type SelectionStatusHotkeyAction,
  SELECTION_STATUS_BAR_META,
  SELECTION_STATUS_BAR_ORDER,
  getSelectionInlineHotkeysRevealed,
  isSelectionInlineHotkeySurfaceActive,
  registerSelectionInlineHotkeySurface,
  setSelectionInlineHotkeysRevealed,
  toggleSelectionInlineHotkeys,
} from '@/hooks/useSelectionStatusBarHotkeys';

/** Alias kept for older SelectionHotkeyAction importers. */
export type { SelectionStatusHotkeyAction as SelectionHotkeyAction } from '@/hooks/useSelectionStatusBarHotkeys';
