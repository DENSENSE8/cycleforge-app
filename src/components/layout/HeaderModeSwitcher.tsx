'use client';

/**
 * House L2 mode control for GlobalHeader.
 * Closed = active-mode icon; open = AnchoredLayer over {@link SIDEBAR_PAGE_NAV}
 * modes for the current page. Navigates via {@link useSidebarModeNav}.
 * Returns null on modeless pages (no Mode icon).
 */

import { useMemo, useRef, useState } from 'react';
import { AnchoredLayer, IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Check } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveSidebarMode } from '@/components/sidebar/master-nav/useActiveSidebarMode';
import { useSidebarModeNav } from '@/components/sidebar/master-nav/useSidebarModeNav';
import {
  filterPageModes,
  getSidebarPageNav,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_GLYPH,
} from './header-shell';

export function HeaderModeSwitcher() {
  const { user } = useAuth();
  const permissions = useMemo(
    () => (user?.permissions ? new Set(user.permissions) : undefined),
    [user?.permissions],
  );
  const { pageId, modeId } = useActiveSidebarMode();
  const navigate = useSidebarModeNav();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const page = useMemo(() => {
    const raw = getSidebarPageNav(pageId);
    return raw ? filterPageModes(raw, permissions) : null;
  }, [pageId, permissions]);

  const modes = page?.modes;
  const isModeful = Boolean(modes && modes.length > 1);
  const active = modes?.find((m) => m.id === modeId) ?? modes?.[0];

  if (!isModeful || !active || !page) return null;

  const ActiveIcon = active.icon;

  const select = (nextId: string) => {
    setOpen(false);
    if (nextId !== modeId) navigate(pageId, nextId);
  };

  return (
    <div ref={wrapRef} className={HEADER_ICON_WRAP}>
      <HoverTooltip label={`Mode — ${active.label}`} asChild>
        <IconButton
          size="md"
          ariaLabel={`${page.label} mode — ${active.label}`}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((o) => !o)}
          className={cn(HEADER_ICON_BTN_CLASS, open && HEADER_ICON_BTN_OPEN_CLASS)}
          icon={<ActiveIcon className={TOP_CHROME_ICON_GLYPH} />}
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
          aria-label={`${page.label} modes`}
          className="min-w-[11rem] overflow-hidden rounded-xl border border-border-soft bg-surface-card p-1 shadow-[0_12px_40px_rgba(20,30,55,0.16)]"
        >
          {modes!.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === (modeId ?? active.id);
            return (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                aria-current={isActive ? 'true' : undefined}
                onClick={() => select(item.id)}
                className={cn(
                  'ds-raw-button flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text-default',
                  'hover:bg-surface-sunken',
                  focusRing('control', 'accent'),
                  isActive && 'bg-surface-sunken font-medium',
                )}
              >
                <Icon className={cn(TOP_CHROME_ICON_GLYPH, 'shrink-0 text-text-muted')} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {isActive ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
                ) : (
                  <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      </AnchoredLayer>
    </div>
  );
}
