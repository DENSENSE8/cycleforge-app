'use client';

/**
 * Cross-page MRU jump control for GlobalHeader (house SoT).
 * Closed = History icon; open = {@link useRecentModes} list. Navigates via
 * {@link useSidebarModeNav}. Collapsed by default — no always-visible chips
 * in the spine header (those were removed; this popover is the only MRU face).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AnchoredLayer, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { History } from '@/components/Icons';
import { NAV_ICON_PAGE_STROKE_CLASS } from '@/components/icons/nav-weight';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgNavItems } from '@/hooks/useOrgNavItems';
import { prefetchNavData } from '@/lib/nav/nav-data-prefetch';
import {
  filterPageModes,
  getSidebarPageNav,
  type SidebarNavItem,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import { useActiveSidebarMode } from '@/components/sidebar/master-nav/useActiveSidebarMode';
import { useSidebarModeNav } from '@/components/sidebar/master-nav/useSidebarModeNav';
import {
  MAX_RECENT_MODES,
  useRecentModes,
} from '@/components/sidebar/master-nav/useRecentModes';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_GLYPH,
} from './header-shell';

function toPageNav(item: SidebarNavItem): SidebarPageNav {
  const page = getSidebarPageNav(item.id);
  return page ? { ...page, icon: item.icon, label: item.label } : item;
}

export function HeaderRecentsSwitcher() {
  const { user } = useAuth();
  const permissions = useMemo(
    () => (user?.permissions ? new Set(user.permissions) : undefined),
    [user?.permissions],
  );
  const { pageId, modeId } = useActiveSidebarMode();
  const navigate = useSidebarModeNav();
  const { recents: recentModeRefs, pushRecent } = useRecentModes();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Header is always-visible chrome — keep MRU fresh even when the spine is
  // collapsed (MasterNav no longer owns pushRecent).
  useEffect(() => {
    pushRecent(pageId, modeId);
  }, [pageId, modeId, pushRecent]);

  const navItems = useOrgNavItems({ permissions });
  const pages = useMemo(
    () => navItems.map(toPageNav).map((page) => filterPageModes(page, permissions)),
    [navItems, permissions],
  );

  const isModeful = Boolean(
    pages.find((p) => p.id === pageId)?.modes &&
      (pages.find((p) => p.id === pageId)?.modes?.length ?? 0) > 1,
  );

  const entries = useMemo(() => {
    const currentKey = `${pageId}:${modeId ?? ''}`;
    const out: {
      key: string;
      label: string;
      icon: SidebarPageNav['icon'];
      pageId: string;
      modeId: string | null;
      href: string;
    }[] = [];
    for (const ref of recentModeRefs) {
      if (out.length >= MAX_RECENT_MODES) break;
      const key = `${ref.pageId}:${ref.modeId ?? ''}`;
      if (key === currentKey) continue;
      if (isModeful && ref.pageId === pageId) continue;
      const page = pages.find((p) => p.id === ref.pageId);
      if (!page) continue;
      const mode = ref.modeId ? page.modes?.find((m) => m.id === ref.modeId) : undefined;
      if (ref.modeId && !mode && page.modes && page.modes.length > 0) continue;
      const label =
        mode && page.modes && page.modes.length > 1
          ? `${page.label} · ${mode.label}`
          : mode?.label ?? page.label;
      out.push({
        key,
        label,
        icon: mode?.icon ?? page.icon,
        pageId: ref.pageId,
        modeId: ref.modeId,
        href: page.href,
      });
    }
    return out;
  }, [isModeful, recentModeRefs, pages, pageId, modeId]);

  const select = useCallback(
    (entry: (typeof entries)[number]) => {
      setOpen(false);
      navigate(entry.pageId, entry.modeId ?? undefined);
    },
    [navigate],
  );

  return (
    <div ref={wrapRef} className={HEADER_ICON_WRAP}>
      <HoverTooltip label="Recents" asChild>
        <IconButton
          size="md"
          ariaLabel="Recents"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((o) => !o)}
          className={cn(HEADER_ICON_BTN_CLASS, open && HEADER_ICON_BTN_OPEN_CLASS)}
          icon={<History className={TOP_CHROME_ICON_GLYPH} />}
        />
      </HoverTooltip>

      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={wrapRef}
        placement="bottom-start"
        gap={8}
      >
        <div
          role="menu"
          aria-label="Recent modes"
          className="min-w-[12rem] overflow-hidden rounded-xl border border-border-soft bg-surface-card p-1 shadow-[0_12px_40px_rgba(20,30,55,0.16)]"
        >
          {entries.length === 0 ? (
            <p className="px-2.5 py-2 text-role-caption text-text-faint">No recent modes</p>
          ) : (
            entries.map((entry) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.key}
                  type="button"
                  role="menuitem"
                  onClick={() => select(entry)}
                  onMouseEnter={() => prefetchNavData(entry.href, queryClient)}
                  className={cn(
                    'ds-raw-button flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-role-eyebrow text-text-default',
                    'hover:bg-surface-sunken',
                    focusRing('control', 'accent'),
                  )}
                >
                  <Icon
                    className={cn(
                      NAV_ICON_PAGE_STROKE_CLASS,
                      TOP_CHROME_ICON_GLYPH,
                      'shrink-0 text-text-muted',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">{entry.label}</span>
                </button>
              );
            })
          )}
        </div>
      </AnchoredLayer>
    </div>
  );
}
