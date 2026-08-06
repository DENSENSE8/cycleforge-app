'use client';

/**
 * Home · Search · Media · Plans · Chat — the five app-wide destinations.
 *
 * ## Two mounts, one SoT
 *
 * - **Open spine** — {@link SpineTopPins} fills the spine's 40px top band
 *   (header seam geometry). Layout is `justify-between` across the band width.
 * - **Closed spine** — {@link TopDestinationPins} peeks from the header
 *   sidebar toggle (`SidebarCollapseControl`) so cold-load reachability does
 *   not wait on opening the map. Layout is a compact `HEADER_ICON_CLUSTER`.
 *
 * They were four full rows pinned above the map until 2026-08-03, then header
 * icons for part of that day, then spine-band only. The closed-spine peek
 * returned (2026-08-03 evening) and **replaced** the 2s left-edge dwell so
 * that corner has one hover answer: peek pins; click opens the full spine.
 * Plans joined as the fifth pin (2026-08-03) between Media and Chat.
 *
 * As rows they cost the map vertical space. As icons in a band the spine already
 * reserves, they cost it **nothing**. The peek is collapsed-only — never a
 * permanent second door while the spine is open.
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
 * tooltip and its `aria-label`. Five still fit the 40px seam under
 * `justify-between`.
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
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  getSidebarNavItems,
  isSidebarTopPinActive,
  type SidebarNavItem,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_GAP,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_GLYPH,
} from '@/components/layout/header-shell';

/**
 * Shared pin buttons — registry + permission gated. Parents own layout chrome
 * (`band` spread vs compact `cluster`).
 */
export function TopDestinationPins({
  layout = 'band',
  onPinNavigate,
}: {
  /** `band` = spine top strip; `cluster` = collapsed-toggle peek popover. */
  layout?: 'band' | 'cluster';
  /** Fired after a pin navigates (peek dismisses here). */
  onPinNavigate?: () => void;
}) {
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
      className={cn(
        layout === 'band' && 'flex w-full min-w-0 items-stretch justify-between px-0',
        layout === 'cluster' && cn('flex shrink-0 items-stretch', HEADER_ICON_GAP),
      )}
    >
      {pins.map((pin) => {
        const Icon = pin.icon;
        const active = isSidebarTopPinActive(pin, { pathname, searchParams });
        return (
          <div key={pin.id} className={HEADER_ICON_WRAP}>
            <HoverTooltip label={pin.label} asChild>
              <IconButton
                size="md"
                ariaLabel={pin.label}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  router.push(pin.href);
                  onPinNavigate?.();
                }}
                className={cn(HEADER_ICON_BTN_CLASS, active && HEADER_ICON_BTN_OPEN_CLASS)}
                icon={
                  <Icon className={cn(TOP_CHROME_ICON_GLYPH, navIconStrokeClass('page'))} />
                }
              />
            </HoverTooltip>
          </div>
        );
      })}
    </nav>
  );
}

/** Spine-band mount — spreads pins across the 40px header seam. */
export function SpineTopPins() {
  // `px-1` + `justify-between` live on the shared component's `band` layout so
  // the first/last glyphs sit on the same edges as every map row beneath.
  return <TopDestinationPins layout="band" />;
}
