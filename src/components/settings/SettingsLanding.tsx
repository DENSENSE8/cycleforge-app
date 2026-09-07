'use client';

/**
 * `/settings` landing — grouped card grid (2026-09-06 rail removal; simplified
 * same-day after the Impeccable critique). The Personal sections collapse into
 * one "Your setup" card linking the `/settings/me` scroll page; the org
 * sections group into category clusters in the same visual language as the
 * `/apps` marketplace listing (eyebrow header + two-column card grid).
 * Permission gating is the registry's `requires`.
 *
 * Simplifications applied: one line of copy on the Your-setup card (it used to
 * list all nine sections twice), categories with a single section render
 * headerless (a wrapper heading that adds no choice is scan cost), and the
 * card-link class is exported once for other surfaces (SuppliersPane rows).
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

/** One card-link idiom for settings-family surfaces (landing cards, supplier
 * rows): soft border, card fill, hover lift. */
export const SETTINGS_CARD_LINK_CLASS = cn(
  'block rounded-2xl border border-border-soft bg-surface-card p-4',
  'transition-colors hover:border-border-default hover:bg-surface-hover',
);

export function SettingsLanding() {
  const { has, isLoaded } = useAuth();

  const personalLabels = useMemo(
    () =>
      SETTINGS_SECTION_OPTIONS.filter((s) => s.group === 'Personal').map((s) => s.label),
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
        <Link href="/settings/me" className={SETTINGS_CARD_LINK_CLASS}>
          <p className="text-role-body font-semibold text-text-default">
            {personalLabels.join(' · ')}
          </p>
          <p className="mt-1 text-role-data text-text-soft">
            Tuned together on one page — open to adjust yours.
          </p>
        </Link>
      </section>

      {CATEGORY_ORDER.map((category) => {
        const sections = visibleOrg.filter((s) => SETTINGS_SECTION_CATEGORY[s.id] === category);
        if (sections.length === 0) return null;
        // A single-section category renders headerless: the card's own label
        // already says what the header would.
        const header =
          sections.length > 1 ? (
            <h2 className="text-role-caption font-semibold uppercase tracking-[0.18em] text-text-faint">
              {SETTINGS_CATEGORY_LABELS[category]}
            </h2>
          ) : null;
        return (
          <section key={category} className={cn('space-y-3', !header && 'space-y-0')}>
            {header}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {sections.map((s) => {
                const Icon = s.icon;
                return (
                  <Link
                    key={s.id}
                    href={s.href ?? `/settings/${s.id}`}
                    className={cn(SETTINGS_CARD_LINK_CLASS, 'flex items-start gap-3')}
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
    </div>
  );
}
