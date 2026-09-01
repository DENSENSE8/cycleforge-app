'use client';

import { useLayoutEffect, useState, type ComponentPropsWithoutRef, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { AnchoredLayer, type AnchoredPlacement } from './AnchoredLayer';
import { framerPresence, framerTransition } from '../foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '../foundations/motion-framer-hooks';
import { elevationClass } from '../tokens/shadows';
import { DROPDOWN_SHELL_CORNER } from '../tokens/radius';
import type { ZIndexToken } from '../tokens/z-index';

// ─── Popover ─────────────────────────────────────────────────────────────────
//
// The canonical anchored, *styled* popover panel. <AnchoredLayer> owns the hard
// part (portal, rect-tracking, dismissal) but no visual chrome; <Popover> adds
// DROPDOWN_SHELL_CORNER, a hairline border, soft elevation, and the shared
// dropdown enter/exit motion — so callers stop re-rolling floating-card
// boilerplate.
//
// Motion comes from the SHARED presets (`framerPresence.dropdownPanel` +
// `framerTransition.dropdownOpen`), run through the reduced-motion-aware hooks.
// The layer stays mounted through exit so AnimatePresence can finish the close
// animation (AnchoredLayer alone would tear down the portal on `open=false`).
//
// A11y: <AnchoredLayer> already owns Escape + outside-click dismissal. The
// trigger's `aria-haspopup`/`aria-expanded` stay caller-owned (as in
// ViewDropdown), since only the caller knows the trigger element. Pass a
// `role` ("menu"/"listbox"/"dialog") + `aria-label` straight through to the
// panel — extra props spread onto the styled panel.
//
// Usage:
//   const triggerRef = useRef<HTMLButtonElement>(null);
//   <button ref={triggerRef} aria-haspopup="menu" aria-expanded={open}
//           onClick={() => setOpen(o => !o)} />
//   <Popover open={open} onClose={() => setOpen(false)} anchorRef={triggerRef}
//            role="menu" aria-label="Row actions">
//     …content…
//   </Popover>

export interface PopoverProps
  extends Omit<
    ComponentPropsWithoutRef<typeof motion.div>,
    'children' | 'className' | 'initial' | 'animate' | 'exit' | 'transition'
  > {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  /** Edge + alignment relative to the trigger. Default 'bottom-start'. */
  placement?: AnchoredPlacement;
  /** Gap in px between the trigger and the panel. Default 0 (flush extension). */
  gap?: number;
  /** Stacking band — use `panelOverlay` inside {@link RightPaneOverlay}. Default `dropdown`. */
  level?: ZIndexToken;
  /** Match the trigger width (always true for `*-stretch` placements). */
  matchWidth?: boolean;
  /**
   * Close on Escape (default true). Editors that must distinguish Esc-cancel
   * from outside-click-commit pass false and handle Escape on their own input.
   */
  closeOnEscape?: boolean;
  /**
   * Inner padding. Default false — list rows / menu items bleed to the edges
   * (Kinetic Ledger flush). Pass true only when the panel hosts free-form content.
   */
  padded?: boolean;
  /** Classes on the styled panel. */
  className?: string;
  children: ReactNode;
}

export function Popover({
  open,
  onClose,
  anchorRef,
  placement = 'bottom-start',
  gap = 0,
  level = 'dropdown',
  matchWidth = false,
  closeOnEscape = true,
  padded = false,
  className,
  children,
  ...rest
}: PopoverProps) {
  const presence = useMotionPresence(framerPresence.dropdownPanel);
  const transition = useMotionTransition(framerTransition.dropdownOpen);
  // Keep the portal alive until the exit motion finishes — otherwise
  // AnchoredLayer unmounts on `open=false` and AnimatePresence never plays.
  // useLayoutEffect so the open path mounts before paint (no missed first frame).
  const [layerOpen, setLayerOpen] = useState(open);

  useLayoutEffect(() => {
    if (open) setLayerOpen(true);
  }, [open]);

  if (!layerOpen) return null;

  return (
    <AnchoredLayer
      open={layerOpen}
      onClose={onClose}
      anchorRef={anchorRef}
      placement={placement}
      gap={gap}
      level={level}
      matchWidth={matchWidth}
      closeOnEscape={closeOnEscape}
    >
      <AnimatePresence
        onExitComplete={() => {
          if (!open) setLayerOpen(false);
        }}
      >
        {open ? (
          <motion.div
            key="popover-panel"
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            className={cn(
              'min-w-[10rem] overflow-hidden border border-border-default bg-surface-card text-text-default',
              DROPDOWN_SHELL_CORNER,
              elevationClass('raised', 'soft'),
              padded && 'p-2',
              className,
            )}
            {...rest}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </AnchoredLayer>
  );
}
