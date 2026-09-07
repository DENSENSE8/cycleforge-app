'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowUpDown, Clipboard, MessageSquare, MoreHorizontal, Power, RefreshCw, RotateCcw, Settings } from '@/components/Icons';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
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
import { KeyboardKey } from '@/design-system/primitives/KeyboardKey';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/design-system/primitives/radix-popover';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { StaffAvatarEditor } from '@/components/identity';
import {
  CLIPBOARD_HISTORY_HOTKEY_LABEL,
  openClipboardHistory,
} from '@/components/quick-access/ClipboardHistoryHost';
import { FeedbackPopover } from '@/components/quick-access/FeedbackWidget';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffSwitcher } from '@/contexts/StaffSwitcherContext';
import { orgInitials } from '@/lib/identity/switch-org';
import { cn } from '@/utils/_cn';
import { toast } from '@/lib/toast';
import { useStaffPreferences } from '@/hooks/useStaffPreferences';
import { SPINE_SLOTS_VERSION } from '@/lib/nav/spine-slots';
import { useNavArrange } from './nav-arrange-context';
import { SpineWorkspaceSwitch } from './SpineWorkspaceSwitch';

type OpenMenu = 'none' | 'more' | 'feedback';

/**
 * Spine footer — staff identity, ⋯ overflow, and sign-out. The map's pin band
 * is gone: Studio and Admin are ordinary L1 rows. This menu is report →
 * clipboard → change staff → Settings last.
 *
 * The ⋯ panel is the shadcn/ui Popover (Radix), imported from
 * `src/design-system/primitives/radix-popover.ts` — same altitude as
 * DropdownMenu / Switch, not the DS AnchoredLayer Popover (which animates
 * geometry). `modal={false}` so the HUD is not focus-trapped. Report-an-issue
 * still opens as a sibling layer because it is a panel, not a menu row.
 *
 * Daily account actions only: report an issue, clipboard history (⌘⇧V),
 * change staff, Arrange tabs (`studio.manage`), Settings last. Change staff opens {@link SwitchStaffSheet}
 * (PIN pick) so the station stays signed in. Throw lives on
 * {@link HeaderGoalChip}; phone QR / kiosk preview / desktop download live on
 * Settings → Workstation. Phone scan history is not an account-menu row.
 *
 * **Mobile now follows** (2026-08-21). The phone mounts THIS component at the
 * bottom of its navigation drawer ({@link MobileSidebarDrawer}).
 *
 * The ⋯ menu is a **child of the footer row**: `side="top"` against the row
 * anchor so width tracks the spine. Org name in the menu header is
 * load-bearing. The avatar is a separate click target
 * ({@link StaffAvatarEditor}) for colour + photo.
 * For multi-workspace accounts an ambient org-initials chip sits beside the
 * avatar ({@link SpineWorkspaceSwitch}'s initials language) — the wrong-tenant
 * guard; single-workspace accounts see nothing.
 *
 * Floor band = {@link PRIMARY_CHROME_ROW_FACE} (`h-7` · full spine width). No
 * top hairline — the map already has zero horizontal rules. Identity is one
 * truncated name line inside the flex-1 ⋯ hit target; role stays in the ⋯
 * menu. Sign-out is a flush trailing square — idle muted like the ⋯ peer; the
 * full hit square (wash + glyph + glow) turns danger-red on hover, never idle.
 */
export function StaffAccountFooter({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { canArrange, arranging, setArranging } = useNavArrange();
  const { openSwitcher } = useStaffSwitcher();
  const { prefs, update } = useStaffPreferences();
  const [menu, setMenu] = useState<OpenMenu>('none');
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenu('none');
  }, [pathname]);

  if (!user) return null;

  const staffName = user.name ?? '';
  const moreOpen = menu === 'more';
  const displayName = staffName || `Staff #${user.staffId}`;

  return (
    <div
      className={cn('w-full shrink-0', className)}
      data-staff-account-footer
      data-spine-account-footer
    >
      <Popover
        modal={false}
        open={moreOpen}
        onOpenChange={(next) => {
          if (next) setMenu('more');
          else setMenu((m) => (m === 'more' ? 'none' : m));
        }}
      >
        <PopoverAnchor asChild>
          <div
            ref={rowRef}
            className={cn(
              'flex w-full items-center',
              PRIMARY_CHROME_ROW_FACE,
              'gap-0 pl-2 pr-0',
            )}
          >
            {/* Click the mark to change colour / photo — not Settings. */}
            <StaffAvatarEditor markSize="xs" />
            {/* Ambient workspace identity (2026-09-06): a multi-org account
                carries an org-initials chip beside the avatar — the
                wrong-tenant guard. Same initials language as the
                SpineWorkspaceSwitch rows; hover names the workspace in full.
                Single-org accounts see nothing (⋯ header is the story). */}
            {(user.memberships ?? []).length > 1 ? (
              <HoverTooltip
                label={`${user.organizationName}${user.organizationSlug ? ` · ${user.organizationSlug}` : ''}`}
                asChild
              >
                <span
                  aria-label={`Workspace: ${user.organizationName}`}
                  className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-strong text-role-micro font-semibold text-text-muted"
                >
                  {orgInitials(user.organizationName)}
                </span>
              </HoverTooltip>
            ) : null}
            {/* Flex-1 ⋯ fills everything left of sign-out — name + dots, no dead gap. */}
            <HoverTooltip label="Account details" asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Account details"
                  aria-expanded={moreOpen}
                  className={cn(
                    'ds-raw-button flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-none px-1.5',
                    'text-text-faint hover:bg-surface-hover hover:text-text-default',
                    moreOpen && 'bg-surface-hover text-text-default',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-left text-role-nav font-normal leading-none text-text-default">
                    {displayName}
                  </span>
                  <MoreHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden />
                </button>
              </PopoverTrigger>
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
        </PopoverAnchor>

        <PopoverContent
          role="menu"
          aria-label="Account details"
          side="top"
          align="start"
          sideOffset={4}
          className={cn(
            SIDEBAR_SPINE_MENU_PANEL_CLASS,
            'z-command w-[var(--radix-popper-anchor-width)] p-0',
          )}
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
          {/* Org switching lives at the bottom of the nav itself (2026-09-06):
              one ⋯ click, one org click — same shared switch contract as
              Settings → Organization. Renders nothing for single-org accounts. */}
          <SpineWorkspaceSwitch />
          <div className="space-y-0 p-0">
            <button
              type="button"
              role="menuitem"
              onClick={() => setMenu('feedback')}
              className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
            >
              <MessageSquare className="h-3 w-3 shrink-0 text-text-muted" />
              <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                Report an issue
              </span>
            </button>
            {/* The panel itself is owned by `ClipboardHistoryHost` — this row
                only asks it to open. The host is mounted app-wide, so the chord
                still works on a page where this footer does not exist (the spine
                mounts lazily and starts closed). */}
            <button
              type="button"
              role="menuitem"
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
              <KeyboardKey size="md">{CLIPBOARD_HISTORY_HOTKEY_LABEL}</KeyboardKey>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu('none');
                openSwitcher();
              }}
              className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
            >
              <RefreshCw className="h-3 w-3 shrink-0 text-text-muted" />
              <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                Change staff
              </span>
            </button>
            {canArrange ? (
              <button
                type="button"
                role="menuitem"
                aria-pressed={arranging}
                onClick={() => {
                  setArranging(!arranging);
                  setMenu('none');
                }}
                className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
              >
                <ArrowUpDown className="h-3 w-3 shrink-0 text-text-muted" />
                <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                  {arranging ? 'Done arranging tabs' : 'Arrange tabs'}
                </span>
              </button>
            ) : null}
            {/* Agency, not force: a new DEFAULT order is floated into a saved
                arrangement once and never again, so this is how an operator
                re-derives the current default on purpose. Clearing `spineSlots`
                (not writing a fresh list) is what makes it re-derive — and the
                version is stamped so the float never re-runs. Hidden for an
                operator who has no saved order: they are already on it. */}
            {prefs?.spineSlots?.length ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenu('none');
                  update({ spineSlots: null, spineSlotsVersion: SPINE_SLOTS_VERSION });
                  toast.success('Nav order reset to the default');
                }}
                className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
              >
                <RotateCcw className="h-3 w-3 shrink-0 text-text-muted" />
                <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>Reset nav order</span>
              </button>
            ) : null}
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setMenu('none')}
              className={SIDEBAR_SPINE_MENU_ACTION_CLASS}
            >
              <Settings className="h-3 w-3 shrink-0 text-text-muted" />
              <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>Settings</span>
            </Link>
          </div>
        </PopoverContent>
      </Popover>

      <AnchoredLayer
        open={menu === 'feedback'}
        onClose={() => setMenu('none')}
        anchorRef={rowRef}
        placement="top-start"
        gap={4}
      >
        <FeedbackPopover onClose={() => setMenu('none')} />
      </AnchoredLayer>
    </div>
  );
}
