'use client';

import { useLayoutEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode, type RefObject } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { AnchoredLayer, type AnchoredPlacement } from './AnchoredLayer';
import { motionPresence, motionTransition } from '../foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '../foundations/motion-presets-hooks';
import { elevationClass } from '../tokens/shadows';
import { DROPDOWN_SHELL_CORNER } from '../tokens/radius';
import type { ZIndexToken } from '../tokens/z-index';

// ─── Popover ─────────────────────────────────────────────────────────────────

interface PopoverProps
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
  const presence = useMotionPresence(motionPresence.dropdownPanel);
  const transition = useMotionTransition(motionTransition.dropdownOpen);
  // Keep the portal alive until the exit motion finishes — otherwise
  // AnchoredLayer unmounts on `open=false` and AnimatePresence never plays.
  // useLayoutEffect so the open path mounts before paint (no missed first frame).
  const [layerOpen, setLayerOpen] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (open) {
      setLayerOpen(true);
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement && active !== document.body ? active : anchorRef.current;
      return;
    }
    // Esc hatch: the layer stays mounted through the exit motion, so
    // AnchoredLayer never sees `open=false` — hand focus back here, unless the
    // close moved it somewhere else on purpose (a click outside).
    const opener = openerRef.current;
    openerRef.current = null;
    if (!opener?.isConnected) return;
    const active = document.activeElement;
    const dropped = !active || active === document.body || Boolean(panelRef.current?.contains(active));
    if (dropped) opener.focus({ preventScroll: true });
  }, [open, anchorRef]);

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
            ref={panelRef}
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            className={cn(
              // Capped to the room AnchoredLayer found on the chosen side; a
              // panel taller than that scrolls instead of running off-screen.
              'max-h-[var(--anchored-available-height,none)] min-w-[10rem] overflow-y-auto overflow-x-hidden border border-border-default bg-surface-card text-text-default',
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
