'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  SIDEBAR_MASTER_NAV_MODE_GAP,
  SIDEBAR_MASTER_NAV_MODE_PAD_X,
} from '@/components/layout/header-shell';
import {
  SIDEBAR_SPINE_MENU_ACTION_CLASS,
  SIDEBAR_SPINE_MENU_HEADER_CLASS,
  SIDEBAR_SPINE_MENU_PANEL_CLASS,
} from '@/components/sidebar/sidebar-spine';
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
 *
 * Menu is a **child of the trigger**: `bottom-stretch` on the button (not the
 * full column), dense chrome + caption type — never a wider/chunkier twin.
 */
export function OrgWorkspaceControl({ className }: { className?: string }) {
  const { user, has } = useAuth();
  const { switching, switchErr, switchTo } = useSwitchOrg();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  if (!user) return null;

  const memberships = user.memberships ?? [];
  const others = memberships.filter((m) => !m.isCurrent);
  const canSwitch = others.length > 0;

  return (
    <div className={cn('flex h-full w-full min-w-0 items-stretch', className)}>
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center',
          SIDEBAR_MASTER_NAV_MODE_GAP,
          SIDEBAR_MASTER_NAV_MODE_PAD_X,
        )}
      >
        <button
          ref={triggerRef}
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
        anchorRef={triggerRef}
        placement="bottom-stretch"
        gap={4}
      >
        <div
          role="listbox"
          aria-label="Switch workspace"
          className={SIDEBAR_SPINE_MENU_PANEL_CLASS}
        >
          <div className={SIDEBAR_SPINE_MENU_HEADER_CLASS}>
            <IdentityMark initials={orgInitials(user.organizationName)} size="xs" />
            <div className="min-w-0">
              <div className="truncate text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">
                Current
              </div>
              <div className="truncate text-role-caption font-semibold leading-tight text-text-default">
                {user.organizationName}
              </div>
            </div>
          </div>
          {switchErr ? (
            <div className="mx-1.5 mt-1 rounded-md bg-rose-50 px-2 py-1 text-role-micro text-rose-700 ring-1 ring-inset ring-rose-200">
              {switchErr}
            </div>
          ) : null}
          {canSwitch ? (
            <div className="max-h-[200px] overflow-y-auto py-0.5">
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
                  className={cn(
                    'ds-raw-button disabled:opacity-50',
                    SIDEBAR_SPINE_MENU_ACTION_CLASS,
                  )}
                >
                  <IdentityMark
                    initials={orgInitials(m.organizationName)}
                    size="xs"
                    className="bg-surface-strong text-text-muted"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-role-caption font-semibold leading-tight text-text-default">
                      {m.organizationName}
                    </span>
                    <span className="block truncate text-role-micro text-text-soft">
                      {m.organizationSlug ?? '—'}
                      {m.role ? ` · ${m.role.replace(/_/g, ' ')}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-role-micro text-text-faint">
                    {switching === m.organizationId ? '…' : 'Switch'}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {/* Settings → Organization is `admin.view`-gated, so a floor operator
              gets the naming half of this menu and no dead link. */}
          {has('admin.view') ? (
            <div className="border-t border-border-hairline p-1">
              <Link
                href="/settings/organization"
                onClick={() => setOpen(false)}
                className={SIDEBAR_SPINE_MENU_ACTION_CLASS}
              >
                <Settings className="h-3 w-3 shrink-0 text-text-muted" />
                <span className="text-role-caption font-medium text-text-default">
                  Workspace settings
                </span>
              </Link>
            </div>
          ) : null}
        </div>
      </AnchoredLayer>
    </div>
  );
}
