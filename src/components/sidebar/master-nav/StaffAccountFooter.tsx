'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare, MoreHorizontal, Settings, Smartphone } from '@/components/Icons';
import { AnchoredLayer } from '@/design-system';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { StaffAvatar } from '@/components/identity';
import { PhoneHistoryPopover } from '@/components/quick-access/PhoneHistoryPopover';
import { FeedbackPopover } from '@/components/quick-access/FeedbackWidget';
import { useAuth } from '@/contexts/AuthContext';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import { cn } from '@/utils/_cn';

type OpenMenu = 'none' | 'more' | 'history' | 'feedback';

/**
 * Spine footer below Settings/Admin — staff identity, more-details menu, and
 * quick sign-out. Phone history + report-an-issue live here so removing the
 * GlobalHeader avatar does not orphan them. Kiosk stays header-only.
 */
export function StaffAccountFooter({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { settings } = useQuickAccess();
  const [menu, setMenu] = useState<OpenMenu>('none');
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenu('none');
  }, [pathname]);

  if (!user) return null;

  const staffName = user.name ?? '';
  const showPhoneHistory = !!settings.actions.phoneHistory;
  const moreOpen = menu === 'more';

  return (
    <div
      className={cn('border-t border-border-soft p-1', className)}
      data-staff-account-footer
    >
      <div ref={anchorRef} className="flex min-w-0 items-center gap-1.5 px-1 py-1">
        {/* Photo id resolves from the staff identity cache, which
            <StaffColorsProvider> seeds from the auth envelope on boot — so this
            paints the photo on first render, not after the /api/staff fetch. */}
        <StaffAvatar staffId={user.staffId} name={staffName} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-role-caption font-semibold leading-tight text-text-default">
            {staffName || `Staff #${user.staffId}`}
          </div>
          <div className="truncate text-role-micro font-medium uppercase tracking-[0.12em] text-text-soft">
            {user.role.replace(/_/g, ' ')}
          </div>
        </div>
        <HoverTooltip label="Account details" asChild>
          <IconButton
            type="button"
            size="sm"
            onClick={() => setMenu((m) => (m === 'more' ? 'none' : 'more'))}
            ariaLabel="Account details"
            aria-expanded={moreOpen}
            className="shrink-0 rounded-md text-text-faint hover:bg-surface-hover hover:text-text-default"
            icon={<MoreHorizontal className="h-3.5 w-3.5" />}
          />
        </HoverTooltip>
        <HoverTooltip label="Sign out" asChild>
          <IconButton
            type="button"
            size="sm"
            onClick={() => {
              void signOut();
            }}
            ariaLabel="Sign out"
            className="shrink-0 rounded-md text-text-faint hover:bg-surface-hover hover:text-text-default"
            icon={
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            }
          />
        </HoverTooltip>
      </div>

      <AnchoredLayer
        open={moreOpen}
        onClose={() => setMenu('none')}
        anchorRef={anchorRef}
        placement="top-start"
        gap={4}
      >
        <div
          role="menu"
          aria-label="Account details"
          className="w-[280px] overflow-hidden rounded-xl border border-border-soft bg-surface-card shadow-xl"
        >
          <div className="border-b border-border-hairline px-3 py-2.5">
            <div className="truncate text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">
              {user.organizationName}
            </div>
            <div className="truncate text-sm font-semibold text-text-default">
              {staffName || `Staff #${user.staffId}`}
            </div>
            <div className="truncate text-role-caption text-text-soft">
              {user.organizationSlug ?? '—'}
              {user.organizationPlan ? ` · ${user.organizationPlan} plan` : ''}
              {' · '}
              {user.role.replace(/_/g, ' ')}
            </div>
          </div>
          <div className="space-y-0.5 p-1.5">
            {showPhoneHistory ? (
              <button
                type="button"
                onClick={() => setMenu('history')}
                className="ds-raw-button flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-surface-hover"
              >
                <Smartphone className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                <span className="text-sm font-medium text-text-default">Phone history</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setMenu('feedback')}
              className="ds-raw-button flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-surface-hover"
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <span className="text-sm font-medium text-text-default">Report an issue</span>
            </button>
            <Link
              href="/settings?section=quick-access"
              onClick={() => setMenu('none')}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-surface-hover"
            >
              <Settings className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <span className="text-sm font-medium text-text-default">Quick Access settings</span>
            </Link>
          </div>
        </div>
      </AnchoredLayer>

      <AnchoredLayer
        open={menu === 'history'}
        onClose={() => setMenu('none')}
        anchorRef={anchorRef}
        placement="top-start"
        gap={4}
      >
        <PhoneHistoryPopover onClose={() => setMenu('none')} />
      </AnchoredLayer>

      <AnchoredLayer
        open={menu === 'feedback'}
        onClose={() => setMenu('none')}
        anchorRef={anchorRef}
        placement="top-start"
        gap={4}
      >
        <FeedbackPopover onClose={() => setMenu('none')} />
      </AnchoredLayer>
    </div>
  );
}
