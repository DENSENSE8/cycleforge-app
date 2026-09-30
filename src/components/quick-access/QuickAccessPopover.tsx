'use client';

import Link from 'next/link';
import { Bell, Settings } from '@/components/Icons';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ActionsSection } from './ActionsSection';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { InboxContactLinks } from '@/components/ui/InboxContactLinks';
import { Panel, IconButton } from '@/design-system/primitives';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { StaffAvatar } from '@/components/identity';
import {
  DURABLE_INBOX_QUERY_KEY,
  followUpDueLabel,
  useFollowUpAlerts,
} from '@/lib/notifications/use-durable-inbox';
import type { InboxItemDto } from '@/lib/notifications/types';

interface QuickAccessPopoverProps {
  onClose: () => void;
  onOpenHistoryPopover: () => void;
  /** Opens the report-an-issue feedback popover. */
  onOpenFeedbackPopover?: () => void;
  /**
   * Mobile: collapse the popover to just the staff identity row (avatar, name,
   * settings, sign-out). Action sections are desktop-only.
   */
  compact?: boolean;
}

/** Mobile / FAB account menu body (desktop staff identity lives on the MasterNav spine footer — {@link StaffAccountFooter}). */
export function QuickAccessPopover({
  onClose,
  onOpenHistoryPopover,
  onOpenFeedbackPopover,
  compact = false,
}: QuickAccessPopoverProps) {
  const { settings } = useQuickAccess();
  const router = useRouter();
  const { user, signOut } = useAuth();

  useStaffColorVersion();

  const staffName = user?.name ?? '';

  return (
    <Panel radius="2xl" padding="none" elevation="md" className="flex max-h-[calc(100vh-6rem)] w-[340px] flex-col overflow-hidden" role="dialog"
      aria-label="Quick access">
      {compact && onOpenFeedbackPopover ? (
        <ActionsSection
          actions={{ phoneHistory: false }}
          onOpenHistoryPopover={() => {}}
          onOpenFeedbackPopover={onOpenFeedbackPopover}
          onClose={onClose}
        />
      ) : null}

      <FollowUpAlerts onClose={onClose} />

      {!compact && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <ActionsSection
            actions={settings.actions}
            onOpenHistoryPopover={onOpenHistoryPopover}
            onOpenFeedbackPopover={onOpenFeedbackPopover}
            onClose={onClose}
          />
        </div>
      )}

      {user ? (
        <div className="flex shrink-0 items-center gap-3 border-t border-border-hairline bg-surface-canvas/60 px-4 py-3">
          <StaffAvatar staffId={user.staffId} name={staffName} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-role-eyebrow text-text-faint">
              {user.organizationName}
            </div>
            <div className="truncate text-sm font-semibold text-text-default">
              {staffName || `Staff #${user.staffId}`}
            </div>
            <div className="truncate text-role-micro font-medium text-text-soft">
              {user.role.replace(/_/g, ' ')}
            </div>
          </div>
          <Link
            href="/settings/me#quick-access"
            onClick={onClose}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-faint transition hover:bg-surface-card hover:text-text-default"
            aria-label="Manage in Settings"
            title="Manage in Settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </Link>
          <HoverTooltip label="Sign out" asChild>
            <IconButton
              onClick={() => { void signOut(); }}
              ariaLabel="Sign out"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-faint hover:bg-surface-card hover:text-text-default"
              icon={<svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>}
            />
          </HoverTooltip>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { onClose(); router.push('/signin'); }}
          className="ds-raw-button flex shrink-0 items-center justify-between border-t border-border-hairline bg-surface-canvas/60 px-4 py-3 text-left transition hover:bg-surface-sunken"
        >
          <span className="text-sm font-semibold text-text-default">Sign in</span>
          <span className="text-role-caption text-text-soft">Pick a staff →</span>
        </button>
      )}
    </Panel>
  );
}

/** R7 — unread "follow up on this task" alerts, newest first. Opening one reads it. */
function FollowUpAlerts({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const alerts = useFollowUpAlerts({ enabled: Boolean(user?.staffId) });
  const { getStaffName } = useStaffNameMap();
  if (alerts.length === 0) return null;
  // The phone opens a task in its own sheet (`/m/home?task=`); the desk on the board.
  const phone = pathname?.startsWith('/m') ?? false;

  const open = (item: InboxItemDto) => {
    onClose();
    queryClient.setQueryData<InboxItemDto[]>(DURABLE_INBOX_QUERY_KEY, (prev) => (prev ?? []).filter((x) => x.id !== item.id));
    void fetch(`/api/inbox/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read' }),
    }).finally(() => void queryClient.invalidateQueries({ queryKey: DURABLE_INBOX_QUERY_KEY }));
  };

  return (
    <section aria-label="Alerts" className="shrink-0 border-b border-border-hairline" data-testid="quick-access-alerts">
      <p className="px-4 pb-1 pt-3 text-role-eyebrow text-text-faint">Alerts</p>
      <ul className="max-h-60 overflow-y-auto overscroll-contain pb-1">
        {alerts.map((item) => (
          <li key={item.id} className="transition hover:bg-surface-sunken">
            <Link
              href={phone ? `/m/home?task=${item.entityId}` : item.href}
              onClick={() => open(item)}
              className={`flex min-h-11 items-start gap-2.5 px-4 pt-2 ${item.contacts.length > 0 ? 'pb-1' : 'pb-2'}`}
              data-inbox-item-id={item.id}
            >
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-text-warning" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-text-default">
                  {item.eventLabel}: {item.title ?? `Task ${item.entityId}`}
                </span>
                <span className="block truncate text-role-micro text-text-soft">
                  {[followUpDueLabel(item.dueAt), item.note].filter(Boolean).join(' · ') || `Task ${item.entityId}`}
                  {item.actorStaffId ? (
                    <>
                      {' · from '}
                      <StaffBadge staffId={item.actorStaffId} name={getStaffName(item.actorStaffId)} className="font-semibold" />
                    </>
                  ) : null}
                </span>
              </span>
            </Link>
            {/* The contacts the task linked when the alert was sent — doors of their own, so outside the row's link. */}
            <InboxContactLinks contacts={item.contacts} surface={phone ? 'phone' : 'desk'} className="pb-2 pl-[2.625rem] pr-4" />
          </li>
        ))}
      </ul>
    </section>
  );
}
