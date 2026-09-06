'use client';

/**
 * `/settings` landing — grouped card grid (2026-09-06 rail removal). The
 * Personal sections collapse into one "Your setup" card linking the
 * `/settings/me` scroll page; the org sections group into category clusters in
 * the same visual language as the `/apps` marketplace listing (eyebrow header +
 * two-column card grid). Permission gating is the registry's `requires`.
 *
 * What this replaces: the SettingsSidebar context rail — on a surface that
 * already sits beside the app spine, a second vertical rail was double-sidebar
 * chrome. Cards carry the same label/description data the rail did.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import {
  SETTINGS_CATEGORY_LABELS,
  SETTINGS_SECTION_CATEGORY,
  SETTINGS_SECTION_OPTIONS,
  type SettingsCategory,
} from '@/components/settings/settings-sections';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/_cn';

const CATEGORY_ORDER: SettingsCategory[] = [
  'workspace', 'apps', 'people', 'data', 'devices', 'developer',
];

export function SettingsLanding() {
  const { has, isLoaded, user } = useAuth();

  const personal = useMemo(
    () => SETTINGS_SECTION_OPTIONS.filter((s) => s.group === 'Personal'),
    [],
  );

  const visibleOrg = useMemo(
    () =>
      SETTINGS_SECTION_OPTIONS.filter((s) => {
        if (s.group !== 'Organization') return false;
        if (!s.requires) return true;
        return isLoaded && has(s.requires);
      }),
    [has, isLoaded],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <div>
        <h1 className="text-role-title font-semibold text-text-default">Settings</h1>
        <p className="mt-1 text-role-data text-text-soft">
          Your setup and this workspace&apos;s configuration. Sections are also one
          ⌘K away.
        </p>
      </div>

      {/* Your setup — the personal scroll page door */}
      <section className="space-y-3">
        <h2 className="text-role-caption font-semibold uppercase tracking-[0.18em] text-text-faint">
          Your setup
        </h2>
        <Link
          href="/settings/me"
          className="block rounded-2xl border border-border-soft bg-surface-card p-5 transition-colors hover:border-border-default hover:bg-surface-hover"
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-role-body font-semibold text-text-default">
              Hardware · Workstation · Appearance · Keyboard · Security…
            </p>
            <span className="shrink-0 text-role-caption font-semibold text-text-info">Open →</span>
          </div>
          <p className="mt-1 text-role-data text-text-soft">
            {personal.map((s) => s.label).join(' · ')}
          </p>
        </Link>
      </section>

      {CATEGORY_ORDER.map((category) => {
        const sections = visibleOrg.filter(
          (s) => SETTINGS_SECTION_CATEGORY[s.id as keyof typeof SETTINGS_SECTION_CATEGORY] === category,
        );
        if (sections.length === 0) return null;
        return (
          <section key={category} className="space-y-3">
            <h2 className="text-role-caption font-semibold uppercase tracking-[0.18em] text-text-faint">
              {SETTINGS_CATEGORY_LABELS[category]}
            </h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {sections.map((s) => {
                const Icon = s.icon;
                return (
                  <Link
                    key={s.id}
                    href={s.href ?? `/settings/${s.id}`}
                    className={cn(
                      'flex items-start gap-3 rounded-2xl border border-border-soft bg-surface-card p-4',
                      'transition-colors hover:border-border-default hover:bg-surface-hover',
                    )}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-muted">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-role-body font-semibold text-text-default">
                        {s.label}
                      </span>
                      <span className="mt-0.5 block text-role-data text-text-soft">
                        {s.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      {!isLoaded || user ? null : (
        <p className="text-role-caption text-text-faint">Sign in to see workspace sections.</p>
      )}
    </div>
  );
}
