'use client';

/** Station Displays edge toggle — one control, two exclusive hosts. */

import { useState } from 'react';
import { ArrowLeftToLine, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { motion, motionRole, useMotionRole, useReducedMotion } from '@/design-system/motion';
import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';
import { STATION_DISPLAYS_HEADER_ACTION_FACE } from './StationDisplaysHeaderActions';
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
      className={cn(
        'inline-flex',
        !paneOpen && 'h-full w-full items-stretch',
      )}
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
          className={cn(!paneOpen && STATION_DISPLAYS_HEADER_ACTION_FACE)}
          data-testid={paneOpen ? 'unbox-displays-pane-toggle' : 'unbox-push-close'}
        />
      </HoverTooltip>
    </motion.div>
  );
}
