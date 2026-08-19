'use client';

/**
 * Home · Search · Media · Plans · Chat — the five app-wide destinations.
 *
 * ## One mount, one SoT
 *
 * {@link SpineTopPins} fills the open spine's 40px top band (header seam
 * geometry). Layout is equal `flex-1` cells across the band width so hover
 * washes abut with no gaps. When the spine is closed, reach these via ⌘K /
 * opening the map — the header toggle is click-only (no hover peek).
 *
 * They were four full rows pinned above the map until 2026-08-03, then header
 * icons for part of that day, then spine-band only. A closed-spine hover peek
 * existed briefly and was removed so the toggle stays a plain Show/Hide
 * control. Plans joined as the fifth pin (2026-08-03) between Media and Chat.
 *
 * As rows they cost the map vertical space. As icons in a band the spine already
 * reserves, they cost it **nothing**.
 *
 * ## The registry still owns them
 *
 * They stay `kind: 'top'` in `APP_SIDEBAR_NAV`, so ⌘K, the flat spine search and
 * `nav-destinations` keep ranking them; `SidebarNavList` simply does not draw
 * them as rows. Permission gating rides along — Media needs `photos.view`, Plans
 * needs `operations.plans.view`, Chat needs `dashboard.view` — via
 * {@link getSidebarNavItems}, so a staffer without the permission gets no icon
 * rather than a dead one.
 *
 * Icon-only is what makes the band affordable: all five are conventional glyphs
 * (house · magnifier · images · zap · message), each carrying its label as a
 * tooltip and its `aria-label`. Five equal-fill cells span the 40px seam.
 *
 * Active state is query-aware ({@link isSidebarTopPinActive}): on forge, Plans
 * is current and Home is idle so the two never both light.
 *
 * **Named for the job, not the birthplace.** It shipped as `HeaderTopPins` for
 * the hours it lived permanently in the GlobalHeader; a shell keeping its first
 * address in its name is how `StationComposerDock` came to describe a dock that
 * Support also owned.
 */

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSidebarNavItems,
  isSidebarTopPinActive,
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
    return getSidebarNavItems({ permissions }).filter((item) => item.kind === 'top');
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
                  'text-text-default',
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
