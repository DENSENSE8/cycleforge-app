/**
 * Idle↔overlay shell — the API every floor scan station must call.
 *
 * Browse stays mounted. Overlay open hides it with visibility (not unmount),
 * marks it inert, and drops pointer events. The focused pane stacks on
 * `zIndex.panel`, +1 while a hard-cut entity swap is covering its predecessor.
 *
 * Workspaces must not re-type these styles. The cohort tripwire asserts the
 * call, not the CSS string. Behaviour lives here.
 */

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
    //
    // Its unit test (`idle-overlay.test.ts`) reads the `pointer-events-none`
    // utility off `className`, and the helper also OWNS a `pointerEvents`
    // style next to `visibility`, so it states the intent in both places —
    // the class and the
    // style resolve to the same computed value, so there is nothing to
    // conflict at runtime.
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
