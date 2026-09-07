'use client';

/**
 * `/settings/me` — the Personal settings as ONE scroll page with a sticky
 * anchor-pill strip (2026-09-06 rail removal; simplified same-day after the
 * Impeccable audit). Hardware · Workstation · Quick Access · Appearance ·
 * Keyboard · Receiving · Security · About · Legal are tuned together, so they
 * render stacked with scroll-spy pills; each section keeps its `#<id>` anchor
 * for deep links (`/settings?section=appearance` redirects here).
 *
 * Scroll-spy computes from scroll position (last section whose top passes the
 * sticky band), not IntersectionObserver — the IO band raced `scroll-mt` and
 * reported the section ABOVE the target after anchor jumps (audit P1 #1).
 * Clicking a pill sets `active` synchronously and honors
 * `prefers-reduced-motion` for the scroll behavior.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft } from '@/components/Icons';
import { HardwareSection } from '@/components/settings/sections/HardwareSection';
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

/** Distance from viewport top to the section-identity line: the sticky band
 * (~80px) plus breathing room. Kept in one place so the spy and the CSS
 * `scroll-mt` agree. */
const BAND_OFFSET_PX = 112;

export default function PersonalSettingsPage() {
  const sections = useMemo(
    () => SETTINGS_SECTION_OPTIONS.filter((s) => s.group === 'Personal' && ME_BODIES[s.id]),
    [],
  );
  // Scroll-spy: the active section is the LAST one whose top has passed the
  // band line. The scroll container is this page's own body column (not the
  // window), so the listener and the geometry both target it.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState<string>(sections[0]?.id ?? 'hardware');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => {
      const containerTop = container.getBoundingClientRect().top;
      // Bottom clamp: the last section often cannot scroll its top past the
      // band (there is nothing after it to fill the viewport), so at the
      // bottom of the scroll it wins regardless of geometry.
      const atBottom =
        container.scrollTop + container.clientHeight >= container.scrollHeight - 4;
      if (atBottom && sections.length > 0) {
        setActive(sections[sections.length - 1].id);
        return;
      }
      const line = BAND_OFFSET_PX;
      let current = sections[0]?.id ?? 'hardware';
      for (const s of sections) {
        const el = sectionRefs.current[s.id];
        if (el && el.getBoundingClientRect().top - containerTop <= line) current = s.id;
      }
      setActive(current);
    };
    onScroll();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [sections]);

  const scrollTo = useCallback((id: string) => {
    setActive(id);
    // Scroll THIS container, not scrollIntoView: the generic form also scrolls
    // every other scrollable ancestor (window, sidebar) and compromises, which
    // stopped short of the target on the deep sections.
    const container = scrollRef.current;
    const el = sectionRefs.current[id];
    if (!container || !el) return;
    container.scrollTo({
      top: container.scrollTop + (el.getBoundingClientRect().top - container.getBoundingClientRect().top) - 72,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      {/* Sticky band: back door + title + anchor pills in ONE row. */}
      <div
        className={cn(
          'sticky top-0 z-sticky flex items-center gap-3 overflow-x-auto border-b border-border-soft px-6 py-2.5',
          appChromeMutedClass,
        )}
      >
        <Link
          href="/settings"
          className="inline-flex shrink-0 items-center gap-1 text-role-caption font-semibold text-text-muted hover:text-text-default"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Settings
        </Link>
        <h1 className="shrink-0 text-role-body font-semibold text-text-default">Your setup</h1>
        <span className="h-4 w-px shrink-0 bg-border-soft" aria-hidden />
        <nav aria-label="Your setup sections" className="flex gap-1.5">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollTo(s.id)}
              aria-current={active === s.id ? 'true' : undefined}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-role-caption font-semibold transition-colors',
                active === s.id
                  ? 'bg-surface-inverse text-inverse'
                  : 'bg-surface-sunken text-text-muted hover:text-text-default',
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {sections.map((s) => (
          <section
            key={s.id}
            id={s.id}
            ref={(el) => {
              sectionRefs.current[s.id] = el;
            }}
            className="mx-auto max-w-3xl scroll-mt-28 px-6 py-8"
          >
            <h2 className="mb-4 text-role-eyebrow uppercase tracking-[0.18em] text-text-faint">
              {s.label}
            </h2>
            {ME_BODIES[s.id]()}
          </section>
        ))}
      </div>
    </div>
  );
}
