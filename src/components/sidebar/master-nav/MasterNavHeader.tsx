'use client';

import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  SIDEBAR_MASTER_NAV_GLYPH,
  SIDEBAR_MASTER_NAV_MODE_GAP,
  SIDEBAR_MASTER_NAV_MODE_PAD_X,
} from '@/components/layout/header-shell';
import type { SidebarIconComponent } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';

/**
 * Spine identity band — **name of now** (left-justified leading icon + label).
 * Modeful pages: leading mode icon + mode label. Modeless: page icon + page label.
 * Label uses `text-role-body` + `font-semibold` + `leading-tight` — one step under
 * title so it sits beside the `h-4` glyph without overpowering it. Prefer
 * `leading-tight` over `leading-none`: `truncate` is `overflow: hidden`, and
 * line-height 1 clips descenders (g / y / p) against the clip edge. Identity
 * only — L2 Mode + Recents live in GlobalHeader (`HeaderModeSwitcher` /
 * `HeaderRecentsSwitcher`). The page list is already the spine body, so this band
 * has no nav-toggle chevron (column open lives on `SidebarNavColumn`). Spine MRU
 * jump chips were removed; do not reintroduce them here.
 */
export function MasterNavHeader({
  label,
  leadingIcon: LeadingIcon,
  className,
}: {
  label: string;
  /** Mode glyph when modeful; page icon when modeless. */
  leadingIcon?: SidebarIconComponent;
  className?: string;
}) {
  return (
    // Height lives on the parent band ({@link TOP_CHROME_BAND_FACE}) so the
    // spine hairline shares GlobalHeader's 40px border-box — fill that band.
    <div className={cn('flex h-full w-full min-w-0 items-stretch', className)}>
      {/* Name of now — left-justified; L2 switching is in GlobalHeader. */}
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center',
          SIDEBAR_MASTER_NAV_MODE_GAP,
          SIDEBAR_MASTER_NAV_MODE_PAD_X,
        )}
      >
        {LeadingIcon ? (
          <LeadingIcon
            className={navIconStrokeClass('mode', `${SIDEBAR_MASTER_NAV_GLYPH} shrink-0 text-text-muted`)}
            aria-hidden
          />
        ) : null}
        <span
          data-master-nav-label
          className="min-w-0 truncate text-role-body font-semibold leading-tight tracking-tight text-text-default"
        >
          {label}
        </span>
      </div>
    </div>
  );
}
