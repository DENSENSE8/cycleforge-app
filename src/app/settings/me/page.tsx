'use client';

/**
 * `/settings/me` — the Personal settings as ONE scroll page with a sticky
 * anchor-pill strip (2026-09-06 rail removal). Hardware · Workstation · Quick
 * Access · Appearance · Keyboard · Receiving · Security · About · Legal are
 * tuned together, so they render stacked with scroll-spy pills; each section
 * keeps its `#<id>` anchor for deep links (`/settings?section=appearance`
 * redirects here with the fragment).
 *
 * Pills are navigation, not chrome: clicking scrolls smoothly; the active pill
 * follows the section in view (IntersectionObserver). The strip is sticky under
 * the page top so it survives the whole scroll.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from '@/components/Icons';
import {
  HardwareSection,
} from '@/components/settings/sections/HardwareSection';
import { WorkstationSection } from '@/components/settings/sections/WorkstationSection';
import { QuickAccessSection } from '@/components/settings/sections/QuickAccessSection';
import { AppearanceSection } from '@/components/settings/sections/AppearanceSection';
import { KeyboardSection } from '@/components/settings/sections/KeyboardSection';
import { SecuritySection } from '@/components/settings/sections/SecuritySection';
import { AboutSection } from '@/components/settings/sections/AboutSection';
import { LegalSection } from '@/components/settings/sections/LegalSection';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { SETTINGS_SECTION_OPTIONS } from '@/components/settings/settings-sections';
import { appChromeMutedClass } from '@/design-system/tokens/app-surface';
import { cn } from '@/utils/_cn';

/** Registry-driven org-policy panel — the one Personal body that is not a
 * hand-written section component. */
function ReceivingSettingsSection() {
  return <SettingsPanel page="receiving" />;
}

/** Section id → rendered body. */
const ME_BODIES: Record<string, () => React.ReactNode> = {
  hardware: () => <HardwareSection />,
  workstation: () => <WorkstationSection />,
  'quick-access': () => <QuickAccessSection />,
  appearance: () => <AppearanceSection />,
  keyboard: () => <KeyboardSection />,
  receiving: () => <ReceivingSettingsSection />,
  security: () => <SecuritySection />,
  about: () => <AboutSection />,
  legal: () => <LegalSection />,
};

export default function PersonalSettingsPage() {
  const sections = useMemo(
    () => SETTINGS_SECTION_OPTIONS.filter((s) => s.group === 'Personal' && ME_BODIES[s.id]),
    [],
  );
  const [active, setActive] = useState<string>(sections[0]?.id ?? 'hardware');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // The topmost section intersecting the band wins.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      { rootMargin: '-96px 0px -60% 0px', threshold: 0 },
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observerRef.current.observe(el);
    }
    return () => observerRef.current?.disconnect();
  }, [sections]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      {/* Sticky band: back door + anchor pills. */}
      <div
        className={cn(
          'sticky top-0 z-sticky flex flex-col gap-2 border-b border-border-soft px-6 py-3',
          appChromeMutedClass,
        )}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1 text-role-caption font-semibold text-text-muted hover:text-text-default"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            Settings
          </Link>
          <span className="text-role-caption text-text-faint" aria-hidden>·</span>
          <h1 className="text-role-body font-semibold text-text-default">Your setup</h1>
        </div>
        <nav aria-label="Your setup sections" className="flex gap-1.5 overflow-x-auto pb-0.5">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              aria-current={active === s.id ? 'true' : undefined}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-role-caption font-semibold transition-colors',
                active === s.id
                  ? 'bg-surface-inverse text-white'
                  : 'bg-surface-sunken text-text-muted hover:text-text-default',
              )}
            >
              {s.label}
            </a>
          ))}
        </nav>
      </div>

      <main className="flex-1 overflow-y-auto">
        {sections.map((s) => (
          <section
            key={s.id}
            id={s.id}
            className="mx-auto max-w-3xl scroll-mt-28 px-6 py-8"
          >
            <h2 className="mb-4 text-role-eyebrow uppercase tracking-[0.18em] text-text-faint">
              {s.label}
            </h2>
            {ME_BODIES[s.id]()}
          </section>
        ))}
      </main>
    </div>
  );
}
