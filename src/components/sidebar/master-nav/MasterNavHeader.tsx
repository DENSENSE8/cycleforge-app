'use client';

import { ChevronDown } from '@/components/Icons';
import { NAV_ICON_PAGE_STROKE_CLASS, navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  SIDEBAR_MASTER_NAV_CHEVRON_PAD_X,
  SIDEBAR_MASTER_NAV_GLYPH,
  SIDEBAR_MASTER_NAV_MODE_GAP,
  SIDEBAR_MASTER_NAV_MODE_PAD_X,
  SIDEBAR_MRU_CELL,
  SIDEBAR_MRU_CLUSTER,
  SIDEBAR_MRU_GLYPH,
} from '@/components/layout/header-shell';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives/IconButton';
import type { SidebarIconComponent } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';

/** Resolved recent jump chip for the closed trigger. Always a SoT icon. */
export interface MasterNavRecentModeChip {
  key: string;
  label: string;
  /** Mode glyph or page SoT icon (see `iconLayer`). */
  icon: SidebarIconComponent;
  /** Stroke weight for dropdown/L2 — ignored on closed-header MRU (page stroke only). */
  iconLayer?: 'page' | 'mode';
  onSelect: () => void;
  /** Optional hover hook — warms the destination's data (nav-data-prefetch). */
  onHover?: () => void;
}

/**
 * Closed master-nav trigger — **name of now**.
 * Modeful pages: leading mode icon + mode label. Modeless: label only (pages = text).
 * Top-left chevron opens the full nav; the whole mode icon+name+chevron opens
 * same-page modes (click only). A hairline separates the two controls.
 */
export function MasterNavHeader({
  label,
  leadingIcon: LeadingIcon,
  open,
  onClick,
  modesOpen = false,
  onModesClick,
  showModesToggle = false,
  showNavToggle = true,
  recentModes = [],
  className,
}: {
  label: string;
  /** Active mode glyph when the current page is modeful. */
  leadingIcon?: SidebarIconComponent;
  open: boolean;
  onClick?: () => void;
  /** Same-page modes panel is open. */
  modesOpen?: boolean;
  /** Toggle same-page modes (modeful pages only). */
  onModesClick?: () => void;
  /** Show the modes control (icon + name + chevron) as a click target. */
  showModesToggle?: boolean;
  /**
   * Show the left chevron that opens the full page menu. False when the page
   * list is already rendered in flow beneath this band (the nav-only sidebar),
   * where a trigger for an always-visible list is just a dead control.
   */
  showNavToggle?: boolean;
  recentModes?: MasterNavRecentModeChip[];
  className?: string;
}) {
  const hasRecents = recentModes.length > 0;

  const modeIdentity = (
    <>
      {LeadingIcon ? (
        <LeadingIcon
          className={navIconStrokeClass('mode', `${SIDEBAR_MASTER_NAV_GLYPH} shrink-0 text-text-muted`)}
          aria-hidden
        />
      ) : null}
      <span
        data-master-nav-label
        className="min-w-0 truncate text-role-body font-semibold tracking-tight text-text-default"
      >
        {label}
      </span>
    </>
  );

  return (
    <div className={cn('flex h-[40px] w-full min-w-0 items-stretch', className)}>
      {/* Top-left: full page nav. Omitted when the list is already in flow. */}
      {showNavToggle && (
        <>
          <button
            type="button"
            onClick={onClick}
            aria-expanded={open}
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            className={cn(
              'ds-raw-button flex shrink-0 items-center justify-center text-text-muted transition-colors hover:bg-surface-canvas hover:text-text-default',
              SIDEBAR_MASTER_NAV_CHEVRON_PAD_X,
            )}
          >
            <ChevronDown
              className={cn(SIDEBAR_MASTER_NAV_GLYPH, 'transition-transform duration-200', open && 'rotate-180')}
              aria-hidden
            />
          </button>

          {/* Hairline between full-nav chevron and mode identity */}
          <div className="my-2 w-px shrink-0 self-stretch bg-border-hairline" aria-hidden />
        </>
      )}

      {/* Name of now — whole control opens modes when the page is modeful */}
      {showModesToggle ? (
        <button
          type="button"
          onClick={onModesClick}
          aria-expanded={modesOpen}
          aria-label={modesOpen ? 'Close modes menu' : 'Open modes menu'}
          className={cn(
            'ds-raw-button flex min-w-0 shrink items-center text-left transition-colors hover:bg-surface-canvas',
            SIDEBAR_MASTER_NAV_MODE_GAP,
            SIDEBAR_MASTER_NAV_MODE_PAD_X,
          )}
        >
          {modeIdentity}
          <ChevronDown
            className={cn(
              SIDEBAR_MASTER_NAV_GLYPH,
              'shrink-0 text-text-muted transition-transform duration-200',
              modesOpen && 'rotate-180',
            )}
            aria-hidden
          />
        </button>
      ) : (
        <div className={cn('flex min-w-0 shrink items-center', SIDEBAR_MASTER_NAV_MODE_GAP, SIDEBAR_MASTER_NAV_MODE_PAD_X)}>
          {modeIdentity}
        </div>
      )}

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
                  <IconButton
                    size="xs"
                    tone="accent"
                    ariaLabel={mode.label}
                    icon={
                      // Page stroke only — same crisp outline as GlobalHeader.
                      // Mode wrappers bake heavier stroke; forcing page weight
                      // here keeps dense glyphs sharp in compact MRU cells.
                      <Icon className={cn(NAV_ICON_PAGE_STROKE_CLASS, SIDEBAR_MRU_GLYPH)} />
                    }
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

