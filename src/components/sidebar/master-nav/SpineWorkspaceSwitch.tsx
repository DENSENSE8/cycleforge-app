'use client';

/**
 * Workspace switch rows inside the spine account ⋯ menu — the "very easy" org
 * switch at the bottom of the nav (operator ask, 2026-09-06).
 *
 * Thin composition over the ONE switch contract: {@link useSwitchOrg} /
 * {@link orgInitials} from `@/lib/identity/*` (shared with Settings →
 * Organization's WorkspaceSwitcher). Never fork a second fetch, error map, or
 * reload path — that module's law.
 *
 * Renders only when the account can act in >1 workspace; the current org stays
 * in the menu header (load-bearing org line), so this lists the OTHERS. Click →
 * confirm → POST switch-org → hard reload into the new tenant.
 */

import { ArrowLeftRight } from '@/components/Icons';
import {
  SIDEBAR_SPINE_MENU_ACTION_CLASS,
  SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS,
  SIDEBAR_SPINE_MENU_META_CLASS,
} from '@/components/sidebar/sidebar-spine';
import { useAuth } from '@/contexts/AuthContext';
import { orgInitials } from '@/lib/identity/switch-org';
import { useSwitchOrg } from '@/lib/identity/use-switch-org';
import { cn } from '@/utils/_cn';

export function SpineWorkspaceSwitch() {
  const { user } = useAuth();
  const { switching, switchErr, switchTo } = useSwitchOrg();

  const memberships = user?.memberships ?? [];
  const others = memberships.filter((m) => !m.isCurrent);

  // Single-workspace accounts see nothing — the header's org line is the whole
  // story and a one-row "switcher" to nowhere is noise.
  if (others.length === 0) return null;

  return (
    <div className="border-b border-border-hairline">
      <div className="flex items-center gap-2 px-2 pb-1 pt-1.5">
        <ArrowLeftRight className="h-3 w-3 shrink-0 text-text-muted" aria-hidden />
        <span className="text-role-micro font-semibold uppercase tracking-wide text-text-soft">
          Switch workspace
        </span>
      </div>
      {others.map((m) => {
        const busy = switching === m.organizationId;
        return (
          <button
            key={m.organizationId}
            type="button"
            role="menuitem"
            disabled={!!switching}
            onClick={() => void switchTo(m.organizationId, m.organizationName)}
            className={cn('ds-raw-button', SIDEBAR_SPINE_MENU_ACTION_CLASS, 'py-1.5')}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-strong text-role-micro font-semibold text-text-muted">
              {orgInitials(m.organizationName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn(SIDEBAR_SPINE_MENU_ACTION_LABEL_CLASS, 'block truncate')}>
                {m.organizationName}
              </span>
              <span className={cn(SIDEBAR_SPINE_MENU_META_CLASS, 'block')}>
                {m.organizationSlug ?? '—'}
                {m.role ? ` · ${m.role.replace(/_/g, ' ')}` : ''}
              </span>
            </span>
            {busy ? <span className="text-role-micro text-text-soft">Switching…</span> : null}
          </button>
        );
      })}
      {switchErr ? (
        <p className="px-2 pb-1.5 text-role-micro text-text-danger">{switchErr}</p>
      ) : null}
    </div>
  );
}
