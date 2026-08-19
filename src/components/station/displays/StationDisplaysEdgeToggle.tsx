'use client';

/**
 * Station Displays edge toggle — one control, two exclusive hosts.
 *
 * Closed: utility-rail **bottom** footer (`←|` Open displays) — left-dock
 * expand twin.
 * Open: `✕` Hide displays — seats as {@link TechRailSearchBar}
 * `trailingAction` on Root Index and every leaf (and on
 * the column's header band — there is no footer variant any more).
 *
 * Shared `layoutId` FLIPs the mark across the work surface with the push
 * column width tween (`motionRole.push.rail`). Never mount both at once —
 * that was two dismisses for one edge.
 *
 * **Lives with the shared column, not with Unbox** (moved 2026-08-07). It was
 * born in `receiving/workspace/` and imported back UP into
 * {@link StationDisplaysPushStack}, so the station-wide SoT depended on one
 * domain folder and carried its vocabulary — including a `layoutId` literally
 * named `unbox-…` that all six stations then shared. The `layoutId` is now
 * station-neutral. `data-testid`s deliberately keep their original values: a
 * testid is an address, and E2E specs point at these.
 */

import { useState } from 'react';
import { ArrowLeftToLine, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { motion, motionRole, useMotionRole, useReducedMotion } from '@/design-system/motion';
import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';
import {
  stationDisplaysToggleHotkeyLabel,
  useStationDisplaysToggleHotkey,
} from './displays-toggle-hotkey';

/** Shared layout id — pane open host ↔ column close host. */
const STATION_DISPLAYS_EDGE_TOGGLE_LAYOUT_ID = 'station-displays-edge-toggle';

/** One control closes all Displays push surfaces — names the REGION, not the tab. */
const STATION_DISPLAYS_CLOSE_LABEL = 'Hide displays';

export function StationDisplaysEdgeToggle({
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
  // ⌘/Ctrl+] — same action as this control's click; exclusive host owns the chord.
  useStationDisplaysToggleHotkey(onClick);

  const chord = stationDisplaysToggleHotkeyLabel();
  const label = paneOpen
    ? `Open displays (${chord})`
    : `${STATION_DISPLAYS_CLOSE_LABEL} (${chord})`;

  return (
    <motion.div
      layoutId={reduce ? undefined : STATION_DISPLAYS_EDGE_TOGGLE_LAYOUT_ID}
      transition={transition}
      onLayoutAnimationStart={() => setIsMorphing(true)}
      onLayoutAnimationComplete={() => setIsMorphing(false)}
      style={{ zIndex: isMorphing ? zIndex.raised : undefined }}
      className="inline-flex"
    >
      <HoverTooltip label={label} asChild>
        <IconButton
          size={paneOpen ? 'xs' : 'sm'}
          tone="neutral"
          ariaLabel={label}
          aria-expanded={!paneOpen}
          icon={
            paneOpen ? (
              <ArrowLeftToLine className="h-4 w-4" />
            ) : (
              <X className="h-3.5 w-3.5" />
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
