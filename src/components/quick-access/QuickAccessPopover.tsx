'use client';

import Link from 'next/link';
import { Settings } from '@/components/Icons';
import { useRouter } from 'next/navigation';
import { ActionsSection } from './ActionsSection';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffColorVersion } from '@/contexts/StaffColorsProvider';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Panel, IconButton } from '@/design-system/primitives';
import { StaffAvatar } from '@/components/identity';

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
