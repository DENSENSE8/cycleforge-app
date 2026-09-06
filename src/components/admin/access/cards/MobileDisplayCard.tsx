'use client';

/**
 * Lets an admin override the mobile UI for one staff: (1) bottom-nav enabled
 * toggle, (2) which tabs render. Always shows the *effective* state (role
 * default + override). "Reset to role default" clears the override so the
 * resolver falls back to roles.mobile_defaults (editable in /admin?section=roles).
 */

import { useEffect, useMemo, useState } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, Switch } from '@/design-system/primitives';
import {
  MOBILE_NAV_TAB_IDS,
  resolveMobileDisplayConfig,
  sanitizeMobileDisplayConfig,
  type MobileDisplayConfig,
  type MobileNavTabId,
} from '@/lib/auth/mobile-display-config';
import type { RoleSlim } from '../staff-access-shared';

interface MobileDisplayCardProps {
  borderClass: string;
  rolesForResolve: ReadonlyArray<RoleSlim>;
  staffOverride: unknown;
  busy: boolean;
  onSave: (config: unknown) => void;
  onReset: () => void;
}

const TAB_LABELS: Record<MobileNavTabId, string> = {
  home: 'Recent',
  scan: 'Scan (centre)',
  receiving: 'Receiving',
  packing: 'Packing',
  picks: 'Picks',
  signout: 'Sign out',
};

export function MobileDisplayCard({
  borderClass, rolesForResolve, staffOverride, busy, onSave, onReset,
}: MobileDisplayCardProps) {
  const initialOverride = useMemo(
    () => sanitizeMobileDisplayConfig(staffOverride),
    [staffOverride],
  );

  const resolved: MobileDisplayConfig = useMemo(
    () => resolveMobileDisplayConfig({
      roles: rolesForResolve.map((r) => ({ key: r.key, mobile_defaults: r.mobile_defaults })),
      staffOverride,
    }),
    [rolesForResolve, staffOverride],
  );

  const hasOverride = initialOverride !== null;
  const [draftEnabled, setDraftEnabled] = useState<boolean>(resolved.bottomNav.enabled);
  const [draftTabs, setDraftTabs] = useState<MobileNavTabId[]>([...resolved.bottomNav.tabs]);

  // Resync the draft when the underlying staff/role data changes (e.g. after a save).
  useEffect(() => {
    setDraftEnabled(resolved.bottomNav.enabled);
    setDraftTabs([...resolved.bottomNav.tabs]);
  }, [resolved]);

  const toggleTab = (id: MobileNavTabId) => {
    setDraftTabs((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
  };

  const dirty =
    draftEnabled !== resolved.bottomNav.enabled ||
    draftTabs.length !== resolved.bottomNav.tabs.length ||
    draftTabs.some((t, i) => t !== resolved.bottomNav.tabs[i]);

  const save = () => {
    onSave({
      bottomNav: {
        enabled: draftEnabled,
        tabs: draftTabs.length > 0 ? draftTabs : ['scan'],
      },
    });
  };

  const primaryRoleLabel = rolesForResolve[0]?.label ?? '—';

  return (
    <section className={`overflow-hidden rounded-2xl border ${borderClass} bg-surface-card shadow-sm`}>
      <header className="flex items-center justify-between border-b border-border-hairline px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold text-text-default">Mobile display</h2>
          <p className="mt-0.5 text-role-caption text-text-soft">
            Controls what this staff sees on their phone. Defaults inherit from <b>{primaryRoleLabel}</b>.
            Edit role defaults in <a href="/settings/roles" className="text-text-info hover:underline">Roles</a>.
          </p>
        </div>
        {hasOverride && (
          <HoverTooltip label="Clear per-staff override; fall back to role default" asChild>
            <Button type="button" variant="secondary" size="sm" onClick={onReset} disabled={busy}>
              Reset to role
            </Button>
          </HoverTooltip>
        )}
      </header>

      <div className="space-y-4 px-5 py-4">
        {/* Bottom nav enabled */}
        <label className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-text-default">Bottom navigation bar</div>
            <p className="mt-0.5 text-role-caption text-text-soft">
              When off, the phone is locked to a single page — no tabs to wander into other sections.
            </p>
          </div>
          <Switch
            checked={draftEnabled}
            onCheckedChange={setDraftEnabled}
            disabled={busy}
            aria-label="Bottom navigation bar"
          />
        </label>

        {/* Tabs */}
        <div>
          <div className="text-sm font-semibold text-text-default">Tabs</div>
          <p className="mb-2 mt-0.5 text-role-caption text-text-soft">
            Tap to toggle. Scan stays centre and raised when included.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {MOBILE_NAV_TAB_IDS.map((id) => {
              const on = draftTabs.includes(id);
              return (
                // ds-raw-button: segmented multi-select tab toggle (conditional active fill), not a single DS variant
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleTab(id)}
                  disabled={busy || !draftEnabled}
                  className={`rounded-full px-2.5 py-1 text-role-caption font-semibold ring-1 ring-inset transition ${
                    on
                      ? 'bg-surface-info text-text-info ring-border-info'
                      : 'bg-surface-canvas text-text-soft ring-border-soft hover:bg-surface-sunken'
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {TAB_LABELS[id]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Save row */}
        <div className="flex items-center justify-between gap-3 border-t border-border-hairline pt-3">
          <div className="text-role-micro text-text-soft">
            {hasOverride ? 'Per-staff override active.' : 'Inheriting role default.'}
          </div>
          <Button type="button" variant="brand" size="sm" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Saving…' : dirty ? 'Save override' : 'Saved'}
          </Button>
        </div>
      </div>
    </section>
  );
}
