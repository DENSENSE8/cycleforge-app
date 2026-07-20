'use client';

import { useState } from 'react';
import { MousePointerClick } from 'lucide-react';
import { ChevronDown } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  SIDEBAR_MRU_CELL,
  SIDEBAR_MRU_CLUSTER,
  SIDEBAR_MRU_GLYPH,
} from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives/IconButton';
import type { SidebarIconComponent } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';

/** Resolved recent jump chip for the closed trigger. Modes = icon; pages = text mark. */
export interface MasterNavRecentModeChip {
  key: string;
  label: string;
  /** Mode glyph when the jump targets a mode; omit for modeless page jumps. */
  icon?: SidebarIconComponent;
  /**
   * Short text mark for modeless page jumps (pages are text — no page Lucide).
   * Typically 1–2 letters from the page label.
   */
  textMark?: string;
  onSelect: () => void;
  /** Optional hover hook — warms the destination's data (nav-data-prefetch). */
  onHover?: () => void;
}

/**
 * Closed master-nav trigger — **name of now**.
 * Modeful pages: leading mode icon + mode label. Modeless: label only (pages = text).
 * Label opens the full nav on click; hovering the button opens same-page modes.
 * Chevron at rest; pointer on hover, while the modes panel is open, or while
 * the full nav dropdown is open.
 */
export function MasterNavHeader({
  label,
  leadingIcon: LeadingIcon,
  open,
  onClick,
  onTriggerMouseEnter,
  onTriggerMouseLeave,
  modesPanelOpen = false,
  recentModes = [],
  className,
}: {
  label: string;
  /** Active mode glyph when the current page is modeful. */
  leadingIcon?: SidebarIconComponent;
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
        className="ds-raw-button flex min-w-0 shrink items-center gap-1.5 px-3 text-left transition-colors hover:bg-surface-canvas"
      >
        {LeadingIcon ? (
          <LeadingIcon
            className={navIconStrokeClass('mode', 'h-4 w-4 shrink-0 text-text-muted')}
            aria-hidden
          />
        ) : null}
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
        <div className={SIDEBAR_MRU_CLUSTER}>
          {recentModes.map((mode) => {
            const Icon = mode.icon;
            return (
              <div
                key={mode.key}
                className={SIDEBAR_MRU_CELL}
                onMouseEnter={mode.onHover}
              >
                <HoverTooltip label={mode.label} asChild placement="below">
                  {Icon ? (
                    <IconButton
                      size="xs"
                      tone="accent"
                      ariaLabel={mode.label}
                      icon={
                        <Icon className={navIconStrokeClass('mode', SIDEBAR_MRU_GLYPH)} />
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        mode.onSelect();
                      }}
                    />
                  ) : (
                    // ds-raw-button: text-mark MRU for modeless page jumps (pages = text)
                    <button
                      type="button"
                      aria-label={mode.label}
                      onClick={(e) => {
                        e.stopPropagation();
                        mode.onSelect();
                      }}
                      className="ds-raw-button flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-role-micro font-bold uppercase tracking-wide text-blue-600 transition-colors hover:bg-blue-50"
                    >
                      {mode.textMark ?? mode.label.slice(0, 2)}
                    </button>
                  )}
                </HoverTooltip>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
