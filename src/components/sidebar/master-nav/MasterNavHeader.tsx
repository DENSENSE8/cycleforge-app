'use client';

import { useState } from 'react';
import { MousePointerClick } from 'lucide-react';
import { ChevronDown } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives/IconButton';
import type { SidebarIconComponent } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';

/** Resolved recent mode chip for the closed trigger (icons only; name stays “now”). */
export interface MasterNavRecentModeChip {
  key: string;
  label: string;
  icon: SidebarIconComponent;
  /** Heavier stroke for page jumps; lighter for mode jumps. */
  iconLayer?: 'page' | 'mode';
  onSelect: () => void;
  /** Optional hover hook — warms the destination's data (nav-data-prefetch). */
  onHover?: () => void;
}

/**
 * Closed master-nav trigger — **name of now**.
 * Label opens the full nav on click; hovering the button opens same-page modes.
 * Chevron at rest; pointer on hover, while the modes panel is open, or while
 * the full nav dropdown is open.
 */
export function MasterNavHeader({
  label,
  open,
  onClick,
  onTriggerMouseEnter,
  onTriggerMouseLeave,
  modesPanelOpen = false,
  recentModes = [],
  className,
}: {
  label: string;
  open: boolean;
  onClick?: () => void;
  onTriggerMouseEnter?: () => void;
  onTriggerMouseLeave?: () => void;
  /** Same-page modes hover panel is visible — keeps pointer icon while over the panel. */
  modesPanelOpen?: boolean;
  recentModes?: MasterNavRecentModeChip[];
  className?: string;
}) {
  const [triggerHovered, setTriggerHovered] = useState(false);
  const hasRecents = recentModes.length > 0;
  // Pointer when hovering modes, modes panel open, or full nav open; chevron only at rest.
  const showClickIcon = open || triggerHovered || modesPanelOpen;

  return (
    <div className={cn('flex h-[40px] w-full min-w-0 items-stretch', className)}>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => {
          setTriggerHovered(true);
          onTriggerMouseEnter?.();
        }}
        onMouseLeave={() => {
          setTriggerHovered(false);
          onTriggerMouseLeave?.();
        }}
        aria-expanded={open}
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        className="ds-raw-button flex min-w-0 shrink items-center gap-1 px-3 text-left transition-colors hover:bg-surface-canvas"
      >
        <span className="min-w-0 truncate text-role-body font-bold tracking-tight text-text-default">
          {label}
        </span>
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-text-muted" aria-hidden>
          {showClickIcon ? (
            <MousePointerClick className="h-4 w-4" strokeWidth={2} />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      {hasRecents && (
        <div className="ml-auto flex shrink-0 items-stretch gap-0.5 pr-1">
          {recentModes.map((mode) => {
            const Icon = mode.icon;
            return (
              <div
                key={mode.key}
                className="flex items-center justify-center px-1"
                onMouseEnter={mode.onHover}
              >
                <HoverTooltip label={mode.label} asChild placement="below">
                  <IconButton
                    size="xs"
                    tone="accent"
                    ariaLabel={mode.label}
                    icon={<Icon className={navIconStrokeClass(mode.iconLayer ?? 'mode', 'h-3.5 w-3.5')} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      mode.onSelect();
                    }}
                  />
                </HoverTooltip>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
