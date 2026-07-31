'use client';

import { ChevronDown } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  SIDEBAR_MASTER_NAV_CHEVRON_PAD_X,
  SIDEBAR_MASTER_NAV_GLYPH,
  SIDEBAR_MASTER_NAV_MODE_GAP,
  SIDEBAR_MASTER_NAV_MODE_PAD_X,
} from '@/components/layout/header-shell';
import type { SidebarIconComponent } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';

/**
 * Closed master-nav trigger — **name of now** (optically centered in the band).
 * Modeful pages: leading mode icon + mode label. Modeless: label only (pages = text).
 * Top-left chevron opens the full nav; mode identity is display-only — L2 Mode +
 * Recents live in GlobalHeader (`HeaderModeSwitcher` / `HeaderRecentsSwitcher`).
 * Spine MRU jump chips were removed; do not reintroduce them here.
 */
export function MasterNavHeader({
  label,
  leadingIcon: LeadingIcon,
  open,
  onClick,
  showNavToggle = true,
  className,
}: {
  label: string;
  /** Active mode glyph when the current page is modeful. */
  leadingIcon?: SidebarIconComponent;
  open: boolean;
  onClick?: () => void;
  /**
   * Show the left chevron that opens the full page menu. False when the page
   * list is already rendered in flow beneath this band (the nav-only sidebar),
   * where a trigger for an always-visible list is just a dead control.
   */
  showNavToggle?: boolean;
  className?: string;
}) {
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
        className="min-w-0 truncate text-role-eyebrow font-semibold tracking-tight text-text-default"
      >
        {label}
      </span>
    </>
  );

  return (
    // Height lives on the parent band ({@link TOP_CHROME_BAND_FACE}) so the
    // spine hairline shares GlobalHeader's 40px border-box — fill that band.
    <div className={cn('relative flex h-full w-full min-w-0 items-stretch', className)}>
      {/* Top-left: full page nav. Omitted when the list is already in flow. */}
      {showNavToggle && (
        <>
          <button
            type="button"
            onClick={onClick}
            aria-expanded={open}
            aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
            className={cn(
              'ds-raw-button relative z-10 flex shrink-0 items-center justify-center text-text-muted transition-colors hover:bg-surface-canvas hover:text-text-default',
              SIDEBAR_MASTER_NAV_CHEVRON_PAD_X,
            )}
          >
            <ChevronDown
              className={cn(SIDEBAR_MASTER_NAV_GLYPH, 'transition-transform duration-200', open && 'rotate-180')}
              aria-hidden
            />
          </button>

          {/* Hairline between full-nav chevron and centered title */}
          <div className="relative z-10 my-2 w-px shrink-0 self-stretch bg-border-hairline" aria-hidden />
        </>
      )}

      {/* Name of now — optically centered in the band; L2 switching is in GlobalHeader. */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 flex min-w-0 items-center justify-center',
          SIDEBAR_MASTER_NAV_MODE_GAP,
          SIDEBAR_MASTER_NAV_MODE_PAD_X,
        )}
      >
        {modeIdentity}
      </div>
    </div>
  );
}
