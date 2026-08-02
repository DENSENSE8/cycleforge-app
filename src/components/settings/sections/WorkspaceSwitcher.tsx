'use client';

// MOUNT: render <WorkspaceSwitcher /> inside OrganizationSection.tsx (e.g. just
// below ActiveWorkspaceCard) — self-contained, reads memberships from useAuth().

/**
 * Settings → Organization · "Switch workspace".
 *
 * Lists every OTHER workspace the signed-in account can act in (memberships
 * from the auth envelope, minus the current org) and switches via
 * {@link useSwitchOrg} / {@link orgInitials} (shared with the MasterNav spine
 * org control). The whole block renders only when the account belongs to >1
 * workspace — a single-org account sees nothing.
 */

import { Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { orgInitials } from '@/lib/identity/switch-org';
import { useSwitchOrg } from '@/lib/identity/use-switch-org';

export function WorkspaceSwitcher() {
  const { user } = useAuth();
  const { switching, switchErr, switchTo } = useSwitchOrg();

  const memberships = user?.memberships ?? [];
  const others = memberships.filter((m) => !m.isCurrent);

  // Only surface the switcher when the account has another workspace to go to.
  if (!user || memberships.length <= 1 || others.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-border-soft bg-surface-card p-5 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-text-default">Switch workspace</h3>
        <p className="text-xs text-text-soft">
          This account can act in {memberships.length} workspaces. Switching closes
          your current view and reloads into the selected workspace.
        </p>
      </div>

      {switchErr && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
          {switchErr}
        </div>
      )}

      <div className="divide-y divide-border-hairline overflow-hidden rounded-xl border border-border-soft">
        {others.map((m) => (
          <div
            key={m.organizationId}
            className="flex items-center gap-3 px-3 py-2.5"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-strong text-xs font-semibold text-text-muted">
              {orgInitials(m.organizationName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-text-default">
                {m.organizationName}
              </div>
              <div className="truncate text-xs text-text-soft">
                {m.organizationSlug ?? '—'}
                {m.role ? ` · ${m.role.replace(/_/g, ' ')}` : ''}
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={switching === m.organizationId}
              disabled={!!switching}
              onClick={() => void switchTo(m.organizationId, m.organizationName)}
            >
              {switching === m.organizationId ? 'Switching…' : 'Switch'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
