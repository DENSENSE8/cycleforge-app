'use client';

import { usePathname } from 'next/navigation';
import { useHeader } from '@/contexts/HeaderContext';
import { useAuth, isClientPublicPath } from '@/contexts/AuthContext';
import { GlobalHeaderActions } from './GlobalHeaderActions';
import { HeaderGoalChip } from './HeaderGoalChip';
import { HeaderTopWorkOrderChip } from './HeaderTopWorkOrderChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_CLUSTER,
  HEADER_ICON_WRAP,
  HEADER_INSET_X,
  TOP_CHROME_ICON_GLYPH,
} from './header-shell';
import { appChromeMutedClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/**
 * Global desktop header — one persistent bar mounted once in
 * {@link ResponsiveLayout}, above the page's `<main>`.
 *
 * Zone contract (left → right) — facts drive chrome; empty middle is OK when
 * the station/workbench band below already owns surface context:
 *   - **Toggle** — sidebar collapse (route-gated)
 *   - **Next** — {@link HeaderTopWorkOrderChip} (work-order icon → popover; hidden when none)
 *   - **Pace** — {@link HeaderGoalChip} (progress ring → checklist popover)
 *   - **Context** — page `panelContent` via {@link useHeader}
 *   - **Find / signal / self** — {@link GlobalHeaderActions} (search ⌘K, inbox, account)
 *
 * This bar owns the **only** separator in the desktop frame: one flat `border-b`
 * hairline. `<main>` ({@link appContentShellClass}) used to carry a rounded
 * top-left cutout + a full depth-edge stroke instead; that notched the corner
 * out of every page. The canvas background now runs flat into the top-left and
 * the header line does all the separating — so do NOT re-add a border to
 * `<main>`, or the join doubles up.
 *
 * Mobile keeps its own chrome (MobileAppHeader); this bar is desktop-only.
 */
interface GlobalHeaderProps {
  /** True on routes that render the permanent desktop sidebar (everything but
   *  /operations) — gates the collapse toggle. */
  canCollapseSidebar?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export function GlobalHeader({
  canCollapseSidebar = false,
  sidebarCollapsed = false,
  onToggleSidebar,
}: GlobalHeaderProps = {}) {
  const { panelContent } = useHeader();
  const { user } = useAuth();
  const pathname = usePathname();

  // Public / auth pages (signin, enroll, offline) render no app chrome — even
  // mid-sign-in, when refreshAuth() has already committed `user` but the hard
  // navigation off /signin hasn't unloaded the page yet. Without the path check
  // the bar flashes in over the sign-in splash during that window.
  if (!user || isClientPublicPath(pathname)) return null;

  return (
    // The one flat hairline in the desktop frame (see the block comment above):
    // `<main>` is square-cornered and border-less, so this line is the whole
    // header × canvas separation.
    <header
      className={cn(
        'sticky top-0 z-header flex h-[40px] w-full shrink-0 select-none items-center gap-3 backdrop-blur-sm',
        'border-b border-border-soft',
        HEADER_INSET_X,
        appChromeMutedClass,
      )}
    >
      {/* Left cluster: equal h-8 icon hit-boxes, shared gap + glyph stroke. */}
      <div className={HEADER_ICON_CLUSTER}>
        {canCollapseSidebar && onToggleSidebar && (
          <div className={cn(HEADER_ICON_WRAP, '-ml-1.5')}>
            <HoverTooltip label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'} asChild>
              <IconButton
                size="md"
                onClick={onToggleSidebar}
                ariaLabel={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                aria-pressed={!sidebarCollapsed}
                className={HEADER_ICON_BTN_CLASS}
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={TOP_CHROME_ICON_GLYPH}
                    aria-hidden
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M9 3v18" />
                  </svg>
                }
              />
            </HoverTooltip>
          </div>
        )}
        <HeaderTopWorkOrderChip />
        <HeaderGoalChip />
      </div>

      <div className="flex min-w-0 flex-1 items-center">{panelContent}</div>

      <div className="flex h-8 shrink-0 items-center">
        <GlobalHeaderActions />
      </div>
    </header>
  );
}
