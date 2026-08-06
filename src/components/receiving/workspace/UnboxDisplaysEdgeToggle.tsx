'use client';

/**
 * Displays edge toggle — one control, two exclusive hosts.
 *
 * Closed: pane top-right (`←|` Open displays).
 * Open: push-column top-left (`→|` Hide right panel).
 *
 * Shared `layoutId` FLIPs the mark across the work surface with the push
 * column width tween (`motionRole.push.rail`). Never mount both at once —
 * that was two dismisses for one edge.
 */

import { useState } from 'react';
import { ArrowLeftToLine, ArrowRightToLine } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { motion, motionRole, useMotionRole, useReducedMotion } from '@/design-system/motion';
import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';

/** Shared layout id — pane open host ↔ column close host. */
const UNBOX_DISPLAYS_EDGE_TOGGLE_LAYOUT_ID = 'unbox-displays-edge-toggle';

/** One control closes all Displays push surfaces — names the REGION, not the tab. */
const UNBOX_PUSH_CLOSE_LABEL = 'Hide right panel';

export function UnboxDisplaysEdgeToggle({
  variant,
  onClick,
}: {
  variant: 'pane-open' | 'column-close';
  onClick: () => void;
}) {
  const reduce = useReducedMotion();
  const { transition } = useMotionRole(motionRole.push.rail);
  const [isMorphing, setIsMorphing] = useState(false);
  const paneOpen = variant === 'pane-open';

  return (
    <motion.div
      layoutId={reduce ? undefined : UNBOX_DISPLAYS_EDGE_TOGGLE_LAYOUT_ID}
      transition={transition}
      onLayoutAnimationStart={() => setIsMorphing(true)}
      onLayoutAnimationComplete={() => setIsMorphing(false)}
      style={{ zIndex: isMorphing ? zIndex.raised : undefined }}
      className="inline-flex"
    >
      <HoverTooltip label={paneOpen ? 'Open displays' : UNBOX_PUSH_CLOSE_LABEL} asChild>
        <IconButton
          size={paneOpen ? 'xs' : 'sm'}
          tone="neutral"
          ariaLabel={paneOpen ? 'Open displays' : UNBOX_PUSH_CLOSE_LABEL}
          aria-expanded={!paneOpen}
          icon={
            paneOpen ? (
              <ArrowLeftToLine className="h-4 w-4" />
            ) : (
              <ArrowRightToLine className="h-3.5 w-3.5" />
            )
          }
          onClick={onClick}
          className={cn(!paneOpen && '-ml-px rounded-none')}
          data-testid={paneOpen ? 'unbox-displays-pane-toggle' : 'unbox-push-close'}
        />
      </HoverTooltip>
    </motion.div>
  );
}
