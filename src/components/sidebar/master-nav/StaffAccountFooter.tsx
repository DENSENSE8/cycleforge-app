'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Clipboard,
  Download,
  MessageSquare,
  Monitor,
  MoreHorizontal,
  Power,
  Send,
  Settings,
  Smartphone,
} from '@/components/Icons';
import { STATION_COLUMN_FOOTER_BAND_FACE } from '@/components/layout/header-shell';
import {
  SIDEBAR_SPINE_MENU_ACTION_CLASS,
  SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS,
  SIDEBAR_SPINE_MENU_HEADER_CLASS,
  SIDEBAR_SPINE_MENU_META_CLASS,
  SIDEBAR_SPINE_MENU_ORG_CLASS,
  SIDEBAR_SPINE_MENU_PANEL_CLASS,
  SIDEBAR_SPINE_MENU_TITLE_CLASS,
} from '@/components/sidebar/sidebar-spine';
import { AnchoredLayer } from '@/design-system';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { StaffAvatarEditor } from '@/components/identity';
import { PhoneHistoryPopover } from '@/components/quick-access/PhoneHistoryPopover';
import {
  CLIPBOARD_HISTORY_HOTKEY_LABEL,
  openClipboardHistory,
} from '@/components/quick-access/ClipboardHistoryHost';
import {
  THROW_TASK_HOTKEY_LABEL,
  openThrowTask,
} from '@/components/quick-access/ThrowTaskHost';
import { PhoneSignInQrDialog } from '@/components/quick-access/PhoneSignInQrButton';
import { FeedbackPopover } from '@/components/quick-access/FeedbackWidget';
import { useAuth } from '@/contexts/AuthContext';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import { isDesktopHost } from '@/lib/desktop/desktop-host';
import { DESKTOP_DOWNLOAD_URL } from '@/lib/desktop/desktop-download';
import { openKioskShellPreview } from '@/lib/kiosk/preview-url';
import { cn } from '@/utils/_cn';

type OpenMenu = 'none' | 'more' | 'history' | 'feedback' | 'phone-qr';

/**
 * Spine footer below Settings/Admin — staff identity, more-details menu, and
 * quick sign-out.
 *
 * **This is the desktop account overflow**, and the 2026-08-01 chrome-altitude
 * pass made that load-bearing. The GlobalHeader's top-right rail was six peer
 * icons (search · clipboard · phone QR · kiosk · notifications · assistant);
 * it is now three, and the three that left landed here. The test for whether a
 * control belongs on the persistent rail is FREQUENCY, not existence — a
 * once-a-shift session or setup task does not earn permanent pixels beside
 * notifications. (The docblock here used to read "Kiosk stays header-only";
 * that is exactly the ruling that was reversed.)
 *
 * Mobile does not follow: it has no spine, therefore no account overflow, so
 * `GlobalHeaderActions` keeps clipboard + phone QR in its own icon cluster.
 *
 * **Clipboard history stays here, and now carries its chord** (D5, decided
 * 2026-08-02). Every comparable product — Windows `Win+V`, Paste, Maccy,
 * Raycast, Alfred, Ditto — puts clipboard history in the menu bar / tray rather
 * than on a toolbar, and pairs it with a hotkey; this ⋯ drawer is that slot, so
 * the button was already right and what was missing was `⌘⇧V`. The row is a
 * TRIGGER only: {@link ClipboardHistoryHost} owns the chord and the single
 * panel mount, because this footer does not exist until the spine is first
 * opened. The full reasoning (and why the command palette could not host it)
 * lives in that host's docblock.
 *
 * The ⋯ menu is a **child of the footer row**: `top-stretch` on the row
 * (inset by the footer pad), dense chrome + caption/micro type — never a
 * wider/chunkier twin of the spine. Org name in the menu header is
 * load-bearing. The avatar is a separate click target
 * ({@link StaffAvatarEditor}) for colour + photo — Settings is not required.
 *
 * Floor band = {@link STATION_COLUMN_FOOTER_BAND_FACE} (`h-8` · full spine
 * width · shared hairline with context-rail filters / Displays `→|`). Identity
 * is one truncated name line inside the flex-1 ⋯ hit target; role stays in the
 * ⋯ menu — a two-line stack cannot share the station floor height. Sign-out
 * is a flush trailing square — idle muted like the ⋯ peer; the full hit
 * square (wash + glyph + glow) turns danger-red on hover, never idle.
 */
export function StaffAccountFooter({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { settings } = useQuickAccess();
  const [menu, setMenu] = useState<OpenMenu>('none');
  // The QR overlay is a Dialog, not an anchored layer, so it does not belong in
  // the `menu` union — it must survive the menu closing behind it.
  const [phoneQrOpen, setPhoneQrOpen] = useState(false);
  // Resolved after mount, never during render: the bridge only exists in the
  // shell, so reading it inline would render one thing on the server and
  // another on the client and trip hydration.
  const [inDesktopShell, setInDesktopShell] = useState(false);
  useEffect(() => setInDesktopShell(isDesktopHost()), []);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenu('none');
    setPhoneQrOpen(false);
  }, [pathname]);

  if (!user) return null;

  const staffName = user.name ?? '';
  const showPhoneHistory = !!settings.actions.phoneHistory;
  const moreOpen = menu === 'more';
  const displayName = staffName || `Staff #${user.staffId}`;

  return (
    <div className={cn('w-full shrink-0', className)} data-staff-account-footer>
      <div
        ref={rowRef}
        className={cn(STATION_COLUMN_FOOTER_BAND_FACE, 'gap-0 pl-2 pr-0')}
      >
        {/* Click the mark to change colour / photo — not Settings. */}
        <StaffAvatarEditor markSize="xs" />
        {/* Flex-1 ⋯ fills everything left of sign-out — name + dots, no dead gap. */}
        <HoverTooltip label="Account details" asChild>
          <button
            type="button"
            onClick={() => setMenu((m) => (m === 'more' ? 'none' : 'more'))}
            aria-label="Account details"
            aria-expanded={moreOpen}
            className={cn(
              'ds-raw-button flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-none px-1.5',
              'text-text-faint hover:bg-surface-hover hover:text-text-default',
              moreOpen && 'bg-surface-hover text-text-default',
            )}
          >
            <span className="min-w-0 flex-1 truncate text-left text-role-nav font-medium leading-none text-text-default">
              {displayName}
            </span>
            <MoreHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </button>
        </HoverTooltip>
        <HoverTooltip label="Sign out" asChild>
          <IconButton
            type="button"
            size="md"
            onClick={() => {
              void signOut();
            }}
            ariaLabel="Sign out"
            className="group shrink-0 rounded-none text-text-faint hover:bg-surface-danger hover:text-text-danger"
            icon={
              <Power
                className="h-3.5 w-3.5 group-hover:drop-shadow-[0_0_6px_currentColor]"
                aria-hidden
              />
            }
          />
        </HoverTooltip>
      </div>

      <AnchoredLayer
        open={moreOpen}
        onClose={() => setMenu('none')}
        anchorRef={rowRef}
        placement="top-stretch"
        gap={4}
      >
        <div
          role="menu"
          aria-label="Account details"
          className={SIDEBAR_SPINE_MENU_PANEL_CLASS}
        >
          <div className={cn(SIDEBAR_SPINE_MENU_HEADER_CLASS, 'flex-col items-stretch gap-0')}>
            <div className={SIDEBAR_SPINE_MENU_ORG_CLASS}>{user.organizationName}</div>
            <div className={SIDEBAR_SPINE_MENU_TITLE_CLASS}>
              {staffName || `Staff #${user.staffId}`}
            </div>
            <div className={SIDEBAR_SPINE_MENU_META_CLASS}>
              {user.organizationSlug ?? '—'}
              {user.organizationPlan ? ` · ${user.organizationPlan} plan` : ''}
              {' · '}
              {user.role.replace(/_/g, ' ')}
            </div>
          </div>
          <div className="space-y-0 p-0">
            {showPhoneHistory ? (
              <button
                type="button"
                onClick={() => setMenu('history')}
                className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
              >
                <Smartphone className="h-3 w-3 shrink-0 text-text-muted" />
                <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                  Phone history
                </span>
              </button>
            ) : null}
            {/* Throwing a task is the discovery half of the ⌘⇧U chord — the
                menu-bar entry that teaches it exists, exactly as clipboard
                history does below. Not a sixth header icon: the actions cluster
                is capped at five, and a handoff is a few times a shift. */}
            <button
              type="button"
              onClick={() => {
                setMenu('none');
                openThrowTask();
              }}
              className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
            >
              <Send className="h-3 w-3 shrink-0 text-text-muted" />
              <span className={cn(SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS, 'min-w-0 flex-1 truncate')}>
                Throw a task
              </span>
              <kbd className="shrink-0 rounded border border-border-soft bg-surface-canvas px-1 py-0.5 font-mono text-role-micro font-semibold text-text-soft">
                {THROW_TASK_HOTKEY_LABEL}
              </kbd>
            </button>
            {/* The panel itself is owned by `ClipboardHistoryHost` — this row
                only asks it to open. The host is mounted app-wide, so the chord
                still works on a page where this footer does not exist (the spine
                mounts lazily and starts closed). */}
            <button
              type="button"
              onClick={() => {
                setMenu('none');
                openClipboardHistory();
              }}
              className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
            >
              <Clipboard className="h-3 w-3 shrink-0 text-text-muted" />
              <span className={cn(SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS, 'min-w-0 flex-1 truncate')}>
                Clipboard history
              </span>
              {/* Imported from the binder so a rebinding can never leave a
                  stale hint — a false shortcut hint is worse than none. */}
              <kbd className="shrink-0 rounded border border-border-soft bg-surface-canvas px-1 py-0.5 font-mono text-role-micro font-semibold text-text-soft">
                {CLIPBOARD_HISTORY_HOTKEY_LABEL}
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu('none');
                setPhoneQrOpen(true);
              }}
              className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
            >
              <Smartphone className="h-3 w-3 shrink-0 text-text-muted" />
              <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                Open on your phone
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                openKioskShellPreview(user.organizationSlug ?? undefined);
                setMenu('none');
              }}
              className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
            >
              <Monitor className="h-3 w-3 shrink-0 text-text-muted" />
              <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                Kiosk shell preview
              </span>
            </button>
            {/* Get-this-on-another-device sits with its siblings (phone, kiosk).
                Hidden inside the shell itself — advertising a download in the
                app you downloaded is chrome telling a second story. This is an
                overflow row and not a header icon by the same rule the clipboard
                and phone-QR followed: a persistent slot is earned by FREQUENCY,
                and installing the desktop app happens once per bench. */}
            {!inDesktopShell && (
              <a
                href={DESKTOP_DOWNLOAD_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenu('none')}
                className={SIDEBAR_SPINE_MENU_ACTION_CLASS}
              >
                <Download className="h-3 w-3 shrink-0 text-text-muted" />
                <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                  Download desktop app
                </span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setMenu('feedback')}
              className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
            >
              <MessageSquare className="h-3 w-3 shrink-0 text-text-muted" />
              <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                Report an issue
              </span>
            </button>
            <Link
              href="/settings?section=quick-access"
              onClick={() => setMenu('none')}
              className={SIDEBAR_SPINE_MENU_ACTION_CLASS}
            >
              <Settings className="h-3 w-3 shrink-0 text-text-muted" />
              <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                Quick Access settings
              </span>
            </Link>
          </div>
        </div>
      </AnchoredLayer>

      <AnchoredLayer
        open={menu === 'history'}
        onClose={() => setMenu('none')}
        anchorRef={rowRef}
        placement="top-start"
        gap={4}
      >
        <PhoneHistoryPopover onClose={() => setMenu('none')} />
      </AnchoredLayer>

      <AnchoredLayer
        open={menu === 'feedback'}
        onClose={() => setMenu('none')}
        anchorRef={rowRef}
        placement="top-start"
        gap={4}
      >
        <FeedbackPopover onClose={() => setMenu('none')} />
      </AnchoredLayer>

      <PhoneSignInQrDialog open={phoneQrOpen} onOpenChange={setPhoneQrOpen} />
    </div>
  );
}
