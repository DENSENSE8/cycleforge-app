'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import {
  Clipboard,
  MessageSquare,
  MoreHorizontal,
  Power,
  RefreshCw,
  Settings,
  Smartphone,
} from '@/components/Icons';
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
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from '@/design-system/motion';
import { IconButton } from '@/design-system/primitives';
import {
  Popover,
  PopoverAnchor,
  PopoverTrigger,
} from '@/design-system/primitives/radix-popover';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { StaffAvatarEditor } from '@/components/identity';
import {
  CLIPBOARD_HISTORY_HOTKEY_LABEL,
  openClipboardHistory,
} from '@/components/quick-access/ClipboardHistoryHost';
import { FeedbackPopover } from '@/components/quick-access/FeedbackWidget';
import { PhoneHandoffQrDialog } from '@/components/quick-access/PhoneHandoffQrDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffSwitcher } from '@/contexts/StaffSwitcherContext';
import { cn } from '@/utils/_cn';

type OpenMenu = 'none' | 'more' | 'feedback';

/** shadcn popover fade + zoom-95 — side=top slides from bottom (~8px). */
const ACCOUNT_MENU_MS = 0.15;

/**
 * Spine footer — staff identity, ⋯ overflow, and sign-out. The map's pin band
 * is gone: Studio and Admin are ordinary L1 rows. This menu is report →
 * sign-in-on-phone handoff (desk only) → clipboard → change staff → Settings.
 *
 * The ⋯ panel is Radix Popover + Motion enter/exit (fade · zoom 95% · slide
 * from bottom for `side="top"`), matching shadcn new-york popover. Soft shell
 * comes from {@link SIDEBAR_SPINE_MENU_PANEL_CLASS}. `modal={false}` so the
 * HUD is not focus-trapped. Report-an-issue still opens as a sibling layer
 * because it is a panel, not a menu row.
 *
 * Daily account actions: report an issue, desk→phone session handoff
 * ({@link PhoneHandoffQrDialog} — 4-char code + /m/claim), clipboard history
 * (⌘⇧V), change staff, Settings last. Deep-link-only "Open on your phone"
 * stays on Settings → Workstation ({@link PhoneSignInQrDialog}). Change staff
 * opens {@link SwitchStaffSheet}. Throw lives on {@link HeaderGoalChip}.
 *
 * **Mobile now follows** (2026-08-21). The phone mounts THIS component at the
 * bottom of its navigation drawer ({@link MobileSidebarDrawer}). The phone QR
 * row is omitted there — you are already on the phone.
 *
 * The ⋯ menu is a **child of the footer row**: `side="top"` against the row
 * anchor so width tracks the spine. Org name in the menu header is
 * load-bearing. The avatar is a separate click target
 * ({@link StaffAvatarEditor}) for colour + photo.
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
  const { openSwitcher } = useStaffSwitcher();
  const prefersReducedMotion = useReducedMotion();
  const [menu, setMenu] = useState<OpenMenu>('none');
  const [phoneHandoffOpen, setPhoneHandoffOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  // Phone shell already is the phone — no desk→phone handoff row there.
  const showPhoneHandoff = !pathname.startsWith('/m');

  useEffect(() => {
    setMenu('none');
  }, [pathname]);

  if (!user) return null;

  const staffName = user.name ?? '';
  const moreOpen = menu === 'more';
  const displayName = staffName || `Staff #${user.staffId}`;

  const menuTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: ACCOUNT_MENU_MS, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <div className={cn('w-full shrink-0', className)} data-staff-account-footer data-spine-account-footer>
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

        <AnimatePresence>
          {moreOpen ? (
            <PopoverPrimitive.Portal forceMount key="account-details-portal">
              <PopoverPrimitive.Content
                asChild
                forceMount
                role="menu"
                aria-label="Account details"
                side="top"
                align="start"
                sideOffset={4}
              >
                <motion.div
                  key="account-details-menu"
                  className={cn(
                    SIDEBAR_SPINE_MENU_PANEL_CLASS,
                    'z-command w-[var(--radix-popper-anchor-width)] p-0 outline-none',
                  )}
                  initial={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.95, y: 8 }
                  }
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.95, y: 8 }
                  }
                  transition={menuTransition}
                >
                  <div
                    className={cn(
                      SIDEBAR_SPINE_MENU_HEADER_CLASS,
                      'flex-col items-stretch gap-0.5',
                    )}
                  >
                    <div className={SIDEBAR_SPINE_MENU_ORG_CLASS}>
                      {user.organizationName}
                    </div>
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
                  <div className="space-y-0.5 p-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => setMenu('feedback')}
                      className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                        Report an issue
                      </span>
                    </button>
                    {showPhoneHandoff ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenu('none');
                          setPhoneHandoffOpen(true);
                        }}
                        className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
                      >
                        <Smartphone className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                        <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                          Sign in on phone
                        </span>
                      </button>
                    ) : null}
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
                      <Clipboard className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <span
                        className={cn(
                          SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS,
                          'min-w-0 flex-1 truncate',
                        )}
                      >
                        Clipboard history
                      </span>
                      <kbd className="shrink-0 rounded border border-border-soft bg-surface-canvas px-1 py-0.5 font-mono text-role-micro font-semibold text-text-soft">
                        {CLIPBOARD_HISTORY_HOTKEY_LABEL}
                      </kbd>
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
                      <RefreshCw className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                        Change staff
                      </span>
                    </button>
                    <Link
                      href="/settings"
                      role="menuitem"
                      onClick={() => setMenu('none')}
                      className={SIDEBAR_SPINE_MENU_ACTION_CLASS}
                    >
                      <Settings className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>Settings</span>
                    </Link>
                  </div>
                </motion.div>
              </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
          ) : null}
        </AnimatePresence>
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

      {showPhoneHandoff ? (
        <PhoneHandoffQrDialog open={phoneHandoffOpen} onOpenChange={setPhoneHandoffOpen} />
      ) : null}
    </div>
  );
}
