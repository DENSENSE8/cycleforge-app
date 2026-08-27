'use client';

/**
 * Home · Media — spine-band destinations.
 *
 * ## One mount, one SoT
 *
 * {@link SpineTopPins} fills the open spine's 40px top band (header seam
 * geometry). Layout is equal `flex-1` cells across the band width so hover
 * washes abut with no gaps. When the spine is closed, reach these via ⌘K /
 * opening the map — the header toggle is click-only (no hover peek).
 *
 * Search, Plans, and Chat stay `kind: 'top'` in `APP_SIDEBAR_NAV` with
 * `spineBand: false` so ⌘K / dest search / `/search` / `/ai-chat` / forge
 * still work; this band does not paint those glyphs. Search is already in
 * GlobalHeader (`GlobalHeaderSearch`).
 *
 * Permission gating rides along — Media needs `photos.view` — via
 * {@link getSidebarNavItems}, so a staffer without the permission gets no icon
 * rather than a dead one.
 *
 * Active state is query-aware ({@link isSidebarTopPinActive}).
 */

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSidebarNavItems,
  isSidebarTopPinActive,
  isSpineBandTopPin,
  type SidebarNavItem,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  SPINE_TOP_PIN_WRAP,
  TOP_CHROME_ICON_FACE,
} from '@/components/layout/header-shell';

/** Spine-band mount — equal-fill pins across the 40px header seam. */
export function SpineTopPins() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const pins = useMemo<SidebarNavItem[]>(() => {
    const permissions = new Set(user?.permissions ?? []);
    return getSidebarNavItems({ permissions }).filter(isSpineBandTopPin);
  }, [user?.permissions]);

  if (pins.length === 0) return null;

  return (
    <nav
      aria-label="Quick destinations"
      className="flex h-full w-full min-w-0 items-stretch px-0"
    >
      {pins.map((pin) => {
        const Icon = pin.icon;
        const active = isSidebarTopPinActive(pin, { pathname, searchParams });
        return (
          <div key={pin.id} className={SPINE_TOP_PIN_WRAP}>
            <HoverTooltip label={pin.label} asChild>
              <IconButton
                size="md"
                ariaLabel={pin.label}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  router.push(pin.href);
                }}
                // `text-text-default` overrides HEADER_ICON_BTN_CLASS's baked-in
                // `text-text-muted` (2026-08-16) — this band sits inside the
                // MasterNav spine (not GlobalHeader chrome), and its glyphs
                // read as a duller stroke than the spine rows just below it
                // now that those rows paint constant black ink. Same
                // `TOP_CHROME_ICON_FACE` (16px + page stroke 1.5) as every
                // spine row glyph — and, since 2026-08-19, as every GlobalHeader
                // glyph on the other half of the same beam.
                className={cn(
                  HEADER_ICON_BTN_CLASS,
                  // Fill the 40px band cell — IconButton's `active:scale-95`
                  // would inset the wash from the bar on press.
                  'text-text-default active:scale-100',
                  active && HEADER_ICON_BTN_OPEN_CLASS,
                )}
                icon={<Icon className={TOP_CHROME_ICON_FACE} />}
              />
            </HoverTooltip>
          </div>
        );
      })}
    </nav>
  );
}
