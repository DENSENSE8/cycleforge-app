/** Idle↔overlay shell — the API every floor scan station must call. */

import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';

export const IDLE_OVERLAY_HELPER = 'src/design-system/motion/idle-overlay.ts' as const;

export function idleBrowseLayerProps(
  overlayOpen: boolean,
  className?: string,
): {
  className: string;
  'aria-hidden'?: true;
  inert?: true;
  style: { visibility: 'hidden' | 'visible'; pointerEvents?: 'none' };
} {
  return {
    // Pointer-events is expressed BOTH ways, and deliberately.
    className: cn(className, overlayOpen ? 'pointer-events-none' : ''),
    ...(overlayOpen ? { 'aria-hidden': true as const, inert: true as const } : {}),
    style: {
      visibility: overlayOpen ? 'hidden' : 'visible',
      ...(overlayOpen ? { pointerEvents: 'none' as const } : {}),
    },
  };
}

export function overlayPaneStyle(hardCut = false): { zIndex: number } {
  return { zIndex: zIndex.panel + (hardCut ? 1 : 0) };
}
