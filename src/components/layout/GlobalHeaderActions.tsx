'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnchoredLayer } from '@/design-system';
import { IconButton } from '@/design-system/primitives';
import { Inbox, Clipboard } from '@/components/Icons';
import { GlobalHeaderSearch } from '@/components/layout/GlobalHeaderSearch';
import { GlobalHeaderAssistantButton } from '@/components/layout/GlobalHeaderAssistantButton';
import { HeaderGoalChip } from '@/components/layout/HeaderGoalChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { useAuth } from '@/contexts/AuthContext';
import { useActivityInboxOptional } from '@/contexts/ActivityInboxContext';
import { QuickAccessPopover } from '@/components/quick-access/QuickAccessPopover';
import { PhoneHistoryPopover } from '@/components/quick-access/PhoneHistoryPopover';
import { ActivityInboxPopover } from '@/components/quick-access/ActivityInboxPopover';
import { ClipboardHistoryPopover } from '@/components/quick-access/ClipboardHistoryPopover';
import { FeedbackPopover } from '@/components/quick-access/FeedbackWidget';
import { PhoneSignInQrButton } from '@/components/quick-access/PhoneSignInQrButton';
import { getStaffThemeById, stationThemeColors } from '@/utils/staff-colors';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_CLUSTER,
  HEADER_ICON_GAP,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from './header-shell';

type OpenPopover = 'none' | 'history' | 'inbox' | 'account' | 'clipboard' | 'feedback';

/**
 * Matches `RightRailHost` at rest — min width keeps icons column-aligned with
 * the detail panel. Grows left when search expands (icons stay `shrink-0`).
 */
const HEADER_RAIL_WIDTH = 'min-w-[420px]';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Persistent **actions** zone of the {@link GlobalHeader} (far-right).
 *
 * Desktop order (left → right): **search · goal · work order · inbox ·
 * assistant (far-right)**. Sparkles opens the assistant right-rail occupant, so
 * it sits at the edge it owns (mirror of MasterNav collapse on the far left).
 * Staff identity + org live on the MasterNav spine — no avatar here.
 *
 * Clipboard history, phone sign-in QR, and kiosk preview stay in the spine
 * account overflow ({@link StaffAccountFooter} ⋯) — earned by frequency, not
 * existence. Goal / work-order are session glanceables on desktop only; mobile
 * keeps goal on {@link MobileTopBar} and does not remount them here.
 *
 * Mobile keeps its own utility cluster — it has no MasterNav spine, so it has no
 * account overflow to move clipboard / phone QR into — plus a compact account
 * avatar. AI stays desktop-only with the rest of the right-rail chrome.
 */
export function GlobalHeaderActions({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' } = {}) {
  const isMobile = variant === 'mobile';
  const pathname = usePathname();
  const { user } = useAuth();
  const inbox = useActivityInboxOptional();
  const inboxCount = inbox?.items.length ?? 0;

  const [popover, setPopover] = useState<OpenPopover>('none');
  const clipboardAnchorRef = useRef<HTMLDivElement>(null);
  const inboxAnchorRef = useRef<HTMLDivElement>(null);
  const accountAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPopover('none');
  }, [pathname]);

  if (!user) return null;

  const inboxOpen = popover === 'inbox';
  const clipboardOpen = popover === 'clipboard';
  const accountOpen = popover === 'account';

  const sc = stationThemeColors[getStaffThemeById(user.staffId)];
  const displayName = user.name;
  const accountInitial = initials(displayName) || '·';

  const iconBtnSize = isMobile ? ('touch' as const) : ('md' as const);
  const iconSize = isMobile ? 'h-5 w-5' : TOP_CHROME_ICON_FACE;
  const avatarSize = 'h-9 w-9 text-sm';
  const wrapClass = isMobile ? 'relative flex h-11 w-11 shrink-0 items-center justify-center' : HEADER_ICON_WRAP;

  /**
   * Mobile-only utilities. Desktop reaches these from the spine account
   * overflow ({@link StaffAccountFooter} ⋯); mobile has no spine, so removing
   * them here would orphan them rather than relocate them.
   */
  const mobileUtilityCluster = isMobile ? (
    <>
      <div ref={clipboardAnchorRef} className={wrapClass}>
        <HoverTooltip label="Clipboard history" asChild>
          <IconButton
            type="button"
            size={iconBtnSize}
            onClick={() => setPopover((p) => (p === 'clipboard' ? 'none' : 'clipboard'))}
            ariaLabel="Clipboard history"
            aria-expanded={clipboardOpen}
            className={cn(HEADER_ICON_BTN_CLASS, clipboardOpen && HEADER_ICON_BTN_OPEN_CLASS)}
            icon={<Clipboard className={iconSize} />}
          />
        </HoverTooltip>
        <AnchoredLayer
          open={clipboardOpen}
          onClose={() => setPopover('none')}
          anchorRef={clipboardAnchorRef}
          placement="bottom-end"
          gap={0}
        >
          <ClipboardHistoryPopover onClose={() => setPopover('none')} />
        </AnchoredLayer>
      </div>

      <div className={wrapClass}>
        <PhoneSignInQrButton size={iconBtnSize} iconClassName={iconSize} />
      </div>
    </>
  ) : null;

  const iconCluster = (
    <>
      {mobileUtilityCluster}

      <div ref={inboxAnchorRef} className={wrapClass}>
        <HoverTooltip label="Notifications" asChild>
          <IconButton
            type="button"
            size={iconBtnSize}
            onClick={() => setPopover((p) => (p === 'inbox' ? 'none' : 'inbox'))}
            ariaLabel="Notifications"
            aria-expanded={inboxOpen}
            className={cn(HEADER_ICON_BTN_CLASS, inboxOpen && HEADER_ICON_BTN_OPEN_CLASS)}
            icon={
              <span className={cn('relative inline-flex shrink-0 items-center justify-center', iconSize)}>
                <Inbox className={iconSize} />
                {inboxCount > 0 && (
                  <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-3 min-w-[12px] items-center justify-center rounded-full bg-rose-600 px-0.5 text-role-micro leading-none tabular-nums text-white ring-1 ring-white">
                    {inboxCount > 9 ? '9+' : inboxCount}
                  </span>
                )}
              </span>
            }
          />
        </HoverTooltip>
        <AnchoredLayer
          open={inboxOpen}
          onClose={() => setPopover('none')}
          anchorRef={inboxAnchorRef}
          placement="bottom-end"
          gap={0}
        >
          <ActivityInboxPopover onClose={() => setPopover('none')} />
        </AnchoredLayer>
      </div>

      {/* Mobile only — desktop staff identity lives on the MasterNav spine footer. */}
      {isMobile ? (
        <div ref={accountAnchorRef} className={wrapClass}>
          <HoverTooltip label={displayName || `Staff #${user.staffId}`} asChild>
            {/* ds-raw-button: HoverTooltip asChild Slot — IconButton would disturb the clone */}
            <button
              type="button"
              onClick={() => setPopover((p) => (p === 'account' ? 'none' : 'account'))}
              aria-label="Account & quick access"
              aria-expanded={accountOpen}
              className={cn(
                'ds-raw-button flex items-center justify-center rounded-full font-semibold transition-transform active:scale-95',
                avatarSize,
                sc.bg,
                'text-white',
                accountOpen && 'ring-2 ring-border-default ring-offset-1',
              )}
            >
              {accountInitial}
            </button>
          </HoverTooltip>
          <AnchoredLayer
            open={accountOpen}
            onClose={() => setPopover('none')}
            anchorRef={accountAnchorRef}
            placement="bottom-end"
            gap={0}
          >
            <QuickAccessPopover
              onClose={() => setPopover('none')}
              onOpenHistoryPopover={() => setPopover('history')}
              onOpenFeedbackPopover={() => setPopover('feedback')}
              compact
            />
          </AnchoredLayer>
          <AnchoredLayer
            open={popover === 'history'}
            onClose={() => setPopover('none')}
            anchorRef={accountAnchorRef}
            placement="bottom-end"
            gap={0}
          >
            <PhoneHistoryPopover onClose={() => setPopover('none')} />
          </AnchoredLayer>
          <AnchoredLayer
            open={popover === 'feedback'}
            onClose={() => setPopover('none')}
            anchorRef={accountAnchorRef}
            placement="bottom-end"
            gap={0}
          >
            <FeedbackPopover onClose={() => setPopover('none')} />
          </AnchoredLayer>
        </div>
      ) : null}
    </>
  );

  if (isMobile) {
    return <div className="flex h-full items-center gap-1.5">{iconCluster}</div>;
  }

  // Order: search · pace-and-next (goal ring) · inbox · assistant (far-right).
  // Search stays mounted on `/search` (and carton detail) so find is always
  // reachable from the header — page-rail entry is additive, not a replacement.
  // Stretch the row to the header beam so expanded find + icon washes lock flush.
  return (
    <div
      className={cn(
        'flex h-full shrink-0 items-stretch justify-end',
        HEADER_ICON_GAP,
        HEADER_RAIL_WIDTH,
      )}
    >
      <GlobalHeaderSearch />
      <div className={HEADER_ICON_CLUSTER} data-header-zone="actions">
        <HeaderGoalChip />
        {iconCluster}
        <GlobalHeaderAssistantButton />
      </div>
    </div>
  );
}
