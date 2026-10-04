'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import {
  Clipboard,
  MessageSquare,
  Monitor,
  Power,
  RefreshCw,
  Settings,
  Smartphone,
} from '@/components/Icons';
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
import {
  Popover,
  PopoverAnchor,
  PopoverTrigger,
} from '@/design-system/primitives/radix-popover';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/components/ui/button';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { elevationClass } from '@/design-system/tokens/shadows';
import { orgInitials } from '@/lib/identity/switch-org';
import { useSwitchOrg } from '@/lib/identity/use-switch-org';
import {
  CLIPBOARD_HISTORY_HOTKEY_LABEL,
  openClipboardHistory,
} from '@/components/quick-access/ClipboardHistoryHost';
import { FeedbackPopover } from '@/components/quick-access/FeedbackWidget';
import { PhoneHandoffQrDialog } from '@/components/quick-access/PhoneHandoffQrDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffSwitcher } from '@/contexts/StaffSwitcherContext';
import { openKioskShellPreview } from '@/lib/kiosk/preview-url';
import { cn } from '@/utils/_cn';

type OpenMenu = 'none' | 'more' | 'feedback';

/** shadcn popover fade + zoom-95 — side=top slides from bottom (~8px). */
const ACCOUNT_MENU_MS = 0.15;

/** Spine footer — the phone's account bar, imported to the desk (2026-09-15). */
export function StaffAccountFooter({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { openSwitcher } = useStaffSwitcher();
  const { switching, switchErr, switchTo } = useSwitchOrg();
  const prefersReducedMotion = useReducedMotion();
  const [menu, setMenu] = useState<OpenMenu>('none');
  const [phoneHandoffOpen, setPhoneHandoffOpen] = useState(false);
  const rowRef = useRef<HTMLElement>(null);
  // Phone shell already is the phone — no desk→phone handoff row there.
  const showPhoneHandoff = !pathname.startsWith('/m');

  useEffect(() => {
    setMenu('none');
  }, [pathname]);

  if (!user) return null;

  const staffName = user.name ?? '';
  const moreOpen = menu === 'more';
  const displayName = staffName || `Staff #${user.staffId}`;
  const otherOrgs = (user.memberships ?? []).filter((m) => !m.isCurrent);

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
          <footer
            ref={rowRef}
            className={cn('w-full shrink-0 bg-surface-card', elevationClass('flat'))}
          >
            {/* shadcn ghost chrome (not an ops CTA — the DS Button law is
                untouched), the phone's full-bleed-row pattern: the BUTTON is
                edge-to-edge (px-0), the CONTENT carries the inset (px-3). */}
            <HoverTooltip label="Account details" asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  aria-label={`Account details, signed in as ${displayName}`}
                  className="h-auto min-h-11 w-full justify-start px-0 py-2.5 text-left text-text-default"
                >
                  <span className="flex w-full items-center gap-2.5 px-3">
                    <StaffAvatar
                      staffId={user.staffId}
                      name={displayName}
                      avatarPhotoId={user.avatarPhotoId ?? null}
                      size="md"
                      alt=""
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium leading-tight">{displayName}</span>
                      {user.email ? (
                        <span className="block truncate text-role-micro font-normal leading-tight text-text-soft">
                          {user.email}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Button>
              </PopoverTrigger>
            </HoverTooltip>
          </footer>
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
                    {user.authorizationMode === 'authenticated-only' ? (
                      <div className="mt-1 text-role-micro font-semibold text-amber-700">
                        Access: Dogfood full access
                      </div>
                    ) : null}
                  </div>
                  {otherOrgs.length > 0 ? (
                    <div className="space-y-0.5 border-b border-border-hairline p-1">
                      {otherOrgs.map((m) => (
                        <button
                          key={m.organizationId}
                          type="button"
                          role="menuitem"
                          disabled={!!switching}
                          onClick={() => {
                            void switchTo(m.organizationId, m.organizationName);
                          }}
                          className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-surface-strong text-role-micro font-semibold text-text-muted">
                            {orgInitials(m.organizationName)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-role-caption font-medium leading-tight text-text-default">
                              {switching === m.organizationId ? 'Switching…' : m.organizationName}
                            </span>
                            <span className="block truncate text-role-micro leading-tight text-text-soft">
                              {m.organizationSlug ?? '—'}
                              {m.role ? ` · ${m.role.replace(/_/g, ' ')}` : ''}
                            </span>
                          </span>
                        </button>
                      ))}
                      {switchErr ? (
                        <div className="px-2.5 pb-1 text-role-micro text-text-danger">
                          {switchErr}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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
                    {/* The panel itself is owned by `ClipboardHistoryHost` — this row only asks it to open. */}
                    <HoverTooltip label="Clipboard history" shortcut={CLIPBOARD_HISTORY_HOTKEY_LABEL} asChild>
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
                      </button>
                    </HoverTooltip>
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="staff-account-kiosk"
                      onClick={() => {
                        setMenu('none');
                        openKioskShellPreview(user.organizationSlug);
                      }}
                      className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
                    >
                      <Monitor className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                        Open kiosk
                      </span>
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
                        Switch staff
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
                  {/* Sign-out — the panel's bottom row, hairline-separated.
                      The trailing power square is gone; this is the only
                      sign-out door on the spine. */}
                  <div className="border-t border-border-hairline p-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu('none');
                        void signOut();
                      }}
                      className={cn(
                        'ds-raw-button group',
                        SIDEBAR_SPINE_MENU_ACTION_CLASS,
                        'hover:bg-surface-danger hover:text-text-danger',
                      )}
                    >
                      <Power
                        className="h-3.5 w-3.5 shrink-0 text-text-muted group-hover:text-text-danger group-hover:drop-shadow-[0_0_6px_currentColor]"
                        aria-hidden
                      />
                      <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                        Log out
                      </span>
                    </button>
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
