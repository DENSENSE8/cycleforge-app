'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
  PopoverTrigger,
} from '@/design-system/primitives/radix-popover';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { RoleColorPicker } from '@/components/admin/roles/RoleColorPicker';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { IconButton } from '@/design-system/primitives';
import { HEADER_ICON_BTN_OPEN_CLASS } from '@/components/layout/header-shell';
import { orgInitials } from '@/lib/identity/switch-org';
import { useSwitchOrg } from '@/lib/identity/use-switch-org';
import {
  CLIPBOARD_HISTORY_HOTKEY_LABEL,
  openClipboardHistory,
} from '@/components/quick-access/ClipboardHistoryHost';
import { FeedbackPopover } from '@/components/quick-access/FeedbackWidget';
import { PhoneHandoffQrDialog } from '@/components/quick-access/PhoneHandoffQrDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { qk } from '@/queries/keys';
import { getStaffColorHex, setStaffColorHex } from '@/utils/staff-colors';
import { useStaffSwitcher } from '@/contexts/StaffSwitcherContext';
import { openKioskShellPreview } from '@/lib/kiosk/preview-url';
import { cn } from '@/utils/_cn';

type OpenMenu = 'none' | 'more' | 'feedback';

/** shadcn popover fade + zoom-95 — side=bottom slides down from the icon (~8px). */
const ACCOUNT_MENU_MS = 0.15;

/**
 * Signed-in staff, as an icon. The menu opens under it: log out, switch
 * staff, phone, kiosk, clipboard, report, settings, other organizations,
 * and the current organization name last. The page stays at full strength.
 */
export function StaffAccountMenu({
  className,
  size = 'md',
}: {
  className?: string;
  /** `md` is the header key. `touch` is the phone bar, left of the scan seat. */
  size?: 'md' | 'touch';
}) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  useStaffColorVersion();
  const { openSwitcher } = useStaffSwitcher();
  const { switching, switchErr, switchTo } = useSwitchOrg();
  const prefersReducedMotion = useReducedMotion();
  const [menu, setMenu] = useState<OpenMenu>('none');
  const [colorOpen, setColorOpen] = useState(false);
  const [colorBusy, setColorBusy] = useState(false);
  const [colorError, setColorError] = useState<string | null>(null);
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
  const otherOrgs = (user.memberships ?? []).filter((m) => !m.isCurrent);

  const menuTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: ACCOUNT_MENU_MS, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <div
      ref={rowRef}
      className={cn('flex h-full shrink-0 items-center px-1', className)}
      data-staff-account
    >
      <Popover
        modal={false}
        open={moreOpen}
        onOpenChange={(next) => {
          if (next) setMenu('more');
          else setMenu((m) => (m === 'more' ? 'none' : m));
        }}
      >
        <HoverTooltip label={`Signed in as ${displayName}`} disabled={moreOpen} asChild>
          <PopoverTrigger asChild>
            <IconButton
              size={size}
              radius="control"
              ariaLabel={`Account details, signed in as ${displayName}`}
              aria-expanded={moreOpen}
              data-state={moreOpen ? 'open' : 'closed'}
              data-testid="staff-account-button"
              className={cn(
                'text-text-default hover:bg-surface-sunken',
                moreOpen && HEADER_ICON_BTN_OPEN_CLASS,
              )}
              icon={
                <StaffAvatar
                  staffId={user.staffId}
                  name={displayName}
                  avatarPhotoId={user.avatarPhotoId ?? null}
                  size={size === 'touch' ? 'md' : 'sm'}
                  ring={false}
                  alt=""
                />
              }
            />
          </PopoverTrigger>
        </HoverTooltip>

        <AnimatePresence>
          {moreOpen ? (
            <PopoverPrimitive.Portal forceMount key="account-details-portal">
              <PopoverPrimitive.Content
                asChild
                forceMount
                role="menu"
                aria-label="Account details"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <motion.div
                  key="account-details-menu"
                  className={cn(
                    SIDEBAR_SPINE_MENU_PANEL_CLASS,
                    'z-command w-72 max-w-[calc(100vw-1rem)] origin-top-right p-0 outline-none',
                  )}
                  initial={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.95, y: -8 }
                  }
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, scale: 0.95, y: -8 }
                  }
                  transition={menuTransition}
                >
                  <div className="space-y-0.5 p-1">
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="staff-account-logout"
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
                    <div>
                      <div className="px-2.5" aria-hidden>
                        <div className="h-px bg-border-hairline" data-testid="staff-account-rule" />
                      </div>
                      <button
                        type="button"
                        role="menuitem"
                        aria-expanded={colorOpen}
                        data-testid="staff-account-color"
                        onClick={() => setColorOpen((open) => !open)}
                        className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
                      >
                        <span
                          aria-hidden
                          className="size-3.5 shrink-0 rounded-full"
                          style={{ backgroundColor: getStaffColorHex({ id: user.staffId }) }}
                        />
                        <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>Color</span>
                      </button>
                      {colorOpen ? (
                        <div className="px-2.5 pb-1.5">
                          <RoleColorPicker
                            value={getStaffColorHex({ id: user.staffId })}
                            disabled={colorBusy}
                            onChange={(hex) => {
                              const current = getStaffColorHex({ id: user.staffId });
                              if (hex.toLowerCase() === current.toLowerCase()) return;
                              setColorBusy(true);
                              setColorError(null);
                              setStaffColorHex(user.staffId, hex);
                              void (async () => {
                                try {
                                  const res = await fetch(`/api/staff/${user.staffId}/color`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ color_hex: hex }),
                                  });
                                  const json = (await res.json().catch(() => ({}))) as {
                                    colorHex?: string;
                                    error?: string;
                                  };
                                  if (!res.ok) {
                                    setStaffColorHex(user.staffId, current);
                                    setColorError(json.error || 'Could not update your color. Please try again.');
                                    return;
                                  }
                                  if (json.colorHex) setStaffColorHex(user.staffId, json.colorHex);
                                  await queryClient.invalidateQueries({ queryKey: qk.staff.all });
                                } catch {
                                  setStaffColorHex(user.staffId, current);
                                  setColorError('Could not update your color. Please try again.');
                                } finally {
                                  setColorBusy(false);
                                }
                              })();
                            }}
                          />
                          {colorError ? (
                            <div className="px-0.5 pt-1 text-role-micro text-text-danger">{colorError}</div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
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
                      onClick={() => setMenu('feedback')}
                      className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS)}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <span className={SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS}>
                        Report an issue
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
                  {otherOrgs.length > 0 ? (
                    <div className="space-y-0.5 border-t border-border-hairline p-1">
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
                  <div
                    className={cn(
                      SIDEBAR_SPINE_MENU_HEADER_CLASS,
                      'flex-col items-stretch gap-0.5 border-b-0 border-t',
                    )}
                    data-testid="staff-account-org"
                  >
                    <div className={SIDEBAR_SPINE_MENU_TITLE_CLASS}>
                      {staffName || `Staff #${user.staffId}`}
                    </div>
                    <div className={SIDEBAR_SPINE_MENU_META_CLASS}>
                      {user.organizationSlug ?? '—'}
                      {user.organizationPlan ? ` · ${user.organizationPlan} plan` : ''}
                      {' · '}
                      {user.role.replace(/_/g, ' ')}
                    </div>
                    <div className={SIDEBAR_SPINE_MENU_ORG_CLASS}>
                      {user.organizationName}
                    </div>
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
        placement="bottom-end"
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
