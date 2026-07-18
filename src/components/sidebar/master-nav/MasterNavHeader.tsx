'use client';

import { motion } from 'framer-motion';
import { ChevronDown } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives/IconButton';
import type { SidebarIconComponent } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';

const spring = { type: 'spring', stiffness: 520, damping: 36 } as const;

/** Resolved recent mode chip for the closed trigger (icons only; name stays “now”). */
export interface MasterNavRecentModeChip {
  key: string;
  label: string;
  icon: SidebarIconComponent;
  onSelect: () => void;
}

/**
 * Closed master-nav trigger — **name of now**.
 * Label = active mode (or page when modeless). Up to 3 recent-mode icon chips
 * sit before a hairline-separated chevron that opens the menu. Hairlines also
 * separate the chips from each other. No leading icon (ModeRail owns the
 * active-mode glyph).
 */
export function MasterNavHeader({
  label,
  open,
  onClick,
  recentModes = [],
  className,
}: {
  /** Active mode name, or the page name for single-surface pages. */
  label: string;
  open: boolean;
  onClick?: () => void;
  /** Prior modes (excludes current); cap at 3 upstream. */
  recentModes?: MasterNavRecentModeChip[];
  className?: string;
}) {
  return (
    <div className={cn('flex h-[40px] w-full min-w-0 items-stretch', className)}>
      {/* Name of now — opens the menu. */}
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
        className="ds-raw-button flex min-w-0 flex-1 items-center px-3 text-left transition-colors hover:bg-surface-canvas"
      >
        <span className="min-w-0 flex-1 truncate text-role-body font-bold tracking-tight text-text-default">
          {label}
        </span>
      </button>

      {recentModes.length > 0 && (
        <div className="flex shrink-0 items-stretch divide-x divide-border-hairline border-l border-border-hairline">
          {recentModes.map((mode) => {
            const Icon = mode.icon;
            return (
              <div key={mode.key} className="flex items-center justify-center px-1.5">
                <HoverTooltip label={mode.label} asChild placement="below">
                  <IconButton
                    size="xs"
                    tone="accent"
                    ariaLabel={mode.label}
                    icon={<Icon className="h-3.5 w-3.5" />}
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

      {/* Menu affordance — hairline separates jump chips / name from open. */}
      <button
        type="button"
        onClick={onClick}
        aria-expanded={open}
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        className="ds-raw-button flex shrink-0 items-center border-l border-border-hairline px-2.5 text-text-muted transition-colors hover:bg-surface-canvas hover:text-text-default"
      >
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring} className="shrink-0">
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>
    </div>
  );
}
