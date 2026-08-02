'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  SIDEBAR_MASTER_NAV_MODE_GAP,
  SIDEBAR_MASTER_NAV_MODE_PAD_X,
} from '@/components/layout/header-shell';
import { ChevronDown, Settings } from '@/components/Icons';
import { IdentityMark } from '@/components/identity';
import { AnchoredLayer } from '@/design-system';
import { useAuth } from '@/contexts/AuthContext';
import { orgInitials } from '@/lib/identity/switch-org';
import { useSwitchOrg } from '@/lib/identity/use-switch-org';
import { cn } from '@/utils/_cn';

/**
 * Spine top band — current workspace + its menu. Replaces the former “name of
 * now” page label; page selection lives in the spine body selected row.
 *
 * The trigger is ALWAYS a dropdown, single-org included. A control that is a
 * button for some accounts and inert text for others teaches two different
 * affordances for one slot, and the single-org menu still has a job: it names
 * the workspace in full and routes to Settings → Organization, which is
 * otherwise three clicks away.
 *
 * The mark is the shared circular {@link IdentityMark} at the same `sm`
 * density as {@link StaffAccountFooter} — the two ends of the spine read as one
 * identity family, which is exactly what a hand-typed `rounded-md` here lost.
 */
export function OrgWorkspaceControl({ className }: { className?: string }) {
  const { user, has } = useAuth();
  const { switching, switchErr, switchTo } = useSwitchOrg();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  if (!user) return null;

  const memberships = user.memberships ?? [];
  const others = memberships.filter((m) => !m.isCurrent);
  const canSwitch = others.length > 0;

  return (
    <div className={cn('flex h-full w-full min-w-0 items-stretch', className)}>
      <div
        ref={anchorRef}
        className={cn(
          'flex min-w-0 flex-1 items-center',
          SIDEBAR_MASTER_NAV_MODE_GAP,
          SIDEBAR_MASTER_NAV_MODE_PAD_X,
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={
            canSwitch
              ? `Workspace: ${user.organizationName}. Switch workspace`
              : `Workspace: ${user.organizationName}`
          }
          aria-expanded={open}
          aria-haspopup="listbox"
          disabled={!!switching}
          className={cn(
            'ds-raw-button flex min-w-0 flex-1 items-center rounded-md py-1 transition',
            SIDEBAR_MASTER_NAV_MODE_GAP,
            'hover:bg-surface-hover disabled:opacity-60',
          )}
        >
          <IdentityMark initials={orgInitials(user.organizationName)} size="sm" />
          <span
            data-master-nav-org
            className="min-w-0 truncate text-role-body font-semibold leading-tight tracking-tight text-text-default"
          >
            {user.organizationName}
          </span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-text-faint transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        </button>
      </div>

      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="bottom-start"
        gap={4}
      >
        <div
          role="listbox"
          aria-label="Switch workspace"
          className="w-[260px] overflow-hidden rounded-xl border border-border-soft bg-surface-card shadow-xl"
        >
          <div className="flex items-center gap-2.5 border-b border-border-hairline px-3 py-2">
            <IdentityMark initials={orgInitials(user.organizationName)} size="sm" />
            <div className="min-w-0">
              <div className="truncate text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">
                Current
              </div>
              <div className="truncate text-sm font-semibold text-text-default">
                {user.organizationName}
              </div>
            </div>
          </div>
          {switchErr ? (
            <div className="mx-2 mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-role-caption text-rose-700 ring-1 ring-inset ring-rose-200">
              {switchErr}
            </div>
          ) : null}
          {canSwitch ? (
            <div className="max-h-[240px] overflow-y-auto py-1">
              {others.map((m) => (
                <button
                  key={m.organizationId}
                  type="button"
                  role="option"
                  disabled={!!switching}
                  onClick={() => {
                    setOpen(false);
                    void switchTo(m.organizationId, m.organizationName);
                  }}
                  className="ds-raw-button flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-surface-hover disabled:opacity-50"
                >
                  <IdentityMark
                    initials={orgInitials(m.organizationName)}
                    size="sm"
                    className="bg-surface-strong text-text-muted"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-text-default">
                      {m.organizationName}
                    </span>
                    <span className="block truncate text-role-caption text-text-soft">
                      {m.organizationSlug ?? '—'}
                      {m.role ? ` · ${m.role.replace(/_/g, ' ')}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-role-caption text-text-faint">
                    {switching === m.organizationId ? '…' : 'Switch'}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {/* Settings → Organization is `admin.view`-gated, so a floor operator
              gets the naming half of this menu and no dead link. */}
          {has('admin.view') ? (
            <div className="border-t border-border-hairline p-1.5">
              <Link
                href="/settings/organization"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition hover:bg-surface-hover"
              >
                <Settings className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                <span className="text-sm font-medium text-text-default">Workspace settings</span>
              </Link>
            </div>
          ) : null}
        </div>
      </AnchoredLayer>
    </div>
  );
}
